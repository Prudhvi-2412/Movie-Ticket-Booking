const redis = require('../config/redis');
const config = require('../config/env');
const db = require('../config/db');
const logger = require('../utils/logger');
const { seatLocksCounter } = require('../utils/metrics');

const SEAT_LOCK_PREFIX = 'seat_lock';

/**
 * Key format: seat_lock:<showId>:<seatId>
 * Value: JSON.stringify({ userId, lockedAt, ttl })
 */
const getSeatLockKey = (showId, seatId) => `${SEAT_LOCK_PREFIX}:${showId}:${seatId}`;

/**
 * Atomically lock multiple seats for a given show using Redis TTL.
 * Implements all-or-nothing distributed lock acquisition to prevent partial holds & race conditions.
 */
const acquireSeatLocks = async (showId, seatIds, userId, ttlSeconds = config.SEAT_LOCK_TTL) => {
  if (!showId || !Array.isArray(seatIds) || seatIds.length === 0) {
    throw new Error('Show ID and an array of seat IDs are required');
  }

  // 1. Verify none of the requested seats are already confirmed in MySQL database
  const placeholders = seatIds.map(() => '?').join(',');
  const query = `
    SELECT bs.seat_id
    FROM booking_seats bs
    JOIN bookings b ON bs.booking_id = b.booking_id
    WHERE b.show_id = ? 
      AND bs.seat_id IN (${placeholders})
      AND b.status IN ('Confirmed', 'PaymentSuccess')
  `;
  const bookedRows = await db.query(query, [showId, ...seatIds]);

  if (bookedRows.length > 0) {
    const alreadyBooked = bookedRows.map(r => r.seat_id);
    seatLocksCounter.inc({ status: 'failed_db_conflict' });
    return {
      success: false,
      reason: 'SEATS_PERMANENTLY_BOOKED',
      conflictSeats: alreadyBooked,
      message: `Seats ${alreadyBooked.join(', ')} are already booked for this show.`
    };
  }

  // 2. Attempt atomic lock acquisition for all seats in Redis
  const lockedKeys = [];
  const lockData = JSON.stringify({
    userId,
    showId,
    lockedAt: new Date().toISOString()
  });

  try {
    for (const seatId of seatIds) {
      const lockKey = getSeatLockKey(showId, seatId);
      const acquired = await redis.setnx(lockKey, lockData, ttlSeconds);

      if (acquired) {
        lockedKeys.push(lockKey);
      } else {
        // Double booking conflict! Check who holds the lock
        const existingLock = await redis.get(lockKey);
        let holderInfo = null;
        try { holderInfo = JSON.parse(existingLock); } catch(e) {}

        // If the current user already holds this lock, allow re-locking / extension
        if (holderInfo && holderInfo.userId === userId) {
          await redis.set(lockKey, lockData, 'EX', ttlSeconds);
          lockedKeys.push(lockKey);
          continue;
        }

        // Lock collision! Revert/Release all locks acquired in this batch
        logger.warn('Seat lock collision on show %s seat %s by user %s. Rolling back acquired batch.', showId, seatId, userId);
        for (const keyToRelease of lockedKeys) {
          await redis.del(keyToRelease);
        }

        seatLocksCounter.inc({ status: 'failed_concurrent_lock' });
        return {
          success: false,
          reason: 'SEATS_TEMPORARILY_LOCKED',
          conflictSeats: [seatId],
          message: `Seat ID ${seatId} is currently selected by another customer. Please select a different seat.`
        };
      }
    }

    seatLocksCounter.inc({ status: 'acquired' });
    logger.info('Successfully acquired Redis seat locks for show %s, seats %j for user %s (TTL: %ds)', showId, seatIds, userId, ttlSeconds);

    return {
      success: true,
      showId,
      seatIds,
      userId,
      expiresInSeconds: ttlSeconds,
      lockedUntil: new Date(Date.now() + ttlSeconds * 1000).toISOString()
    };
  } catch (error) {
    // Rollback any acquired locks on exception
    for (const keyToRelease of lockedKeys) {
      await redis.del(keyToRelease);
    }
    logger.error('Error during acquireSeatLocks: %s', error.message);
    throw error;
  }
};

/**
 * Release seats locked in Redis (e.g. on cancellation, payment failure, or confirmation completion)
 */
const releaseSeatLocks = async (showId, seatIds, userId = null) => {
  if (!showId || !Array.isArray(seatIds)) return;

  for (const seatId of seatIds) {
    const lockKey = getSeatLockKey(showId, seatId);
    if (userId) {
      const lockData = await redis.get(lockKey);
      if (lockData) {
        try {
          const parsed = JSON.parse(lockData);
          if (parsed.userId !== userId && parsed.userId !== 'SYSTEM_ADMIN') {
            continue; // Do not unlock someone else's seat lock
          }
        } catch(e) {}
      }
    }
    await redis.del(lockKey);
  }
  seatLocksCounter.inc({ status: 'released' });
  logger.info('Released Redis seat locks for show %s, seats %j', showId, seatIds);
};

/**
 * Fetch all currently locked seat IDs for a given show, with remaining TTL
 */
const getShowLockedSeatsMap = async (showId) => {
  const pattern = `${SEAT_LOCK_PREFIX}:${showId}:*`;
  const keys = await redis.keys(pattern);
  const lockedSeats = {};

  for (const key of keys) {
    const seatIdStr = key.split(':').pop();
    const seatId = parseInt(seatIdStr, 10);
    const ttl = await redis.ttl(key);
    const val = await redis.get(key);
    let userId = null;
    try {
      if (val) userId = JSON.parse(val).userId;
    } catch(e) {}

    if (ttl > 0) {
      lockedSeats[seatId] = {
        seatId,
        lockedByUserId: userId,
        remainingTtlSeconds: ttl
      };
    }
  }
  return lockedSeats;
};

module.exports = {
  acquireSeatLocks,
  releaseSeatLocks,
  getShowLockedSeatsMap,
  getSeatLockKey
};
