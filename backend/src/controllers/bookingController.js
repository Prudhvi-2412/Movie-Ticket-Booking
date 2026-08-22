const db = require('../config/db');
const config = require('../config/env');
const {
  acquireSeatLocks, verifySeatLocks, releaseSeatLocks, getRemainingLockSeconds
} = require('../redis/seatLock');
const { quote } = require('../services/pricingService');
const { emitBookingCreated, emitBookingCancelled, emitSeatReleased } = require('../kafka/producer');
const { ApiError, asyncHandler } = require('../utils/ApiError');
const logger = require('../utils/logger');
const { bookingCounter } = require('../utils/metrics');

const BOOKING_SELECT = `
  SELECT b.booking_id, b.booking_ref, b.user_id, b.show_id,
         b.seat_amount, b.convenience_fee, b.tax_amount, b.discount_amount, b.total_amount,
         b.status, b.expires_at, b.booking_time, b.confirmed_at, b.cancelled_at,
         s.show_time, s.end_time,
         m.movie_id, m.title AS movie_title, m.poster_url, m.language, m.certificate, m.duration_minutes,
         sc.screen_number, sc.name AS screen_name, sc.screen_type,
         t.theater_id, t.name AS theater_name, t.location AS theater_locality, t.address AS theater_address,
         l.city,
         p.transaction_id, p.payment_method, p.payment_status, p.payment_time
    FROM bookings b
    JOIN shows s     ON s.show_id = b.show_id
    JOIN movies m    ON m.movie_id = s.movie_id
    JOIN screens sc  ON sc.screen_id = s.screen_id
    JOIN theaters t  ON t.theater_id = sc.theater_id
    JOIN locations l ON l.location_id = t.location_id
    LEFT JOIN payments p ON p.booking_id = b.booking_id AND p.payment_status = 'Success'
`;

/** Attaches the seat list to each booking in one extra query rather than N. */
const attachSeats = async (bookings) => {
  if (bookings.length === 0) return bookings;

  const ids = bookings.map((b) => b.booking_id);
  const rows = await db.query(
    `SELECT bs.booking_id, bs.seat_price, s.seat_id, s.seat_row, s.seat_number, s.seat_type
       FROM booking_seats bs
       JOIN seats s ON s.seat_id = bs.seat_id
      WHERE bs.booking_id IN (${ids.map(() => '?').join(',')})
      ORDER BY s.seat_row, s.seat_number`,
    ids
  );

  const byBooking = new Map(ids.map((id) => [id, []]));
  for (const row of rows) {
    byBooking.get(row.booking_id).push({
      seat_id: row.seat_id,
      seat_row: row.seat_row,
      seat_number: row.seat_number,
      seat_type: row.seat_type,
      label: `${row.seat_row}${row.seat_number}`,
      price: Number(row.seat_price)
    });
  }

  return bookings.map((b) => ({ ...b, seats: byBooking.get(b.booking_id) || [] }));
};

/**
 * POST /api/bookings/lock-seats
 *
 * Step one of checkout: take the distributed hold and return the *server's*
 * price for the selection. The response carries the real Redis TTL, so the
 * countdown the customer sees is the deadline that actually applies rather
 * than a hardcoded ten minutes in the browser.
 */
const lockSeats = asyncHandler(async (req, res) => {
  const { showId, seatIds } = req.body;
  const userId = req.user.userId;

  if (seatIds.length > config.MAX_SEATS_PER_BOOKING) {
    throw ApiError.badRequest(`You can book at most ${config.MAX_SEATS_PER_BOOKING} seats at a time.`);
  }

  const shows = await db.query(
    `SELECT show_id, show_time FROM shows
      WHERE show_id = ? AND is_active = TRUE AND status = 'Scheduled' AND show_time > NOW()`,
    [showId]
  );
  if (shows.length === 0) throw ApiError.gone('This show is no longer open for booking.');

  // Price before locking so a pricing failure does not strand a held seat.
  const { lines, summary } = await quote(showId, seatIds);

  const lock = await acquireSeatLocks(showId, seatIds, userId);
  if (!lock.success) {
    return res.status(409).json({
      success: false,
      message: lock.message,
      reason: lock.reason,
      conflictSeats: lock.conflictSeats
    });
  }

  return res.json({
    success: true,
    message: `${seatIds.length} seat(s) held for you.`,
    hold: {
      showId,
      seatIds: lock.seatIds,
      expiresInSeconds: lock.expiresInSeconds,
      expiresAt: lock.lockedUntil
    },
    seats: lines,
    summary
  });
});

/**
 * POST /api/bookings
 *
 * Step two: turn a live hold into a pending booking.
 *
 * Two things the old handler did not do. It never checked that the caller
 * actually held the Redis locks, so a client could skip lock-seats entirely
 * and book seats another customer was mid-checkout on. And it wrote
 * `totalAmount` straight from the request body, so the price was whatever
 * the client claimed. Both are fixed here: the hold is verified, and the
 * total is recomputed server-side and passed to the CreateBooking procedure.
 */
