const app = require('./app');
const config = require('./config/env');
const logger = require('./utils/logger');
const db = require('./config/db');
const redis = require('./config/redis');
const { initKafkaProducer, shutdownKafka } = require('./config/kafka');
const { initNotificationConsumer } = require('./kafka/consumers/notificationConsumer');
const { initAnalyticsConsumer } = require('./kafka/consumers/analyticsConsumer');
const { initEmailConsumer } = require('./kafka/consumers/emailConsumer');
const { startSeatCleanupWorker } = require('./workers/seatCleanupWorker');
const { startRevenueReportWorker } = require('./workers/revenueReportWorker');

const workers = [];
let server;

const startServer = async () => {
  // Used by the docker-compose backend service so a fresh stack comes up with
  // a schema and demo data without a manual step.
  if (config.AUTO_MIGRATE) {
    const { migrate } = require('../scripts/migrate');
    const { seed } = require('../scripts/seed');
    await migrate();
    await seed();
  }

  await initKafkaProducer();
  initNotificationConsumer();
  initAnalyticsConsumer();
  initEmailConsumer();

  workers.push(startSeatCleanupWorker(), startRevenueReportWorker());

  server = app.listen(config.PORT, () => {
    logger.info('CineWave backend listening on port %d (%s)', config.PORT, config.NODE_ENV);
    logger.info('  health  http://localhost:%d/health', config.PORT);
    logger.info('  metrics http://localhost:%d/metrics', config.PORT);
  });
};

/**
 * Graceful shutdown. Without this, a redeploy kills the process mid-request
 * and can leave a booking transaction half-applied; draining first lets
 * in-flight work finish.
 */
const shutdown = async (signal) => {
  logger.info('%s received — shutting down.', signal);

  const forceExit = setTimeout(() => {
    logger.error('Shutdown timed out after 10s; exiting.');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  try {
    if (server) await new Promise((resolve) => server.close(resolve));
    workers.forEach((task) => task && task.stop && task.stop());
    await shutdownKafka();
    await redis.quit();
    await db.pool.end();
    logger.info('Shutdown complete.');
    process.exit(0);
  } catch (err) {
    logger.error('Error during shutdown: %s', err.message);
    process.exit(1);
  }
};

['SIGTERM', 'SIGINT'].forEach((signal) => process.on(signal, () => shutdown(signal)));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection: %s', reason instanceof Error ? reason.stack : reason);
});

process.on('uncaughtException', (err) => {
  // The process state is undefined after this; log and let the supervisor restart.
  logger.error('Uncaught exception: %s', err.stack);
  shutdown('uncaughtException');
});

startServer().catch((err) => {
  logger.error('Failed to start: %s', err.stack || err.message);
  process.exit(1);
});
