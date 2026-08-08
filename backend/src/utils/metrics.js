const client = require('prom-client');

// Collect default metrics (CPU, Memory, Event Loop Lag)
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ register: client.register });

// Custom metrics for Movie Booking Platform
const httpRequestDurationMicroseconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'code'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5]
});

const seatLocksCounter = new client.Counter({
  name: 'seat_locks_total',
  help: 'Total seat locking operations',
  labelNames: ['status'] // acquired, failed, released
});

const bookingCounter = new client.Counter({
  name: 'bookings_total',
  help: 'Total booking count',
  labelNames: ['status'] // pending, confirmed, cancelled
});

const webhookEventsCounter = new client.Counter({
  name: 'webhook_events_total',
  help: 'Total webhook events received',
  labelNames: ['event_type', 'status'] // duplicate, success, error
});

module.exports = {
  register: client.register,
  httpRequestDurationMicroseconds,
  seatLocksCounter,
  bookingCounter,
  webhookEventsCounter
};
