const { ensureTopics, startKafkaConsumer, shutdownKafka } = require('../config/kafka');
const db = require('../config/db');
const logger = require('../utils/logger');
const notification = require('./consumers/notificationConsumer');
const analytics = require('./consumers/analyticsConsumer');

const fatal = () => { process.exitCode = 1; process.kill(process.pid, 'SIGTERM'); };

const start = async () => {
  await ensureTopics();
  await startKafkaConsumer(notification.GROUP, notification.handleNotificationEvent, fatal);
  await startKafkaConsumer(analytics.GROUP, analytics.handleAnalyticsEvent, fatal);
  logger.info('Kafka booking workers ready');
};

const shutdown = async () => {
  await shutdownKafka();
  await db.pool.end();
  process.exit(process.exitCode || 0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start().catch((err) => {
  logger.error('Kafka worker failed to start: %s', err.stack || err.message);
  process.exit(1);
});
