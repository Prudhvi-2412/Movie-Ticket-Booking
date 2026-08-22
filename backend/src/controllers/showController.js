const db = require('../config/db');
const { getShowLockedSeatsMap } = require('../redis/seatLock');
const { getShowPriceTable } = require('../services/pricingService');
const { ApiError, asyncHandler } = require('../utils/ApiError');
const { recordAudit } = require('../services/auditService');
const logger = require('../utils/logger');

const SHOW_SELECT = `
  SELECT s.show_id, s.movie_id, s.screen_id, s.show_time, s.end_time,
         s.base_price, s.demand_multiplier, s.status, s.is_active,
         m.title AS movie_title, m.poster_url, m.language, m.certificate, m.duration_minutes,
         sc.screen_number, sc.name AS screen_name, sc.screen_type, sc.total_seats,
         t.theater_id, t.name AS theater_name, t.location AS theater_locality,
         l.location_id, l.city
    FROM shows s
    JOIN movies m    ON m.movie_id = s.movie_id
    JOIN screens sc  ON sc.screen_id = s.screen_id
    JOIN theaters t  ON t.theater_id = sc.theater_id
    JOIN locations l ON l.location_id = t.location_id
`;

/** GET /api/shows — filterable list (movieId, theatreId, locationId, date). */
const listShows = asyncHandler(async (req, res) => {
  const { movieId, theatreId, locationId, date, includeInactive } = req.query;

  const filters = [];
  const params = [];

  if (!includeInactive) {
    filters.push("s.is_active = TRUE AND s.status = 'Scheduled' AND s.show_time > NOW()");
  }
  if (movieId) { filters.push('s.movie_id = ?'); params.push(movieId); }
  if (theatreId) { filters.push('t.theater_id = ?'); params.push(theatreId); }
  if (locationId) { filters.push('t.location_id = ?'); params.push(locationId); }
  if (date) {
    filters.push('s.show_time >= ? AND s.show_time < DATE_ADD(?, INTERVAL 1 DAY)');
    params.push(date, date);
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const shows = await db.query(`${SHOW_SELECT} ${where} ORDER BY s.show_time ASC LIMIT 500`, params);

  res.json({ success: true, count: shows.length, shows });
});

/** GET /api/shows/:showId */
const getShow = asyncHandler(async (req, res) => {
  const shows = await db.query(`${SHOW_SELECT} WHERE s.show_id = ?`, [req.params.showId]);
  if (shows.length === 0) throw ApiError.notFound('Show not found.');

  const { table } = await getShowPriceTable(req.params.showId);
  res.json({ success: true, show: { ...shows[0], priceTable: table } });
});

/**
 * GET /api/shows/:showId/seats
 *
 * The seat map, with each seat resolved to exactly one status:
 *   BOOKED     committed in MySQL — permanent
 *   LOCKED     held in Redis by another customer, with a live TTL
 *   HELD_BY_ME the caller's own hold (still selectable)
 *   AVAILABLE  free
 *
 * Seat prices come from pricingService, never from the client. Anonymous
 * callers get the map too, so the seat layout is visible before signing in.
 */
const getShowSeats = asyncHandler(async (req, res) => {
  const showId = Number(req.params.showId);
  const currentUserId = req.user ? req.user.userId : null;

  const shows = await db.query(`${SHOW_SELECT} WHERE s.show_id = ?`, [showId]);
  if (shows.length === 0) throw ApiError.notFound('Show not found.');
  const show = shows[0];

  const seats = await db.query(
    `SELECT seat_id, seat_row, seat_number, seat_type
       FROM seats WHERE screen_id = ? AND is_active = TRUE
      ORDER BY seat_row, seat_number`,
    [show.screen_id]
  );

  // A seat is permanently gone only while an active booking_seats row holds
  // it. Cancelled and expired bookings set is_active = 0, which puts the seat
  // straight back on sale.
  const bookedRows = await db.query(
    `SELECT bs.seat_id, b.status
       FROM booking_seats bs
       JOIN bookings b ON b.booking_id = bs.booking_id
      WHERE bs.show_id = ? AND bs.is_active = 1
        AND b.status IN ('Pending', 'PaymentProcessing', 'PaymentSuccess', 'Confirmed')`,
    [showId]
  );
  const bookedMap = new Map(bookedRows.map((r) => [r.seat_id, r.status]));

  let redisLocks = {};
  try {
    redisLocks = await getShowLockedSeatsMap(showId);
  } catch (err) {
    logger.warn('Could not read seat locks for show %s: %s', showId, err.message);
  }

  const { table: priceTable } = await getShowPriceTable(showId);

  let availableCount = 0;
  const seatMap = seats.map((seat) => {
    const bookingStatus = bookedMap.get(seat.seat_id);
    const lock = redisLocks[seat.seat_id];

    let status = 'AVAILABLE';
    let ttlSeconds = null;

    if (bookingStatus === 'Confirmed' || bookingStatus === 'PaymentSuccess') {
      status = 'BOOKED';
    } else if (lock && currentUserId && lock.lockedByUserId === currentUserId) {
      status = 'HELD_BY_ME';
      ttlSeconds = lock.remainingTtlSeconds;
    } else if (lock) {
      status = 'LOCKED';
      ttlSeconds = lock.remainingTtlSeconds;
    } else if (bookingStatus) {
      // Checkout in progress elsewhere without a live Redis key.
      status = 'LOCKED';
    }

    if (status === 'AVAILABLE' || status === 'HELD_BY_ME') availableCount += 1;

    return {
      seat_id: seat.seat_id,
      seat_row: seat.seat_row,
      seat_number: seat.seat_number,
      seat_type: seat.seat_type,
      label: `${seat.seat_row}${seat.seat_number}`,
      price: priceTable[seat.seat_type] ?? priceTable.Silver,
      status,
      ttlSeconds
    };
  });

  res.json({
    success: true,
    show,
    priceTable,
    totalSeats: seatMap.length,
    availableSeats: availableCount,
    seatMap
  });
});

/**
 * POST /api/admin/shows
 *
 * Validates the whole chain the request implies before writing: the movie is
 * bookable, the screen belongs to the named theatre, the theatre sits in the
 * named location, and the time window is in the future. The overlap check
 * itself is enforced by a database trigger, so two admins creating clashing
 * shows concurrently still cannot both succeed.
 */
const createShow = asyncHandler(async (req, res) => {
  const { movie_id, screen_id, theater_id, location_id, show_time, end_time, base_price, pricing } = req.body;

  const movies = await db.query(
    'SELECT movie_id, title, duration_minutes, status, is_active FROM movies WHERE movie_id = ?',
    [movie_id]
  );
  if (movies.length === 0) throw ApiError.badRequest('That movie does not exist.');
  if (!movies[0].is_active) throw ApiError.badRequest('That movie is no longer active.');
  if (movies[0].status === 'Ended') throw ApiError.badRequest('That movie has ended its run.');

  const screens = await db.query(
    `SELECT sc.screen_id, sc.total_seats, sc.is_active, sc.theater_id, t.location_id, t.name AS theater_name
       FROM screens sc JOIN theaters t ON t.theater_id = sc.theater_id
      WHERE sc.screen_id = ?`,
    [screen_id]
  );
  if (screens.length === 0) throw ApiError.badRequest('That screen does not exist.');
  const screen = screens[0];

  if (!screen.is_active) throw ApiError.badRequest('That screen is disabled.');
  if (theater_id && Number(theater_id) !== screen.theater_id) {
    throw ApiError.badRequest('That screen does not belong to the selected theatre.');
  }
  if (location_id && Number(location_id) !== screen.location_id) {
    throw ApiError.badRequest('That theatre is not in the selected location.');
  }
  if (screen.total_seats === 0) {
    throw ApiError.badRequest('Configure a seat layout for this screen before scheduling shows.');
  }

  const start = new Date(show_time);
  if (start.getTime() <= Date.now()) throw ApiError.badRequest('The show time must be in the future.');

  // Default the end time to runtime + 20 minutes of trailers and turnaround.
  const computedEnd = end_time
    ? new Date(end_time)
    : new Date(start.getTime() + (movies[0].duration_minutes + 20) * 60_000);
  if (computedEnd <= start) throw ApiError.badRequest('The end time must be after the start time.');

  const toSql = (d) => d.toISOString().slice(0, 19).replace('T', ' ');

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [result] = await connection.query(
      'INSERT INTO shows (movie_id, screen_id, show_time, end_time, base_price) VALUES (?, ?, ?, ?, ?)',
      [movie_id, screen_id, toSql(start), toSql(computedEnd), base_price]
    );
    const showId = result.insertId;

    if (pricing && Object.keys(pricing).length > 0) {
      await connection.query(
        'INSERT INTO show_pricing (show_id, seat_type, price) VALUES ?',
        [Object.entries(pricing).map(([type, price]) => [showId, type, price])]
      );
    }

    await connection.commit();

    await recordAudit(req.user.userId, 'CREATE', 'SHOW', showId, { movie_id, screen_id, show_time });
    const shows = await db.query(`${SHOW_SELECT} WHERE s.show_id = ?`, [showId]);
    res.status(201).json({ success: true, message: 'Show scheduled.', show: shows[0] });
  } catch (err) {
    await connection.rollback();
    // Surface the trigger's overlap message as a 409 rather than a 500.
    if (/already has a show scheduled/.test(err.message)) {
      throw ApiError.conflict('That screen already has a show during this time window.');
    }
    if (err.code === 'ER_DUP_ENTRY') {
      throw ApiError.conflict('A show already starts at exactly that time on this screen.');
    }
    throw err;
  } finally {
    connection.release();
  }
});

