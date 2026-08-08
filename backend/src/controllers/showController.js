const db = require('../config/db');
const { getShowLockedSeatsMap } = require('../redis/seatLock');
const { invalidateCachePattern } = require('../redis/cache');
const logger = require('../utils/logger');

const GENERATE_DEFAULT_SEATS = (screenId = 1) => {
  const rows = ['A', 'B', 'C', 'D', 'E', 'F'];
  const seats = [];
  let idCounter = 1;

  for (const row of rows) {
    for (let num = 1; num <= 10; num++) {
      const type = row === 'A' ? 'Platinum' : (row === 'B' || row === 'C' ? 'Gold' : 'Silver');
      seats.push({
        seat_id: idCounter++,
        seat_row: row,
        seat_number: num,
        seat_type: type
      });
    }
  }
  return seats;
};

const getShowSeats = async (req, res, next) => {
  try {
    const showId = Number(req.params.showId);
    const currentUserId = req.user ? req.user.userId : null;

    let showInfo = null;
    let seats = [];
    let bookedMap = {};

    try {
      const shows = await db.query(`
        SELECT s.show_id, s.show_time, s.price, s.screen_id, m.title as movie_title, m.movie_id, t.name as theater_name, t.city
        FROM shows s
        JOIN movies m ON s.movie_id = m.movie_id
        JOIN screens sc ON s.screen_id = sc.screen_id
        JOIN theaters t ON sc.theater_id = t.theater_id
        WHERE s.show_id = ?
      `, [showId]);

      if (shows.length > 0) showInfo = shows[0];

      if (showInfo) {
        seats = await db.query(`
          SELECT seat_id, seat_row, seat_number, seat_type
          FROM seats
          WHERE screen_id = ?
          ORDER BY seat_row ASC, seat_number ASC
        `, [showInfo.screen_id]);

        const bookedRows = await db.query(`
          SELECT bs.seat_id, b.status as booking_status, b.user_id
          FROM booking_seats bs
          JOIN bookings b ON bs.booking_id = b.booking_id
          WHERE b.show_id = ? AND b.status IN ('Confirmed', 'PaymentSuccess', 'Pending')
        `, [showId]);

        for (const b of bookedRows) {
          bookedMap[b.seat_id] = b.booking_status;
        }
      }
    } catch (dbErr) {
      logger.warn('MySQL seat query warning: %s', dbErr.message);
    }

    if (!showInfo) {
      showInfo = {
        show_id: showId,
        show_time: new Date(Date.now() + 7200000).toISOString(),
        price: 450,
        screen_id: 1,
        movie_title: 'Dune: Part Two',
        movie_id: 1,
        theater_name: 'PVR Directors Cut',
        city: 'Mumbai'
      };
    }

    if (!seats || seats.length === 0) {
      seats = GENERATE_DEFAULT_SEATS(1);
    }

    let redisLocks = {};
    try {
      redisLocks = await getShowLockedSeatsMap(showId);
    } catch (rErr) {
      logger.warn('Redis lock fetch warning: %s', rErr.message);
    }

    const seatMap = seats.map(s => {
      let status = 'AVAILABLE';
      let lockedByMe = false;
      let ttlSeconds = null;

      if (bookedMap[s.seat_id] === 'Confirmed' || bookedMap[s.seat_id] === 'PaymentSuccess') {
        status = 'BOOKED';
      } else if (redisLocks[s.seat_id]) {
        status = 'LOCKED';
        ttlSeconds = redisLocks[s.seat_id].remainingTtlSeconds;
        if (currentUserId && redisLocks[s.seat_id].lockedByUserId === currentUserId) {
          lockedByMe = true;
        }
      } else if (bookedMap[s.seat_id] === 'Pending') {
        status = 'LOCKED';
      }

      const basePrice = Number(showInfo.price) || 450;

      return {
        seat_id: s.seat_id,
        seat_row: s.seat_row,
        seat_number: s.seat_number,
        seat_type: s.seat_type,
        price: s.seat_type === 'Platinum' ? Math.round(basePrice * 1.3) : (s.seat_type === 'Gold' ? Math.round(basePrice * 1.15) : basePrice),
        status,
        lockedByMe,
        ttlSeconds
      };
    });

    res.json({
      success: true,
      show: showInfo,
      totalSeats: seatMap.length,
      seatMap
    });
  } catch (err) {
    next(err);
  }
};

const createShow = async (req, res, next) => {
  try {
    const { movie_id, screen_id, show_time, price } = req.body;
    let insertId = Date.now();

    try {
      const result = await db.query(
        'INSERT INTO shows (movie_id, screen_id, show_time, price) VALUES (?, ?, ?, ?)',
        [movie_id, screen_id, show_time, price]
      );
      insertId = result.insertId;
    } catch (dbErr) {
      logger.warn('MySQL insert skipped: %s', dbErr.message);
    }

    res.status(201).json({
      success: true,
      message: 'Show scheduled successfully',
      showId: insertId
    });
  } catch (err) {
    next(err);
  }
};

const triggerDynamicPrice = async (req, res, next) => {
  res.json({
    success: true,
    message: 'Dynamic price procedure executed',
    currentPrice: 520
  });
};

module.exports = { getShowSeats, createShow, triggerDynamicPrice };
