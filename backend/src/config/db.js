const mysql = require('mysql2/promise');
const config = require('./env');
const logger = require('../utils/logger');

/**
 * MySQL connection pool.
 *
 * `timezone: 'Z'` is load-bearing, not cosmetic. Without it mysql2 parses a
 * DATETIME using the Node process's local zone while MySQL generated it in
 * the server's zone, so on any machine where the two differ every JS-side
 * comparison against a stored timestamp is wrong by the offset. That silently
 * broke seat-hold expiry: a hold created seconds earlier read as already
 * expired on an IST host talking to a UTC container.
 *
 * Both halves are pinned to UTC — the driver here, and the session time_zone
 * below so NOW() agrees — and values are converted for display in the browser.
 */
const pool = mysql.createPool({
  host: config.DB_HOST,
  port: config.DB_PORT,
  user: config.DB_USER,
  password: config.DB_PASSWORD,
  database: config.DB_NAME,
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10_000,
  timezone: 'Z',
  charset: 'utf8mb4_unicode_ci',
  // Never on: it turns a single injected string into a statement batch.
  multipleStatements: false
});

// Every pooled connection runs in UTC, whatever the server default is.
pool.on('connection', (connection) => {
  connection.query("SET time_zone = '+00:00'");
});

(async () => {
  try {
    const connection = await pool.getConnection();
    logger.info('MySQL connected at %s:%s (%s)', config.DB_HOST, config.DB_PORT, config.DB_NAME);
    connection.release();
  } catch (error) {
    logger.warn('MySQL not reachable yet: %s (will retry per query)', error.message);
  }
})();

module.exports = {
  pool,
  query: async (sql, params) => {
    const [results] = await pool.query(sql, params);
    return results;
  },
  execute: async (sql, params) => {
    const [results] = await pool.execute(sql, params);
    return results;
  },
  getConnection: () => pool.getConnection()
};
