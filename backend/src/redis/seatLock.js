const redis = require('../config/redis');
const config = require('../config/env');
const db = require('../config/db');
const logger = require('../utils/logger');
const { seatLocksCounter } = require('../utils/metrics');

/**
 * Distributed seat locking.
 *
 * Key    seat_lock:<showId>:<seatId>
 * Value  <userId>:<isoTimestamp>
 *
 * Two properties matter and neither held before:
 *
 * 1. Mutual exclusion. The old code called a wrapper that silently discarded
 *    the NX flag, so every acquisition overwrote the incumbent lock. Locking
 *    is now a Lua script, and Redis runs Lua atomically.
 *
 * 2. All-or-nothing. The old loop took locks one seat at a time and unwound
 *    on conflict with further round trips, leaving a window where another
 *    request saw a half-held block. The script checks every seat first and
 *    only then writes, so no partial state is ever observable.
 */
const SEAT_LOCK_PREFIX = 'seat_lock';

const getSeatLockKey = (showId, seatId) => `${SEAT_LOCK_PREFIX}:${showId}:${seatId}`;

/**
 * KEYS  : one key per seat
 * ARGV  : [1] ownerId  [2] ttlSeconds  [3] value
 * Returns 0 on success, or the 1-based index of the first conflicting key.
 * A seat already held by the same owner is not a conflict — its TTL is
 * refreshed, which is what makes "go back and add another seat" work.
 */
const ACQUIRE_SCRIPT = `
local owner = ARGV[1]
local ttl = tonumber(ARGV[2])
local value = ARGV[3]

for i = 1, #KEYS do
  local current = redis.call('GET', KEYS[i])
  if current then
    local holder = string.match(current, '^([^:]+)')
    if holder ~= owner then
      return i
    end
  end
end

for i = 1, #KEYS do
  redis.call('SET', KEYS[i], value, 'EX', ttl)
end
return 0
`;

/**
 * Releases only keys this owner holds. Deleting by key alone would let one
 * user drop another user's hold.
 * Returns the number of keys actually deleted.
 */
const RELEASE_SCRIPT = `
local owner = ARGV[1]
local removed = 0
for i = 1, #KEYS do
  local current = redis.call('GET', KEYS[i])
  if current then
    local holder = string.match(current, '^([^:]+)')
    if owner == '' or holder == owner then
      redis.call('DEL', KEYS[i])
      removed = removed + 1
    end
  end
end
return removed
`;

/** Seats already committed in MySQL can never be locked, whatever Redis says. */
const findPermanentlyBookedSeats = async (showId, seatIds) => {
  const placeholders = seatIds.map(() => '?').join(',');
  const rows = await db.query(
    `SELECT bs.seat_id
       FROM booking_seats bs
       JOIN bookings b ON b.booking_id = bs.booking_id
      WHERE bs.show_id = ?
        AND bs.seat_id IN (${placeholders})
        AND bs.is_active = 1
        AND b.status IN ('Pending', 'PaymentProcessing', 'PaymentSuccess', 'Confirmed')`,
    [showId, ...seatIds]
  );
  return rows.map((r) => r.seat_id);
};

