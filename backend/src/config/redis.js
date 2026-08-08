const Redis = require('ioredis');
const config = require('./env');
const logger = require('../utils/logger');

let redisClient;
let isRedisConnected = false;
const inMemoryStore = new Map(); // Fallback in-memory key-value store for standalone dev mode

try {
  redisClient = new Redis({
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
    password: config.REDIS_PASSWORD || undefined,
    retryStrategy(times) {
      const delay = Math.min(times * 100, 2000);
      if (times > 3) {
        logger.warn('Redis reconnection attempt #%d. Operating with memory fallback if offline.', times);
      }
      return delay;
    },
    maxRetriesPerRequest: null,
    enableOfflineQueue: false
  });

  redisClient.on('connect', () => {
    isRedisConnected = true;
    logger.info('Redis connected successfully to %s:%s', config.REDIS_HOST, config.REDIS_PORT);
  });

  redisClient.on('error', (err) => {
    isRedisConnected = false;
    logger.warn('Redis error: %s. Using in-memory fallback store.', err.message);
  });
} catch (err) {
  logger.warn('Failed to initialize ioredis client: %s', err.message);
}

module.exports = {
  redisClient,
  isConnected: () => isRedisConnected,
  
  // Robust Redis operations with Memory Fallback
  get: async (key) => {
    if (isRedisConnected && redisClient) {
      return await redisClient.get(key);
    }
    const item = inMemoryStore.get(key);
    if (!item) return null;
    if (item.expiry && Date.now() > item.expiry) {
      inMemoryStore.delete(key);
      return null;
    }
    return item.value;
  },

  set: async (key, value, mode, duration) => {
    if (isRedisConnected && redisClient) {
      if (mode === 'EX' && duration) {
        return await redisClient.set(key, value, 'EX', duration);
      }
      return await redisClient.set(key, value);
    }
    const expiry = (mode === 'EX' && duration) ? Date.now() + duration * 1000 : null;
    inMemoryStore.set(key, { value, expiry });
    return 'OK';
  },

  setnx: async (key, value, ttlSeconds) => {
    if (isRedisConnected && redisClient) {
      const res = await redisClient.set(key, value, 'NX', 'EX', ttlSeconds);
      return res === 'OK';
    }
    const existing = inMemoryStore.get(key);
    if (existing && (!existing.expiry || Date.now() < existing.expiry)) {
      return false; // Key exists
    }
    inMemoryStore.set(key, { value, expiry: Date.now() + ttlSeconds * 1000 });
    return true; // Successfully acquired
  },

  del: async (key) => {
    if (isRedisConnected && redisClient) {
      return await redisClient.del(key);
    }
    return inMemoryStore.delete(key) ? 1 : 0;
  },

  keys: async (pattern) => {
    if (isRedisConnected && redisClient) {
      return await redisClient.keys(pattern);
    }
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    const matched = [];
    for (const [k, item] of inMemoryStore.entries()) {
      if (!item.expiry || Date.now() < item.expiry) {
        if (regex.test(k)) matched.push(k);
      } else {
        inMemoryStore.delete(k);
      }
    }
    return matched;
  },

  ttl: async (key) => {
    if (isRedisConnected && redisClient) {
      return await redisClient.ttl(key);
    }
    const item = inMemoryStore.get(key);
    if (!item) return -2;
    if (!item.expiry) return -1;
    const remaining = Math.ceil((item.expiry - Date.now()) / 1000);
    return remaining > 0 ? remaining : -2;
  }
};