/** PUT /api/admin/shows/:showId */
const updateShow = asyncHandler(async (req, res) => {
  const { showId } = req.params;
  const { show_time, end_time, base_price, status, is_active, pricing } = req.body;

  const existing = await db.query('SELECT * FROM shows WHERE show_id = ?', [showId]);
  if (existing.length === 0) throw ApiError.notFound('Show not found.');

  const [{ sold }] = await db.query(
    `SELECT COUNT(*) AS sold FROM booking_seats bs
       JOIN bookings b ON b.booking_id = bs.booking_id
      WHERE bs.show_id = ? AND bs.is_active = 1 AND b.status = 'Confirmed'`,
    [showId]
  );
  if (Number(sold) > 0 && (show_time || end_time)) {
    throw ApiError.conflict(
      `${sold} ticket(s) have been sold for this show, so its time can no longer be moved. Cancel it instead.`
    );
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query(
      `UPDATE shows
          SET show_time  = COALESCE(?, show_time),
              end_time   = COALESCE(?, end_time),
              base_price = COALESCE(?, base_price),
              status     = COALESCE(?, status),
              is_active  = COALESCE(?, is_active)
        WHERE show_id = ?`,
      [show_time ?? null, end_time ?? null, base_price ?? null, status ?? null, is_active ?? null, showId]
    );

    if (pricing) {
      await connection.query('DELETE FROM show_pricing WHERE show_id = ?', [showId]);
      const entries = Object.entries(pricing);
      if (entries.length) {
        await connection.query(
          'INSERT INTO show_pricing (show_id, seat_type, price) VALUES ?',
          [entries.map(([type, price]) => [showId, type, price])]
        );
      }
    }

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    if (/already has a show scheduled/.test(err.message)) {
      throw ApiError.conflict('That screen already has a show during this time window.');
    }
    throw err;
  } finally {
    connection.release();
  }

  await recordAudit(req.user.userId, 'UPDATE', 'SHOW', showId, req.body);
  const shows = await db.query(`${SHOW_SELECT} WHERE s.show_id = ?`, [showId]);
  res.json({ success: true, message: 'Show updated.', show: shows[0] });
});

