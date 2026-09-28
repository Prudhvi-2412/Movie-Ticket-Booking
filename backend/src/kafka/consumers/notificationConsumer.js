const db = require('../../config/db');

const GROUP = 'cinewave-notifications';

const handleNotificationEvent = async (event) => {
  if (!['BookingConfirmed', 'BookingCancelled'].includes(event.eventType)) return;
  const { bookingId, bookingRef, userId, refundPending } = event.data;
  if (!bookingId || !bookingRef || !userId) throw new Error('Booking notification lacks its owner or reference');

  const confirmed = event.eventType === 'BookingConfirmed';
  const title = confirmed ? 'Booking confirmed' : 'Booking cancelled';
  const message = confirmed
    ? `Your booking ${bookingRef} is confirmed. Your ticket is ready.`
    : refundPending
      ? `Booking ${bookingRef} was cancelled. Your refund has been requested.`
      : `Booking ${bookingRef} was cancelled.`;

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      'INSERT INTO consumed_events (consumer_group, event_id) VALUES (?, ?)',
      [GROUP, event.eventId]
    );
    const [[booking]] = await connection.query(
      'SELECT booking_id FROM bookings WHERE booking_id = ? AND user_id = ?',
      [bookingId, userId]
    );
    // Test fixture cleanup may delete a booking before its retained event is
    // replayed. It has no customer-visible booking to link to anymore.
    if (booking) {
      await connection.query(
        `INSERT INTO notifications (user_id, booking_id, event_id, title, message)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, bookingId, event.eventId, title, message]
      );
    }
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    if (err.code !== 'ER_DUP_ENTRY') throw err;
  } finally {
    connection.release();
  }
};

module.exports = { GROUP, handleNotificationEvent };
