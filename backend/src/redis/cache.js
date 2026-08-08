const redis = require('../config/redis');
const logger = require('../utils/logger');

const CACHE_KEYS = {
  ALL_MOVIES: 'cache:movies:all',
  MOVIE_DETAILS: (id) => `cache:movies:id:${id}`,
  SHOW_TIMINGS: (movieId, city) => `cache:shows:${movieId}:${city || 'all'}`,
  POPULAR_MOVIES: 'cache:movies:popular'
};

const DEFAULT_TTL = 300; // 5 minutes

const getCache = async (key) => {
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    logger.warn('Cache read error for key %s: %s', key, err.message);
    return null;
  }
};

const setCache = async (key, data, ttlSeconds = DEFAULT_TTL) => {
  try {
    await redis.set(key, JSON.stringify(data), 'EX', ttlSeconds);
  } catch (err) {
    logger.warn('Cache write error for key %s: %s', key, err.message);
  }
};

const invalidateCachePattern = async (pattern) => {
  try {
    const keys = await redis.keys(pattern);
    for (const k of keys) {
      await redis.del(k);
    }
    logger.info('Invalidated cache pattern: %s (cleared %d keys)', pattern, keys.length);
  } catch (err) {
    logger.warn('Cache invalidation error for pattern %s: %s', pattern, err.message);
  }
};

module.exports = {
  CACHE_KEYS,
  getCache,
  setCache,
  invalidateCachePattern
};
