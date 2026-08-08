const app = require('./app');
const config = require('./config/env');
const logger = require('./utils/logger');
const { initKafkaProducer } = require('./config/kafka');
const { initNotificationConsumer } = require('./kafka/consumers/notificationConsumer');
const { initAnalyticsConsumer } = require('./kafka/consumers/analyticsConsumer');
const { initEmailConsumer } = require('./kafka/consumers/emailConsumer');
const { startSeatCleanupWorker } = require('./workers/seatCleanupWorker');
const { startRevenueReportWorker } = require('./workers/revenueReportWorker');

const PORT = config.PORT;

const startServer = async () => {
  try {
    // 1. Initialize Kafka Producer & Consumers
    await initKafkaProducer();
    initNotificationConsumer();
    initAnalyticsConsumer();
    initEmailConsumer();

    // 2. Start Asynchronous Background Workers
    startSeatCleanupWorker();
    startRevenueReportWorker();

    // 3. Start HTTP Server
    app.listen(PORT, () => {
      logger.info('🚀 Backend Server running in %s mode on port %d', config.NODE_ENV, PORT);
      logger.info('🔗 Healthcheck: http://localhost:%d/health', PORT);
      logger.info('📊 Metrics: http://localhost:%d/metrics', PORT);
    });
  } catch (error) {
    logger.error('Failed to start server: %s', error.message);
    process.exit(1);
  }
};

startServer();
