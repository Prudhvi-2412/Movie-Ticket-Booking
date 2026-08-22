const jwt = require('jsonwebtoken');
const config = require('../config/env');
const { ApiError } = require('../utils/ApiError');

const extractToken = (req) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
};

/** Rejects the request unless a valid access token is present. */
const authenticateToken = (req, res, next) => {
  const token = extractToken(req);
  if (!token) {
    return next(ApiError.unauthorized('Please sign in to continue.', { code: 'NO_TOKEN' }));
  }

  try {
    req.user = jwt.verify(token, config.JWT_SECRET);
    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      // 401 + this code is the client's cue to use its refresh token.
      return next(ApiError.unauthorized('Your session has expired.', { code: 'TOKEN_EXPIRED' }));
    }
    return next(ApiError.unauthorized('Invalid session. Please sign in again.', { code: 'TOKEN_INVALID' }));
  }
};

/**
 * Populates req.user when a usable token is present and otherwise carries on
 * anonymously. Used by endpoints that are public but render differently for a
 * signed-in visitor — the seat map, which marks the caller's own holds.
 *
 * An expired or malformed token is treated as "not signed in" rather than an
 * error, so a stale token never blocks a public page from rendering.
 */
const optionalAuth = (req, res, next) => {
  const token = extractToken(req);
  if (!token) return next();

  try {
    req.user = jwt.verify(token, config.JWT_SECRET);
  } catch {
    req.user = undefined;
  }
  return next();
};

module.exports = { authenticateToken, optionalAuth };
