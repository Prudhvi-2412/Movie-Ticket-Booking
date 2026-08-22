/**
 * An error the API is willing to describe to the caller.
 *
 * Anything thrown that is not an ApiError is treated as a bug by the error
 * handler and reported as a generic 500, so internal messages and stack
 * traces never reach a browser.
 */
class ApiError extends Error {
  constructor(statusCode, message, options = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.isOperational = true;
    if (options.code) this.code = options.code;
    if (options.details) this.details = options.details;
    Error.captureStackTrace(this, ApiError);
  }

  static badRequest(message, options) { return new ApiError(400, message, options); }
  static unauthorized(message = 'Authentication required.', options) { return new ApiError(401, message, options); }
  static forbidden(message = 'You do not have permission to do that.', options) { return new ApiError(403, message, options); }
  static notFound(message = 'Not found.', options) { return new ApiError(404, message, options); }
  static conflict(message, options) { return new ApiError(409, message, options); }
  static gone(message, options) { return new ApiError(410, message, options); }
  static unprocessable(message, options) { return new ApiError(422, message, options); }
}

/**
 * Wraps an async route handler so a rejected promise reaches Express's error
 * pipeline. Without this, an await that throws inside a handler becomes an
 * unhandled rejection and the request hangs until it times out.
 */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { ApiError, asyncHandler };
