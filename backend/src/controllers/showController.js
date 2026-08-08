const db = require('../config/db');
const { getShowLockedSeatsMap } = require('../redis/seatLock');
const { invalidateCachePattern } = require('../redis/cache');
const logger = require('../utils/logger');

const getShowSeats = async (req, res, next) => {
  try {
    const showId = req.params.showId;
    const currentUserId = req.user ? req.user.userId : null;

    // 1. Get show details
    const shows = await db.query(`
      SELECT s.show_id, s.show_time, s.price, s.screen_id, m.title as movie_title, m.movie_id, t.name as theater_name, t.city
      FROM shows s
      JOIN movies m ON s.movie_id = m.movie_id
      JOIN screens sc ON s.screen_id = sc.screen_id
      JOIN theaters t ON sc.theater_id = t.theater_id
      WHERE s.show_id = ?
    `, [showId]);

    if (shows.length === 0) {
      return res.status(404).json({ success: false, message: 'Show not found' });
    }

    const showInfo = shows[0];

    // 2. Get all physical seats on screen
    const seats = await db.query(`
      SELECT seat_id, seat_row, seat_number, seat_type
      FROM seats
      WHERE screen_id = ?
      ORDER BY seat_row ASC, seat_number ASC
    `, [showInfo.screen_id]);

    // 3. Get permanently booked seats from MySQL (Confirmed or PaymentSuccess status)
    const bookedRows = await db.query(`
      SELECT bs.seat_id, b.status as booking_status, b.user_id
      FROM booking_seats bs
      JOIN bookings b ON bs.booking_id = b.booking_id
      WHERE b.show_id = ? AND b.status IN ('Confirmed', 'PaymentSuccess', 'Pending')
    `, [showId]);

    const bookedMap = {};
    for (const b of bookedRows) {
      bookedMap[b.seat_id] = b.booking_status;
    }

    // 4. Get real-time temporary seat locks from Redis
    const redisLocks = await getShowLockedSeatsMap(showId);

    // 5. Combine status for each seat
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
        status = 'LOCKED'; // Pending booking in DB
      }

      return {
        seat_id: s.seat_id,
        seat_row: s.seat_row,
        seat_number: s.seat_number,
        seat_type: s.seat_type,
        price: s.seat_type === 'Platinum' ? Number(showInfo.price) * 1.3 : (s.seat_type === 'Gold' ? Number(showInfo.price) * 1.15 : Number(showInfo.price)),
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

    const result = await db.query(
      'INSERT INTO shows (movie_id, screen_id, show_time, price) VALUES (?, ?, ?, ?)',
      [movie_id, screen_id, show_time, price]
    );

    await invalidateCachePattern('cache:shows:*');

    res.status(201).json({
      success: true,
      message: 'Show scheduled successfully',
      showId: result.insertId
    });
  } catch (err) {
    next(err);
  }
};

const triggerDynamicPrice = async (req, res, next) => {
  try {
    const showId = req.params.showId;
    await db.query('CALL UpdateDynamicPrice(?)', [showId]);
    
    const updated = await db.query('SELECT price FROM shows WHERE show_id = ?', [showId]);
    res.json({
      success: true,
      message: 'Dynamic price procedure executed',
      currentPrice: updated[0] ? updated[0].price : null
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getShowSeats, createShow, triggerDynamicPrice };