/** DELETE /api/admin/shows/:showId — cancels when tickets exist, deletes otherwise. */
const deleteShow = asyncHandler(async (req, res) => {
  const { showId } = req.params;

  const existing = await db.query('SELECT * FROM shows WHERE show_id = ?', [showId]);
  if (existing.length === 0) throw ApiError.notFound('Show not found.');

  const [{ booking_count: bookingCount }] = await db.query(
    'SELECT COUNT(*) AS booking_count FROM bookings WHERE show_id = ?',
    [showId]
  );

  if (Number(bookingCount) > 0) {
    await db.query("UPDATE shows SET status = 'Cancelled', is_active = FALSE WHERE show_id = ?", [showId]);
    await recordAudit(req.user.userId, 'CANCEL', 'SHOW', showId, { bookingCount });
    return res.json({
      success: true,
      deleted: false,
      message: `This show has ${bookingCount} booking(s) and was cancelled rather than deleted.`
    });
  }

  await db.query('DELETE FROM shows WHERE show_id = ?', [showId]);
  await recordAudit(req.user.userId, 'DELETE', 'SHOW', showId, {});
  return res.json({ success: true, deleted: true, message: 'Show deleted.' });
});

/** POST /api/admin/shows/:showId/dynamic-price */
const triggerDynamicPrice = asyncHandler(async (req, res) => {
  const { showId } = req.params;

  await db.query('CALL UpdateDynamicPrice(?)', [showId]);

  const rows = await db.query(
    'SELECT base_price, demand_multiplier FROM shows WHERE show_id = ?',
    [showId]
  );
  if (rows.length === 0) throw ApiError.notFound('Show not found.');

  const { table } = await getShowPriceTable(showId);
  res.json({
    success: true,
    message: 'Demand-based pricing recalculated.',
    showId: Number(showId),
    demandMultiplier: Number(rows[0].demand_multiplier),
    priceTable: table
  });
});

module.exports = {
  listShows, getShow, getShowSeats, createShow, updateShow, deleteShow, triggerDynamicPrice
};
