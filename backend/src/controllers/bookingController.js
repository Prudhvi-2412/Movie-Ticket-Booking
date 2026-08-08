const db = require('../config/db');
const { acquireSeatLocks, releaseSeatLocks } = require('../redis/seatLock');
const { emitBookingCreated, emitBookingCancelled } = require('../kafka/producer');
const logger = require('../utils/logger');
const { bookingCounter } = require('../utils/metrics');

const lockSeats = async (req, res, next) => {
  try {
    const { showId, seatIds } = req.body;
    const userId = req.user.userId;

    if (!showId || !Array.isArray(seatIds) || seatIds.length === 0) {
      return res.status(400).json({ success: false, message: 'showId and array of seatIds are required' });
    }

    const lockResult = await acquireSeatLocks(showId, seatIds, userId);

    if (!lockResult.success) {
      return res.status(409).json(lockResult); // 409 Conflict
    }

    res.json({
      success: true,
      message: `Successfully locked ${seatIds.length} seat(s) for 10 minutes.`,
      lock: lockResult
    });
  } catch (err) {
    next(err);
  }
};

const createBooking = async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    const { showId, seatIds, totalAmount } = req.body;
    const userId = req.user.userId;

    if (!showId || !Array.isArray(seatIds) || seatIds.length === 0) {
      connection.release();
      return res.status(400).json({ success: false, message: 'showId, seatIds, and totalAmount are required' });
    }

    // 1. ACID Transaction in MySQL
    await connection.beginTransaction();

    // Check if seats are already booked in MySQL
    const placeholders = seatIds.map(() => '?').join(',');
    const [existingBookings] = await connection.query(`
      SELECT bs.seat_id
      FROM booking_seats bs
      JOIN bookings b ON bs.booking_id = b.booking_id
      WHERE b.show_id = ? AND bs.seat_id IN (${placeholders}) AND b.status IN ('Confirmed', 'PaymentSuccess')
    `, [showId, ...seatIds]);

    if (existingBookings.length > 0) {
      await connection.rollback();
      connection.release();
      bookingCounter.inc({ status: 'failed' });
      return res.status(409).json({
        success: false,
        message: 'One or more requested seats are already permanently booked.'
      });
    }

    // Insert pending booking
    const [bookingResult] = await connection.query(
      'INSERT INTO bookings (user_id, show_id, total_amount, status) VALUES (?, ?, ?, ?)',
      [userId, showId, totalAmount, 'Pending']
    );

    const bookingId = bookingResult.insertId;

    // Insert booking seats
    for (const seatId of seatIds) {
      await connection.query('INSERT INTO booking_seats (booking_id, seat_id) VALUES (?, ?)', [bookingId, seatId]);
    }

    await connection.commit();
    connection.release();

    bookingCounter.inc({ status: 'pending' });

    // Emit event to Kafka
    await emitBookingCreated({
      bookingId,
      userId,
      showId,
      seatIds,
      totalAmount,
      status: 'Pending'
    });

    res.status(201).json({
      success: true,
      message: 'Pending booking created successfully. Proceed to payment.',
      booking: {
        bookingId,
        userId,
        showId,
        seatIds,
        totalAmount,
        status: 'Pending'
      }
    });
  } catch (err) {
    await connection.rollback();
    connection.release();
    next(err);
  }
};

const cancelBooking = async (req, res, next) => {
  try {
    const bookingId = req.params.id;
    const userId = req.user.userId;

    const bookings = await db.query('SELECT * FROM bookings WHERE booking_id = ?', [bookingId]);
    if (bookings.length === 0) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const booking = bookings[0];

    // Verify ownership or admin role
    if (booking.user_id !== userId && req.user.role !== 'Admin') {
      return res.status(403).json({ success: false, message: 'Forbidden. You do not own this booking.' });
    }

    // Update status to Cancelled & Refund payments
    await db.query('CALL CancelBooking(?)', [bookingId]);

    // Fetch seats to release Redis locks
    const seatRows = await db.query('SELECT seat_id FROM booking_seats WHERE booking_id = ?', [bookingId]);
    const seatIds = seatRows.map(r => r.seat_id);

    if (seatIds.length > 0) {
      await releaseSeatLocks(booking.show_id, seatIds, userId);
    }

    bookingCounter.inc({ status: 'cancelled' });

    await emitBookingCancelled({
      bookingId,
      userId: booking.user_id,
      showId: booking.show_id,
      seatIds
    });

    res.json({ success: true, message: 'Booking cancelled and refund initiated successfully.' });
  } catch (err) {
    next(err);
  }
};

const getUserBookings = async (req, res, next) => {
  try {
    const userId = req.user.userId;

    const bookings = await db.query(`
      SELECT b.booking_id, b.total_amount, b.status, b.booking_time,
             s.show_id, s.show_time, s.price,
             m.movie_id, m.title as movie_title, m.poster_url, m.language,
             t.name as theater_name, t.city, sc.screen_number
      FROM bookings b
      JOIN shows s ON b.show_id = s.show_id
      JOIN movies m ON s.movie_id = m.movie_id
      JOIN screens sc ON s.screen_id = sc.screen_id
      JOIN theaters t ON sc.theater_id = t.theater_id
      WHERE b.user_id = ?
      ORDER BY b.booking_time DESC
    `, [userId]);

    for (const b of bookings) {
      const seats = await db.query(`
        SELECT s.seat_id, s.seat_row, s.seat_number, s.seat_type
        FROM booking_seats bs
        JOIN seats s ON bs.seat_id = s.seat_id
        WHERE bs.booking_id = ?
      `, [b.booking_id]);
      b.seats = seats;
    }

    res.json({ success: true, bookings });
  } catch (err) {
    next(err);
  }
};

module.exports = { lockSeats, createBooking, cancelBooking, getUserBookings };
