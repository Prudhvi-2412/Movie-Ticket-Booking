const { ensureTopics, startKafkaConsumer, shutdownKafka } = require('../config/kafka');
const db = require('../config/db');
const logger = require('../utils/logger');
const notification = require('./consumers/notificationConsumer');
const analytics = require('./consumers/analyticsConsumer');

const start = async () => {
  await ensureTopics();
  await startKafkaConsumer(notification.GROUP, notification.handleNotificationEvent);
  await startKafkaConsumer(analytics.GROUP, analytics.handleAnalyticsEvent);
  logger.info('Kafka booking workers ready');
};

const shutdown = async () => {
  await shutdownKafka();
  await db.pool.end();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start().catch((err) => {
  logger.error('Kafka worker failed to start: %s', err.stack || err.message);
  process.exit(1);
});
