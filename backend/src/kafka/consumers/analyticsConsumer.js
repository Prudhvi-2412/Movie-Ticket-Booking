const db = require('../../config/db');

const GROUP = 'cinewave-analytics';

const handleAnalyticsEvent = async (event) => {
  if (!['BookingConfirmed', 'BookingCancelled'].includes(event.eventType)) return;
  if (!event.data.showId) throw new Error('Booking event lacks showId');

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      'INSERT INTO consumed_events (consumer_group, event_id) VALUES (?, ?)',
      [GROUP, event.eventId]
    );
    await connection.query('CALL UpdateDynamicPrice(?)', [event.data.showId]);
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    if (err.code !== 'ER_DUP_ENTRY') throw err;
  } finally {
    connection.release();
  }
};

module.exports = { GROUP, handleAnalyticsEvent };
