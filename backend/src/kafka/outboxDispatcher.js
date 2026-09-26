const db = require('../config/db');
const { ensureTopics, sendEvent, shutdownKafka } = require('../config/kafka');
const logger = require('../utils/logger');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const claimBatch = async () => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT event_id, event_type, aggregate_id, payload, attempts
         FROM outbox_events
        WHERE (status = 'Pending' AND available_at <= NOW())
           OR (status = 'Publishing' AND claimed_at < DATE_SUB(NOW(), INTERVAL 60 SECOND))
        ORDER BY outbox_id LIMIT 25 FOR UPDATE SKIP LOCKED`
    );
    if (rows.length) {
      await connection.query(
        `UPDATE outbox_events SET status = 'Publishing', claimed_at = NOW(),
                attempts = attempts + 1
          WHERE event_id IN (${rows.map(() => '?').join(',')})`,
        rows.map((row) => row.event_id)
      );
    }
    await connection.commit();
    return rows;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

const dispatchOnce = async () => {
  const rows = await claimBatch();
  for (const row of rows) {
    try {
      await sendEvent({
        eventId: row.event_id,
        eventType: row.event_type,
        timestamp: new Date().toISOString(),
        data: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload
      });
      await db.query(
        `UPDATE outbox_events SET status = 'Published', published_at = NOW(),
                claimed_at = NULL, last_error = NULL WHERE event_id = ?`,
        [row.event_id]
      );
      logger.info('Published outbox event %s (%s)', row.event_id, row.event_type);
    } catch (err) {
      const delay = Math.min(60, 2 ** Math.min(row.attempts, 6));
      await db.query(
        `UPDATE outbox_events SET status = 'Pending', claimed_at = NULL,
                available_at = DATE_ADD(NOW(), INTERVAL ? SECOND), last_error = ?
          WHERE event_id = ?`,
        [delay, String(err.message).slice(0, 500), row.event_id]
      );
      logger.warn('Outbox event %s deferred: %s', row.event_id, err.message);
    }
  }
  return rows.length;
};

const run = async () => {
  let stopping = false;
  const stop = () => { stopping = true; };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  while (!stopping) {
    try {
      await ensureTopics();
      while (!stopping) {
        if (await dispatchOnce() === 0) await sleep(500);
      }
    } catch (err) {
      logger.error('Outbox dispatcher error: %s', err.message);
      await sleep(3000);
    }
  }
  await shutdownKafka();
  await db.pool.end();
};

if (require.main === module) {
  run().catch((err) => {
    logger.error('Outbox dispatcher stopped: %s', err.stack || err.message);
    process.exitCode = 1;
  });
}

module.exports = { claimBatch, dispatchOnce };
