const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const config = require('./config/env');
const db = require('./config/db');
const redis = require('./config/redis');
const logger = require('./utils/logger');
const metrics = require('./utils/metrics');
const errorHandler = require('./middleware/errorHandlerMiddleware');
const { notFoundHandler } = require('./middleware/errorHandlerMiddleware');
const { apiLimiter } = require('./middleware/rateLimiterMiddleware');

const authRoutes = require('./routes/authRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const adminRoutes = require('./routes/adminRoutes');
const {
  locationRouter, movieRouter, theatreRouter, showRouter, searchRouter
} = require('./routes/catalogRoutes');

const app = express();

// Behind nginx in docker-compose, so express must read X-Forwarded-For for
// rate limiting to key on the real client rather than the proxy.
app.set('trust proxy', 1);

app.use(helmet({
  // The API serves JSON only; CSP belongs to the frontend's nginx config.
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

/**
 * CORS against an explicit allow-list. The previous config used
 * `origin: true`, which reflects whatever Origin the caller sends and, with
 * credentials enabled, lets any website on the internet make authenticated
 * requests on a signed-in user's behalf.
 */
app.use(cors({
  origin: (origin, callback) => {
    // Same-origin/curl requests send no Origin header.
    if (!origin) return callback(null, true);
    if (config.CORS_ORIGINS.includes('*') || config.CORS_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    logger.warn('Blocked cross-origin request from %s', origin);
    return callback(new Error('Origin not allowed by CORS policy'));
  },
  credentials: true
}));

// Webhooks are mounted before the JSON parser: their handler needs the raw
// bytes to verify the HMAC signature.
app.use('/api/webhooks', webhookRoutes);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.use(morgan('combined', {
  stream: { write: (msg) => logger.info(msg.trim()) },
  skip: () => config.NODE_ENV === 'test'
}));

app.use((req, res, next) => {
  const end = metrics.httpRequestDurationMicroseconds.startTimer();
  res.on('finish', () => {
    // req.route is only populated once a route matches; fall back to the path.
    end({
      method: req.method,
      route: req.route ? req.baseUrl + req.route.path : req.path,
      code: res.statusCode
    });
  });
  next();
});

/**
 * GET /health — reports the actual state of the dependencies rather than a
 * hardcoded "UP", so an orchestrator can tell a degraded instance from a
 * healthy one.
 */
app.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    service: 'cinewave-backend',
    version: require('../package.json').version,
    timestamp: new Date().toISOString(),
    dependencies: { database: 'unknown', redis: redis.isConnected() ? 'connected' : 'fallback' }
  };

  try {
    await db.query('SELECT 1');
    health.dependencies.database = 'connected';
  } catch (err) {
    health.dependencies.database = 'disconnected';
    health.status = 'degraded';
  }

  res.status(health.status === 'ok' ? 200 : 503).json(health);
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', metrics.register.contentType);
  res.end(await metrics.register.metrics());
});

app.use('/api', apiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/locations', locationRouter);
app.use('/api/movies', movieRouter);
app.use('/api/theatres', theatreRouter);
// US spelling alias so either path works.
app.use('/api/theaters', theatreRouter);
app.use('/api/shows', showRouter);
app.use('/api/search', searchRouter);
app.use('/api/bookings', bookingRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