const createBooking = asyncHandler(async (req, res) => {
  const { showId, seatIds } = req.body;
  const userId = req.user.userId;

  if (seatIds.length > config.MAX_SEATS_PER_BOOKING) {
    throw ApiError.badRequest(`You can book at most ${config.MAX_SEATS_PER_BOOKING} seats at a time.`);
  }

  const held = await verifySeatLocks(showId, seatIds, userId);
  if (!held.valid) {
    const expired = held.missing.filter((m) => m.reason === 'EXPIRED');
    bookingCounter.inc({ status: 'failed' });
    throw ApiError.conflict(
      expired.length === held.missing.length
        ? 'Your seat hold expired. Please select your seats again.'
        : 'Some of those seats are now held by another customer. Please select again.',
      { code: 'SEAT_HOLD_LOST', details: held.missing }
    );
  }

  const { lines, summary } = await quote(showId, seatIds);
  const remaining = await getRemainingLockSeconds(showId, seatIds);
  if (remaining <= 0) {
    throw ApiError.conflict('Your seat hold expired. Please select your seats again.', { code: 'SEAT_HOLD_LOST' });
  }

  const seatsJson = JSON.stringify(lines.map((l) => ({ seat_id: l.seat_id, price: l.price })));

  let bookingId;
  let bookingRef;
  try {
    await db.query(
      'CALL CreateBooking(?, ?, CAST(? AS JSON), ?, ?, ?, @booking_id, @booking_ref)',
      [userId, showId, seatsJson, summary.convenienceFee, config.GST_RATE, remaining]
    );
    const [out] = await db.query('SELECT @booking_id AS booking_id, @booking_ref AS booking_ref');
    bookingId = out.booking_id;
    bookingRef = out.booking_ref;
  } catch (err) {
    bookingCounter.inc({ status: 'failed' });
    // Duplicate-key here means the uq_seat_occupancy index caught a seat that
    // was committed between our lock check and this insert.
    if (err.code === 'ER_DUP_ENTRY' || /just been taken/.test(err.message)) {
      await releaseSeatLocks(showId, seatIds, userId);
      throw ApiError.conflict('One or more of those seats were just booked by someone else.', {
        code: 'SEAT_TAKEN'
      });
    }
    if (err.sqlState === '45000') throw ApiError.badRequest(err.message);
    throw err;
  }

  bookingCounter.inc({ status: 'pending' });

  await emitBookingCreated({
    bookingId, bookingRef, userId, showId, seatIds, totalAmount: summary.totalAmount, status: 'Pending'
  });

  logger.info('Booking %s created for user %s (show %s, %d seats)', bookingRef, userId, showId, seatIds.length);

  res.status(201).json({
    success: true,
    message: 'Booking created. Complete payment to confirm your seats.',
    booking: {
      bookingId,
      bookingRef,
      showId,
      status: 'Pending',
      seats: lines,
      summary,
      expiresInSeconds: remaining
    }
  });
});

/** GET /api/bookings/my — grouped into upcoming / completed / cancelled. */
const getMyBookings = asyncHandler(async (req, res) => {
  const { status } = req.query;

  const filters = ['b.user_id = ?'];
  const params = [req.user.userId];
  if (status) { filters.push('b.status = ?'); params.push(status); }

  const rows = await db.query(
    `${BOOKING_SELECT} WHERE ${filters.join(' AND ')} ORDER BY b.booking_time DESC LIMIT 200`,
    params
  );
  const bookings = await attachSeats(rows);

  const now = Date.now();
  const grouped = { upcoming: [], completed: [], cancelled: [] };
  for (const booking of bookings) {
    if (['Cancelled', 'Refunded', 'Expired', 'PaymentFailed'].includes(booking.status)) {
      grouped.cancelled.push(booking);
    } else if (booking.status === 'Confirmed' && new Date(booking.show_time).getTime() < now) {
      grouped.completed.push(booking);
    } else {
      grouped.upcoming.push(booking);
    }
  }

  res.json({ success: true, count: bookings.length, bookings, grouped });
});

/** GET /api/bookings/:id — owner or admin only. */
const getBooking = asyncHandler(async (req, res) => {
  const rows = await db.query(`${BOOKING_SELECT} WHERE b.booking_id = ?`, [req.params.id]);
  if (rows.length === 0) throw ApiError.notFound('Booking not found.');

  const booking = rows[0];
  if (booking.user_id !== req.user.userId && req.user.role !== 'Admin') {
    throw ApiError.forbidden('This booking belongs to another account.');
  }

  const [withSeats] = await attachSeats([booking]);

  // Surface the live hold so a checkout page reloaded mid-flow shows the real
  // remaining time instead of restarting its own timer.
  let expiresInSeconds = null;
  if (['Pending', 'PaymentProcessing'].includes(booking.status)) {
    expiresInSeconds = await getRemainingLockSeconds(
      booking.show_id, withSeats.seats.map((s) => s.seat_id)
    );
  }

  res.json({ success: true, booking: { ...withSeats, expiresInSeconds } });
});