/** Fallback path used only when Redis is down (single process, no Lua). */
const acquireSequentially = async (keys, value, ttlSeconds, ownerId) => {
  const taken = [];
  for (let i = 0; i < keys.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const acquired = await redis.setIfAbsent(keys[i], value, ttlSeconds);
    if (acquired) {
      taken.push(keys[i]);
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const current = await redis.get(keys[i]);
    if (current && String(current).split(':')[0] === String(ownerId)) {
      // eslint-disable-next-line no-await-in-loop
      await redis.set(keys[i], value, ttlSeconds);
      taken.push(keys[i]);
      continue;
    }
    if (taken.length) await redis.del(...taken);
    return i + 1;
  }
  return 0;
};

/**
 * Acquire locks on every seat, or none of them.
 * Resolves to { success, ... } rather than throwing on conflict, because a
 * conflict is an expected outcome of two customers wanting the same seat.
 */
const acquireSeatLocks = async (showId, seatIds, userId, ttlSeconds = config.SEAT_LOCK_TTL) => {
  if (!showId || !Array.isArray(seatIds) || seatIds.length === 0) {
    throw new Error('showId and a non-empty seatIds array are required');
  }

  const uniqueSeatIds = [...new Set(seatIds.map(Number))];

  const alreadyBooked = await findPermanentlyBookedSeats(showId, uniqueSeatIds);
  if (alreadyBooked.length > 0) {
    seatLocksCounter.inc({ status: 'failed_db_conflict' });
    return {
      success: false,
      reason: 'SEATS_ALREADY_BOOKED',
      conflictSeats: alreadyBooked,
      message: 'Those seats have already been booked. Please pick different seats.'
    };
  }

  const keys = uniqueSeatIds.map((seatId) => getSeatLockKey(showId, seatId));
  const value = `${userId}:${new Date().toISOString()}`;

  let conflictIndex = await redis.eval(
    ACQUIRE_SCRIPT, keys.length, ...keys, String(userId), String(ttlSeconds), value
  );

  if (conflictIndex === null) {
    conflictIndex = await acquireSequentially(keys, value, ttlSeconds, userId);
  }

  if (Number(conflictIndex) !== 0) {
    const conflictSeat = uniqueSeatIds[Number(conflictIndex) - 1];
    seatLocksCounter.inc({ status: 'failed_concurrent_lock' });
    logger.info('Seat lock conflict: show %s seat %s requested by user %s', showId, conflictSeat, userId);
    return {
      success: false,
      reason: 'SEATS_TEMPORARILY_LOCKED',
      conflictSeats: [conflictSeat],
      message: 'Someone else is currently holding one of those seats. Please pick another.'
    };
  }

  seatLocksCounter.inc({ status: 'acquired' });
  logger.info('Locked show %s seats %j for user %s (ttl %ds)', showId, uniqueSeatIds, userId, ttlSeconds);

  return {
    success: true,
    showId,
    seatIds: uniqueSeatIds,
    userId,
    expiresInSeconds: ttlSeconds,
    lockedUntil: new Date(Date.now() + ttlSeconds * 1000).toISOString()
  };
};

/**
 * Confirms this user still holds every one of these seats.
 * Called before a booking is written, so an expired hold cannot check out.
 */
const verifySeatLocks = async (showId, seatIds, userId) => {
  const keys = seatIds.map((seatId) => getSeatLockKey(showId, seatId));
  const entries = await redis.mget(keys);
  const held = new Map(entries.map(([key, value]) => [key, String(value).split(':')[0]]));

  const missing = [];
  for (let i = 0; i < keys.length; i += 1) {
    const holder = held.get(keys[i]);
    if (holder === undefined) missing.push({ seatId: seatIds[i], reason: 'EXPIRED' });
    else if (holder !== String(userId)) missing.push({ seatId: seatIds[i], reason: 'HELD_BY_OTHER' });
  }

  return { valid: missing.length === 0, missing };
};

/** Remaining hold time in seconds — the number the checkout timer counts down. */
const getRemainingLockSeconds = async (showId, seatIds) => {
  const ttls = await redis.pipelineTtl(seatIds.map((seatId) => getSeatLockKey(showId, seatId)));
  const live = ttls.filter((t) => t > 0);
  return live.length ? Math.min(...live) : 0;
};

/** Pass userId to release only your own locks; omit it for system cleanup. */
const releaseSeatLocks = async (showId, seatIds, userId = null) => {
  if (!showId || !Array.isArray(seatIds) || seatIds.length === 0) return 0;

  const keys = seatIds.map((seatId) => getSeatLockKey(showId, seatId));
  const owner = userId === null ? '' : String(userId);

  let removed = await redis.eval(RELEASE_SCRIPT, keys.length, ...keys, owner);

  if (removed === null) {
    removed = 0;
    for (const key of keys) {
      // eslint-disable-next-line no-await-in-loop
      const current = await redis.get(key);
      if (!current) continue;
      if (owner && String(current).split(':')[0] !== owner) continue;
      // eslint-disable-next-line no-await-in-loop
      await redis.del(key);
      removed += 1;
    }
  }

  if (removed > 0) {
    seatLocksCounter.inc({ status: 'released' });
    logger.info('Released %d seat lock(s) for show %s', removed, showId);
  }
  return removed;
};

/** Map of seatId -> { lockedByUserId, remainingTtlSeconds } for one show. */
const getShowLockedSeatsMap = async (showId) => {
  const keys = await redis.scanKeys(`${SEAT_LOCK_PREFIX}:${showId}:*`);
  if (keys.length === 0) return {};

  const [entries, ttls] = await Promise.all([redis.mget(keys), redis.pipelineTtl(keys)]);
  const ttlByKey = new Map(keys.map((key, i) => [key, ttls[i]]));

  const locked = {};
  for (const [key, value] of entries) {
    const ttl = ttlByKey.get(key);
    if (!ttl || ttl <= 0) continue;
    const seatId = Number(key.split(':').pop());
    locked[seatId] = {
      seatId,
      lockedByUserId: Number(String(value).split(':')[0]),
      remainingTtlSeconds: ttl
    };
  }
  return locked;
};

module.exports = {
  SEAT_LOCK_PREFIX,
  getSeatLockKey,
  acquireSeatLocks,
  verifySeatLocks,
  getRemainingLockSeconds,
  releaseSeatLocks,
  getShowLockedSeatsMap
};
