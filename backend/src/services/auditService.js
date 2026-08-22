const db = require('../config/db');
const logger = require('../utils/logger');

/**
 * Writes an admin action to audit_logs.
 *
 * Auditing is observability, not business logic: a failed audit write must
 * never roll back or fail the operation that triggered it, so errors are
 * logged and swallowed.
 */
const recordAudit = async (userId, action, entity, entityId, details = null) => {
  try {
    await db.query(
      'INSERT INTO audit_logs (user_id, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?)',
      [userId ?? null, action, entity, entityId == null ? null : String(entityId),
        details ? JSON.stringify(details) : null]
    );
  } catch (err) {
    logger.warn('Could not write audit log (%s %s): %s', action, entity, err.message);
  }
};

module.exports = { recordAudit };
