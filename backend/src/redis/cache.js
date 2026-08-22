const redis = require('../config/redis');
const logger = require('../utils/logger');

const CACHE_KEYS = {
  FILTER_OPTIONS: 'cache:movies:filters',
  MOVIE_DETAILS: (id) => `cache:movies:id:${id}`,
  LOCATIONS: 'cache:locations:active',
  DASHBOARD: 'cache:admin:dashboard'
};

const DEFAULT_TTL = 300;

const getCache = async (key) => {
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    // A cache miss and a broken cache should behave identically to callers.
    logger.warn('Cache read failed for %s: %s', key, err.message);
    return null;
  }
};

const setCache = async (key, data, ttlSeconds = DEFAULT_TTL) => {
  try {
    await redis.set(key, JSON.stringify(data), ttlSeconds);
  } catch (err) {
    logger.warn('Cache write failed for %s: %s', key, err.message);
  }
};

const invalidateCachePattern = async (pattern) => {
  try {
    const keys = await redis.scanKeys(pattern);
    if (keys.length) await redis.del(...keys);
  } catch (err) {
    logger.warn('Cache invalidation failed for %s: %s', pattern, err.message);
  }
};

module.exports = { CACHE_KEYS, getCache, setCache, invalidateCachePattern, DEFAULT_TTL };
