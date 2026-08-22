const rateLimit = require('express-rate-limit');
const config = require('../config/env');

const message = (text) => ({ success: false, message: text });

const base = {
  standardHeaders: true,
  legacyHeaders: false,
  // Rate limiting is a nuisance during local development and test runs; the
  // limiters are still wired up so their configuration is exercised.
  skip: () => config.NODE_ENV === 'test'
};

/** Broad limit applied to every /api route. */
const apiLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  max: 600,
  message: message('Too many requests. Please slow down and try again shortly.')
});

/** Tight limit on credential endpoints to blunt password guessing. */
const authLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  max: 20,
  // Only failed attempts count, so a legitimate user signing in repeatedly is
  // not locked out by their own success.
  skipSuccessfulRequests: true,
  message: message('Too many sign-in attempts. Please try again in 15 minutes.')
});

/**
 * Seat locking and payment. Stops one client from sweeping an auditorium by
 * hammering lock-seats, which would deny seats to everyone else for the
 * length of the TTL.
 */
const bookingLimiter = rateLimit({
  ...base,
  windowMs: 60 * 1000,
  max: 30,
  message: message('Too many booking attempts. Please wait a moment and try again.')
});

/** Generous — gateways retry, and a throttled webhook means a lost payment. */
const webhookLimiter = rateLimit({
  ...base,
  windowMs: 60 * 1000,
  max: 300,
  message: message('Webhook rate limit exceeded.')
});

module.exports = { apiLimiter, authLimiter, bookingLimiter, webhookLimiter };
