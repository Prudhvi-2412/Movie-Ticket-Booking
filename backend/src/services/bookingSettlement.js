const db = require('../config/db');
const { releaseSeatLocks } = require('../redis/seatLock');
const { emitPaymentSuccessful, emitBookingConfirmed, emitSeatReleased } = require('../kafka/producer');
const logger = require('../utils/logger');
const { bookingCounter } = require('../utils/metrics');

/**
 * What happens after a booking's payment outcome is written.
 *
 * Two routes reach confirmation — the Razorpay Checkout callback (fast, for
 * the customer's benefit) and the Razorpay webhook (authoritative, may arrive
 * either side of it). Both must release the now-redundant Redis holds and emit
 * the same events, so that work lives here once instead of being duplicated
 * and drifting between the two.
 *
 * Safe to run more than once: releasing an already-released lock is a no-op,
 * and the consumers are idempotent.
 */

const activeSeatIds = async (bookingId) => {
  const rows = await db.query(
    'SELECT seat_id FROM booking_seats WHERE booking_id = ? AND is_active = 1',
    [bookingId]
  );
  return rows.map((r) => r.seat_id);
};

/** Called once a booking has reached Confirmed. */
const settleConfirmedBooking = async (bookingId, booking, payment = {}) => {
  const seatIds = await activeSeatIds(bookingId);

  // The seats are committed in MySQL now, so the temporary holds are
  // redundant. Released without an owner filter because this runs as the
  // system, not as the customer.
  if (seatIds.length) await releaseSeatLocks(booking.show_id, seatIds);

  bookingCounter.inc({ status: 'confirmed' });

  await emitPaymentSuccessful({
    bookingId: Number(bookingId),
    transactionId: payment.transactionId,
    amount: payment.amount ?? booking.total_amount,
    paymentMethod: payment.paymentMethod
  });

  await emitBookingConfirmed({
    bookingId: Number(bookingId),
    bookingRef: booking.booking_ref,
    userId: booking.user_id,
    showId: booking.show_id,
    seatIds,
    totalAmount: booking.total_amount
  });

  logger.info('Booking %s confirmed', booking.booking_ref);
};

/**
 * Called once a payment has failed. Puts the seats back on sale immediately
 * rather than leaving them invisible until the Redis TTL lapses.
 */
const settleFailedBooking = async (bookingId, booking) => {
  const seatIds = await activeSeatIds(bookingId);

  if (seatIds.length) {
    await releaseSeatLocks(booking.show_id, seatIds);
    await emitSeatReleased({ showId: booking.show_id, seatIds, reason: 'PAYMENT_FAILED' });
  }

  bookingCounter.inc({ status: 'payment_failed' });
  logger.info('Booking %s marked failed', booking.booking_ref);
};

module.exports = { settleConfirmedBooking, settleFailedBooking, activeSeatIds };
