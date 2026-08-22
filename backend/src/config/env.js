const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';

/**
 * Secrets have no hardcoded fallback in production.
 *
 * The previous version defaulted JWT_SECRET to a literal string committed to
 * the repository, so any deployment that forgot to set the variable signed
 * tokens anyone could forge. Development keeps a generated-per-boot default
 * so `npm run dev` still works out of the box, but production fails loudly.
 */
const requireSecret = (name, devFallback) => {
  const value = process.env[name];
  if (value) return value;
  if (isProduction) {
    throw new Error(`${name} is required when NODE_ENV=production. Refusing to start with an insecure default.`);
  }
  return devFallback;
};

// Stable across a single process so tokens survive nodemon-free restarts of
// the same run, but never shared between machines or committed anywhere.
const devSecret = (label) => `dev-only-${label}-${require('crypto').randomBytes(16).toString('hex')}`;

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

module.exports = {
  PORT: toNumber(process.env.PORT, 5000),
  NODE_ENV,
  IS_PRODUCTION: isProduction,

  // Browser origins permitted to call the API. `*` disables the allow-list.
  CORS_ORIGINS: (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  // Authentication
  JWT_SECRET: requireSecret('JWT_SECRET', devSecret('access')),
  JWT_REFRESH_SECRET: requireSecret('JWT_REFRESH_SECRET', devSecret('refresh')),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '1h',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',

  // MySQL
  DB_HOST: process.env.DB_HOST || '127.0.0.1',
  DB_PORT: toNumber(process.env.DB_PORT, 3307),
  DB_USER: process.env.DB_USER || 'root',
  DB_PASSWORD: process.env.DB_PASSWORD || 'rootpassword',
  DB_NAME: process.env.DB_NAME || 'MovieBookingDB',

  // Redis — distributed seat locking
  REDIS_HOST: process.env.REDIS_HOST || '127.0.0.1',
  REDIS_PORT: toNumber(process.env.REDIS_PORT, 6380),
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || '',
  SEAT_LOCK_TTL: toNumber(process.env.SEAT_LOCK_TTL, 600),

  // Kafka
  KAFKA_BROKERS: (process.env.KAFKA_BROKERS || 'localhost:9094').split(',').map((b) => b.trim()),
  KAFKA_CLIENT_ID: process.env.KAFKA_CLIENT_ID || 'cinewave-backend',

  // Payment gateway webhook signing key (used by the built-in simulator, and
  // as the webhook fallback when RAZORPAY_WEBHOOK_SECRET is not set)
  WEBHOOK_SECRET: requireSecret('WEBHOOK_SECRET', devSecret('webhook')),

  // Razorpay. When key id and secret are both present the app uses real
  // Razorpay; otherwise it falls back to the local simulator so tests and CI
  // can run without an account or network access.
  //
  // KEY_ID is public and is sent to the browser. KEY_SECRET signs the Checkout
  // callback. WEBHOOK_SECRET is a separate value set in the Razorpay dashboard
  // and signs webhook bodies — it is not the key secret.
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || '',
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || '',
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET || '',

  // Booking economics — server-side source of truth for order totals
  CONVENIENCE_FEE_PER_SEAT: toNumber(process.env.CONVENIENCE_FEE_PER_SEAT, 20),
  GST_RATE: toNumber(process.env.GST_RATE, 0.18),
  MAX_SEATS_PER_BOOKING: toNumber(process.env.MAX_SEATS_PER_BOOKING, 10),

  // Run migrate + seed at boot (used by the docker-compose backend service)
  AUTO_MIGRATE: process.env.AUTO_MIGRATE === 'true'
};
