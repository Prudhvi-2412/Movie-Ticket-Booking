const Redis = require('ioredis');
const config = require('./env');
const logger = require('../utils/logger');

/**
 * Redis client with an in-process fallback.
 *
 * Two things this wrapper exists to get right:
 *
 * 1. NX actually reaching Redis. The previous wrapper exposed
 *    `set(key, value, mode, duration)` and silently discarded any further
 *    arguments, so seatLock's `set(key, value, 'EX', ttl, 'NX')` lost the NX
 *    flag: every "acquire" overwrote the incumbent lock and returned OK. Seat
 *    locking looked like it worked and prevented nothing. The API here is
 *    explicit — `setIfAbsent` can only mean NX.
 *
 * 2. Readiness. ioredis emits `connect` when the socket opens but is not
 *    willing to accept commands until `ready`; with enableOfflineQueue off,
 *    anything sent in that window throws "Stream isn't writeable". Callers
 *    wait on `whenReady()` instead, and every operation degrades to the
 *    in-memory store rather than throwing a 500 at a customer mid-checkout.
 *
 * The fallback is single-process only: it cannot coordinate across instances
 * and says so loudly. The database's uq_seat_occupancy index remains the
 * authoritative defence against double booking either way.
 */
const READY_TIMEOUT_MS = 3000;

const inMemoryStore = new Map();
let redisClient = null;
let isReady = false;
let warnedAboutFallback = false;
let readyPromise = null;

const memGet = (key) => {
  const item = inMemoryStore.get(key);
  if (!item) return null;
  if (item.expiry && Date.now() > item.expiry) {
    inMemoryStore.delete(key);
    return null;
  }
  return item;
};

const warnFallback = () => {
  if (warnedAboutFallback) return;
  warnedAboutFallback = true;
  logger.warn(
    'Redis unavailable — seat locks are held in this process only. Multiple backend ' +
    'instances will NOT see each other\'s locks. Start Redis for distributed locking.'
  );
};

try {
  redisClient = new Redis({
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
    password: config.REDIS_PASSWORD || undefined,
    connectTimeout: READY_TIMEOUT_MS,
    maxRetriesPerRequest: 2,
    // Queue commands issued before `ready` rather than rejecting them; the
    // readiness gate below means this only ever covers a brief startup window.
    enableOfflineQueue: true,
    retryStrategy: (times) => Math.min(times * 200, 5000)
  });

  redisClient.on('ready', () => {
    isReady = true;
    warnedAboutFallback = false;
    logger.info('Redis ready at %s:%s', config.REDIS_HOST, config.REDIS_PORT);
  });

  redisClient.on('error', (err) => {
    if (isReady) logger.warn('Redis error: %s', err.message);
    isReady = false;
  });

  redisClient.on('end', () => { isReady = false; });
  redisClient.on('close', () => { isReady = false; });
} catch (err) {
  logger.warn('Could not initialise the Redis client: %s', err.message);
}

/**
 * Resolves once Redis is ready, or after a short grace period if it is not.
 * Memoised, so only the first caller ever waits.
 */
const whenReady = () => {
  if (!redisClient || isReady) return Promise.resolve(isReady);
  if (readyPromise) return readyPromise;

  readyPromise = new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      redisClient.off('ready', onReady);
      // Allow a later attempt to wait again if the connection drops and
      // recovers, instead of caching "unavailable" for the process lifetime.
      readyPromise = null;
      resolve(isReady);
    };
    const onReady = () => { isReady = true; done(); };
    const timer = setTimeout(done, READY_TIMEOUT_MS);
    redisClient.once('ready', onReady);
  });

  return readyPromise;
};

/**
 * Runs a Redis operation, falling back to the in-memory store when Redis is
 * unreachable or the command fails at the connection level.
 */
const run = async (operation, fallback) => {
  if (redisClient) {
    const available = isReady || (await whenReady());
    if (available) {
      try {
        return await operation();
      } catch (err) {
        logger.warn('Redis command failed (%s) — using in-process fallback.', err.message);
        isReady = false;
      }
    }
  }
  warnFallback();
  return fallback();
};

module.exports = {
  redisClient,
  isConnected: () => isReady,
  whenReady,

  get: (key) => run(
    () => redisClient.get(key),
    () => memGet(key)?.value ?? null
  ),

  set: (key, value, ttlSeconds = null) => run(
    () => (ttlSeconds ? redisClient.set(key, value, 'EX', ttlSeconds) : redisClient.set(key, value)),
    () => {
      inMemoryStore.set(key, { value, expiry: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null });
      return 'OK';
    }
  ),

  /** SET key value EX ttl NX — true only if this call created the key. */
  setIfAbsent: (key, value, ttlSeconds) => run(
    async () => (await redisClient.set(key, value, 'EX', ttlSeconds, 'NX')) === 'OK',
    () => {
      if (memGet(key)) return false;
      inMemoryStore.set(key, { value, expiry: Date.now() + ttlSeconds * 1000 });
      return true;
    }
  ),

  del: (...keys) => (keys.length === 0 ? Promise.resolve(0) : run(
    () => redisClient.del(...keys),
    () => keys.reduce((count, key) => count + (inMemoryStore.delete(key) ? 1 : 0), 0)
  )),

  ttl: (key) => run(
    () => redisClient.ttl(key),
    () => {
      const item = memGet(key);
      if (!item) return -2;
      if (!item.expiry) return -1;
      return Math.max(Math.ceil((item.expiry - Date.now()) / 1000), 0);
    }
  ),

  /**
   * SCAN-based key listing. KEYS blocks the Redis event loop across the whole
   * keyspace, which is a real outage risk on a busy instance; SCAN is
   * incremental.
   */
  scanKeys: (pattern) => run(
    async () => {
      const found = [];
      let cursor = '0';
      do {
        // eslint-disable-next-line no-await-in-loop
        const [next, batch] = await redisClient.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
        cursor = next;
        found.push(...batch);
      } while (cursor !== '0');
      return found;
    },
    () => {
      const regex = new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
      return [...inMemoryStore.keys()].filter((k) => regex.test(k) && memGet(k));
    }
  ),

  /** MGET returning [key, value] pairs, skipping keys that have vanished. */
  mget: (keys) => (keys.length === 0 ? Promise.resolve([]) : run(
    async () => {
      const values = await redisClient.mget(keys);
      return keys.map((k, i) => [k, values[i]]).filter(([, v]) => v !== null);
    },
    () => keys.map((k) => [k, memGet(k)?.value]).filter(([, v]) => v != null)
  )),

  /**
   * Runs a Lua script server-side. Redis executes scripts atomically, which is
   * what lets seatLock claim a whole block of seats as one indivisible
   * operation instead of a loop another request can interleave with.
   *
   * Returns null when Redis is unavailable so the caller can take a
   * single-process-safe path rather than failing the request.
   */
  eval: (script, numKeys, ...args) => run(
    () => redisClient.eval(script, numKeys, ...args),
    () => null
  ),

  pipelineTtl: (keys) => (keys.length === 0 ? Promise.resolve([]) : run(
    async () => {
      const pipeline = redisClient.pipeline();
      keys.forEach((k) => pipeline.ttl(k));
      const results = await pipeline.exec();
      return results.map(([, ttl]) => ttl);
    },
    () => keys.map((k) => {
      const item = memGet(k);
      if (!item) return -2;
      return item.expiry ? Math.max(Math.ceil((item.expiry - Date.now()) / 1000), 0) : -1;
    })
  )),

  quit: async () => {
    if (redisClient) {
      try { await redisClient.quit(); } catch { /* already closed */ }
    }
    inMemoryStore.clear();
  }
};
