const cron = require('node-cron');
const db = require('../config/db');
const logger = require('../utils/logger');

const startRevenueReportWorker = () => {
  // Run daily at midnight (00:00)
  cron.schedule('0 0 * * *', async () => {
    try {
      logger.info('📈 [Background Worker] Compiling daily movie revenue analytics summary...');
      const rows = await db.query('SELECT * FROM movie_revenue ORDER BY total_revenue DESC');
      logger.info('📈 [Daily Revenue Report] Summary:\n%s', JSON.stringify(rows, null, 2));

      // Insert audit record
      await db.query(
        `INSERT INTO audit_logs (action, entity, details) VALUES ('DAILY_REVENUE_REPORT', 'ANALYTICS', ?)`,
        [JSON.stringify({ reportDate: new Date().toISOString(), topMovies: rows })]
      );
    } catch (err) {
      logger.error('Error in revenueReportWorker: %s', err.message);
    }
  });

  logger.info('Revenue Report Background Worker scheduled.');
};

module.exports = { startRevenueReportWorker };
