const cron = require('node-cron');
const db = require('../config/db');
const redis = require('../config/redis');
const logger = require('../utils/logger');
const { releaseSeatLocks } = require('../redis/seatLock');

/**
 * Cleanup Worker:
 * 1. Finds pending bookings older than 10 minutes in MySQL.
 * 2. Marks them as Cancelled.
 * 3. Releases corresponding seat locks in Redis.
 */
const startSeatCleanupWorker = () => {
  // Run every 2 minutes
  cron.schedule('*/2 * * * *', async () => {
    try {
      logger.info('🧹 [Background Worker] Running expired seat lock cleanup scan...');

      // Find pending bookings older than 10 minutes
      const expiredBookings = await db.query(`
        SELECT b.booking_id, b.show_id, GROUP_CONCAT(bs.seat_id) as seat_ids
        FROM bookings b
        JOIN booking_seats bs ON b.booking_id = bs.booking_id
        WHERE b.status = 'Pending'
          AND b.booking_time < DATE_SUB(NOW(), INTERVAL 10 MINUTE)
        GROUP BY b.booking_id, b.show_id
      `);

      if (expiredBookings.length === 0) {
        logger.info('🧹 [Background Worker] No expired pending bookings found.');
        return;
      }

      for (const item of expiredBookings) {
        const bookingId = item.booking_id;
        const showId = item.show_id;
        const seatIds = item.seat_ids ? item.seat_ids.split(',').map(Number) : [];

        logger.info('🧹 Cleaning expired Pending Booking #%s (Show %s, Seats %j)', bookingId, showId, seatIds);

        // Update status to Cancelled
        await db.query(`UPDATE bookings SET status = 'Cancelled' WHERE booking_id = ?`, [bookingId]);

        // Release locks in Redis
        if (seatIds.length > 0) {
          await releaseSeatLocks(showId, seatIds);
        }
      }
    } catch (err) {
      logger.error('Error in seatCleanupWorker: %s', err.message);
    }
  });

  logger.info('Seat Cleanup Background Worker scheduled.');
};

module.exports = { startSeatCleanupWorker };
