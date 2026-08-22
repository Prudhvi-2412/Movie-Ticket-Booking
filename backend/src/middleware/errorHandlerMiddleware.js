const logger = require('../utils/logger');
const config = require('../config/env');
const { ApiError } = require('../utils/ApiError');

/** Database errors that map to a meaningful HTTP status rather than a 500. */
const SQL_STATUS_MAP = {
  ER_DUP_ENTRY: [409, 'That record already exists.'],
  ER_NO_REFERENCED_ROW_2: [400, 'A referenced record does not exist.'],
  ER_ROW_IS_REFERENCED_2: [409, 'That record is still in use and cannot be removed.'],
  ER_DATA_TOO_LONG: [400, 'One of the submitted values is too long.'],
  ER_BAD_NULL_ERROR: [400, 'A required field was missing.'],
  ECONNREFUSED: [503, 'A backing service is unavailable. Please try again shortly.'],
  PROTOCOL_CONNECTION_LOST: [503, 'Lost the database connection. Please try again.']
};

const notFoundHandler = (req, res) => {
  res.status(404).json({ success: false, message: `No route matches ${req.method} ${req.originalUrl}` });
};

/**
 * Single place every error is turned into a response.
 *
 * Only ApiError messages — the ones written for a human — are echoed back.
 * Anything else is logged in full server-side and reported generically, so a
 * SQL string, a file path or a stack trace can never reach a browser. The
 * previous handler returned `err.message` for every error and attached the
 * stack whenever NODE_ENV was not exactly "development".
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = 'Something went wrong on our end. Please try again.';
  let code = err.code;
  let details;

  if (err instanceof ApiError || err.isOperational) {
    message = err.message;
    details = err.details;
  } else if (SQL_STATUS_MAP[err.code]) {
    [statusCode, message] = SQL_STATUS_MAP[err.code];
  } else if (err.sqlState === '45000') {
    // SIGNAL from a stored procedure — these messages are written for users.
    statusCode = 400;
    message = err.message;
    code = 'BUSINESS_RULE';
  } else if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Malformed JSON in the request body.';
  }

  const logAt = statusCode >= 500 ? 'error' : 'warn';
  logger[logAt](
    '%s %s -> %d: %s%s',
    req.method, req.originalUrl, statusCode, err.message,
    statusCode >= 500 ? `\n${err.stack}` : ''
  );

  const body = { success: false, message };
  if (code) body.code = code;
  if (details) body.details = details;
  // Stack traces only outside production, and only for genuine 500s.
  if (!config.IS_PRODUCTION && statusCode >= 500) body.stack = err.stack;

  res.status(statusCode).json(body);
};

module.exports = errorHandler;
module.exports.notFoundHandler = notFoundHandler;
