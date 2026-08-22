const Redis = require('ioredis');
const config = require('./env');
const logger = require('../utils/logger');

/**
 * Redis client with an in-process fallback.
 *
 * The previous wrapper exposed `set(key, value, mode, duration)` and simply
 * dropped any further arguments. seatLock.js called it as
 * `set(key, value, 'EX', ttl, 'NX')`, so the NX flag never reached Redis:
 * every "acquire" unconditionally overwrote whatever lock was there and
 * returned OK. Seat locking looked like it worked and prevented nothing.
 *
 * The API here is therefore explicit -- `setIfAbsent` can only mean NX -- and
 * the fallback store implements the same semantics, so a machine without
 * Redis behaves the same way as one with it (single-process only; the
 * fallback cannot coordinate across instances and says so at startup).
 */
const inMemoryStore = new Map();
let redisClient = null;
let isRedisConnected = false;
let warnedAboutFallback = false;

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
    'Redis unavailable — seat locks are held in this process only. ' +
    'Multiple backend instances will NOT see each other\'s locks. Start Redis for distributed locking.'
  );
};

const connect = () => {
  try {
    redisClient = new Redis({
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD || undefined,
      lazyConnect: false,
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      retryStrategy: (times) => Math.min(times * 200, 5000)
    });

    redisClient.on('connect', () => {
      isRedisConnected = true;
      warnedAboutFallback = false;
      logger.info('Redis connected at %s:%s', config.REDIS_HOST, config.REDIS_PORT);
    });

    redisClient.on('error', (err) => {
      if (isRedisConnected) logger.warn('Redis error: %s', err.message);
      isRedisConnected = false;
    });

    redisClient.on('end', () => { isRedisConnected = false; });
  } catch (err) {
    logger.warn('Could not initialise Redis client: %s', err.message);
  }
};

connect();

const usingRedis = () => isRedisConnected && redisClient;

module.exports = {
  redisClient,
  isConnected: () => isRedisConnected,

  get: async (key) => {
    if (usingRedis()) return redisClient.get(key);
    warnFallback();
    const item = memGet(key);
    return item ? item.value : null;
  },

  set: async (key, value, ttlSeconds = null) => {
    if (usingRedis()) {
      return ttlSeconds ? redisClient.set(key, value, 'EX', ttlSeconds) : redisClient.set(key, value);
    }
    warnFallback();
    inMemoryStore.set(key, { value, expiry: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null });
    return 'OK';
  },

  /** SET key value EX ttl NX — true only if this call created the key. */
  setIfAbsent: async (key, value, ttlSeconds) => {
    if (usingRedis()) {
      return (await redisClient.set(key, value, 'EX', ttlSeconds, 'NX')) === 'OK';
    }
    warnFallback();
    if (memGet(key)) return false;
    inMemoryStore.set(key, { value, expiry: Date.now() + ttlSeconds * 1000 });
    return true;
  },

  del: async (...keys) => {
    if (!keys.length) return 0;
    if (usingRedis()) return redisClient.del(...keys);
    warnFallback();
    return keys.reduce((count, key) => count + (inMemoryStore.delete(key) ? 1 : 0), 0);
  },

  ttl: async (key) => {
    if (usingRedis()) return redisClient.ttl(key);
    warnFallback();
    const item = memGet(key);
    if (!item) return -2;
    if (!item.expiry) return -1;
    return Math.max(Math.ceil((item.expiry - Date.now()) / 1000), 0);
  },

  /**
   * SCAN-based key listing. KEYS blocks the Redis event loop across the whole
   * keyspace, which is a genuine outage risk on a busy instance; SCAN is
   * incremental.
   */
  scanKeys: async (pattern) => {
    if (usingRedis()) {
      const found = [];
      let cursor = '0';
      do {
        // eslint-disable-next-line no-await-in-loop
        const [next, batch] = await redisClient.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
        cursor = next;
        found.push(...batch);
      } while (cursor !== '0');
      return found;
    }
    warnFallback();
    const regex = new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
    return [...inMemoryStore.keys()].filter((k) => regex.test(k) && memGet(k));
  },

  /** MGET returning [key, value] pairs, skipping keys that vanished. */
  mget: async (keys) => {
    if (!keys.length) return [];
    if (usingRedis()) {
      const values = await redisClient.mget(keys);
      return keys.map((k, i) => [k, values[i]]).filter(([, v]) => v !== null);
    }
    warnFallback();
    return keys.map((k) => [k, memGet(k)?.value]).filter(([, v]) => v !== undefined && v !== null);
  },

  /**
   * Runs a Lua script server-side. Redis executes scripts atomically, which
   * is what lets seatLock acquire a whole block of seats as one indivisible
   * operation instead of a loop that can interleave with another request.
   */
  eval: async (script, numKeys, ...args) => {
    if (usingRedis()) return redisClient.eval(script, numKeys, ...args);
    return null; // Callers fall back to a single-process-safe path.
  },

  pipelineTtl: async (keys) => {
    if (!keys.length) return [];
    if (usingRedis()) {
      const pipeline = redisClient.pipeline();
      keys.forEach((k) => pipeline.ttl(k));
      const results = await pipeline.exec();
      return results.map(([, ttl]) => ttl);
    }
    warnFallback();
    return keys.map((k) => {
      const item = memGet(k);
      if (!item) return -2;
      return item.expiry ? Math.max(Math.ceil((item.expiry - Date.now()) / 1000), 0) : -1;
    });
  },

  quit: async () => {
    if (redisClient) {
      try { await redisClient.quit(); } catch { /* already closed */ }
    }
    inMemoryStore.clear();
  }
};