/**
 * POST /api/bookings/:id/cancel
 * Confirmed bookings can be cancelled up to two hours before the show.
 */
const cancelBooking = asyncHandler(async (req, res) => {
  const bookingId = req.params.id;

  const rows = await db.query(
    `SELECT b.*, s.show_time FROM bookings b JOIN shows s ON s.show_id = b.show_id
      WHERE b.booking_id = ?`,
    [bookingId]
  );
  if (rows.length === 0) throw ApiError.notFound('Booking not found.');

  const booking = rows[0];
  const isAdmin = req.user.role === 'Admin';
  if (booking.user_id !== req.user.userId && !isAdmin) {
    throw ApiError.forbidden('This booking belongs to another account.');
  }

  if (['Cancelled', 'Refunded', 'Expired'].includes(booking.status)) {
    throw ApiError.badRequest('This booking has already been cancelled.');
  }

  const hoursUntilShow = (new Date(booking.show_time).getTime() - Date.now()) / 3_600_000;
  if (!isAdmin && booking.status === 'Confirmed' && hoursUntilShow < 2) {
    throw ApiError.badRequest('Bookings can only be cancelled up to 2 hours before showtime.');
  }

  const seatRows = await db.query(
    'SELECT seat_id FROM booking_seats WHERE booking_id = ? AND is_active = 1',
    [bookingId]
  );
  const seatIds = seatRows.map((r) => r.seat_id);

  await db.query('CALL CancelBooking(?)', [bookingId]);
  // Release without an owner filter: an admin cancelling on a customer's
  // behalf must still be able to free the seats.
  if (seatIds.length) await releaseSeatLocks(booking.show_id, seatIds);

  bookingCounter.inc({ status: 'cancelled' });

  await emitBookingCancelled({
    bookingId: Number(bookingId), userId: booking.user_id, showId: booking.show_id, seatIds
  });
  await emitSeatReleased({ showId: booking.show_id, seatIds, reason: 'BOOKING_CANCELLED' });

  const updated = await db.query('SELECT status FROM bookings WHERE booking_id = ?', [bookingId]);

  res.json({
    success: true,
    message: updated[0].status === 'Refunded'
      ? 'Booking cancelled. Your refund has been initiated.'
      : 'Booking cancelled.',
    status: updated[0].status
  });
});

/** GET /api/bookings/:id/ticket — the digital ticket payload. */
const getTicket = asyncHandler(async (req, res) => {
  const rows = await db.query(`${BOOKING_SELECT} WHERE b.booking_id = ?`, [req.params.id]);
  if (rows.length === 0) throw ApiError.notFound('Booking not found.');

  const booking = rows[0];
  if (booking.user_id !== req.user.userId && req.user.role !== 'Admin') {
    throw ApiError.forbidden('This booking belongs to another account.');
  }
  if (booking.status !== 'Confirmed') {
    throw ApiError.badRequest('A ticket is only issued once the booking is confirmed.');
  }

  const [withSeats] = await attachSeats([booking]);

  res.json({
    success: true,
    ticket: {
      bookingRef: withSeats.booking_ref,
      transactionId: withSeats.transaction_id,
      movie: {
        title: withSeats.movie_title,
        poster_url: withSeats.poster_url,
        language: withSeats.language,
        certificate: withSeats.certificate,
        duration_minutes: withSeats.duration_minutes
      },
      venue: {
        theatre: withSeats.theater_name,
        locality: withSeats.theater_locality,
        address: withSeats.theater_address,
        city: withSeats.city,
        screen: withSeats.screen_name || `Screen ${withSeats.screen_number}`
      },
      showTime: withSeats.show_time,
      seats: withSeats.seats.map((s) => s.label),
      seatCount: withSeats.seats.length,
      amount: {
        seats: Number(withSeats.seat_amount),
        convenienceFee: Number(withSeats.convenience_fee),
        tax: Number(withSeats.tax_amount),
        total: Number(withSeats.total_amount)
      },
      paymentMethod: withSeats.payment_method,
      bookedAt: withSeats.booking_time,
      // Encodes the fields a gate scanner needs; rendered as a QR by the client.
      qrPayload: `CINEWAVE|${withSeats.booking_ref}|${withSeats.show_id}|${withSeats.seats.map((s) => s.label).join(',')}`
    }
  });
});

module.exports = { lockSeats, createBooking, getMyBookings, getBooking, cancelBooking, getTicket, attachSeats };
