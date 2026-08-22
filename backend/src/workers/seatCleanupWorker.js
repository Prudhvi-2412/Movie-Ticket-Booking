const cron = require('node-cron');
const db = require('../config/db');
const logger = require('../utils/logger');
const { releaseSeatLocks } = require('../redis/seatLock');
const { emitSeatReleased } = require('../kafka/producer');
const { bookingCounter } = require('../utils/metrics');

/**
 * Reclaims abandoned seat holds.
 *
 * Redis expires its own lock keys, but the pending booking row in MySQL has
 * no TTL — so without this the seats stay marked as taken in the seat map
 * forever. The old worker used a fixed "older than 10 minutes" rule that did
 * not match the configured lock TTL, and it never cleared booking_seats, so
 * the seats never actually came back on sale.
 *
 * ExpireStaleBookings does the relational half atomically and returns the
 * freed seats; this worker then drops any Redis keys still lingering and
 * emits the release events.
 */
const runOnce = async () => {
  const [rows] = await db.pool.query('CALL ExpireStaleBookings()');
  // CALL returns [resultSet, okPacket]; the first element is our SELECT.
  const freed = Array.isArray(rows) ? rows[0] || [] : [];

  if (freed.length === 0) return 0;

  const byShow = new Map();
  for (const row of freed) {
    if (!byShow.has(row.show_id)) byShow.set(row.show_id, []);
    byShow.get(row.show_id).push(row.seat_id);
  }

  for (const [showId, seatIds] of byShow.entries()) {
    await releaseSeatLocks(showId, seatIds);
    await emitSeatReleased({ showId, seatIds, reason: 'HOLD_EXPIRED' });
  }

  const bookingIds = new Set(freed.map((r) => r.booking_id));
  bookingIds.forEach(() => bookingCounter.inc({ status: 'expired' }));

  logger.info('Expired %d abandoned booking(s), released %d seat(s)', bookingIds.size, freed.length);
  return bookingIds.size;
};

const startSeatCleanupWorker = () => {
  // Every minute: a seat that has been abandoned should return to the pool
  // quickly, since someone else is probably looking at that exact seat.
  const task = cron.schedule('* * * * *', async () => {
    try {
      await runOnce();
    } catch (err) {
      logger.error('Seat cleanup worker failed: %s', err.message);
    }
  });

  logger.info('Seat cleanup worker scheduled (every minute).');
  return task;
};

module.exports = { startSeatCleanupWorker, runOnce };
