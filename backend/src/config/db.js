const mysql = require('mysql2/promise');
const config = require('./env');
const logger = require('../utils/logger');

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
  keepAliveInitialDelay: 0
});

// Test connection on startup
(async () => {
  try {
    const connection = await pool.getConnection();
    logger.info('MySQL Database connected successfully to %s:%s (DB: %s)', config.DB_HOST, config.DB_PORT, config.DB_NAME);
    connection.release();
  } catch (error) {
    logger.warn('MySQL initial connection warning: %s. (Will retry on queries)', error.message);
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
