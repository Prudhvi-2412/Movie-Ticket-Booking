const db = require('../config/db');
const config = require('../config/env');
const { safeCompare } = require('../utils/crypto');
const { signPayload } = require('../services/paymentGateway');
const { releaseSeatLocks } = require('../redis/seatLock');
const { emitPaymentSuccessful, emitBookingConfirmed, emitSeatReleased } = require('../kafka/producer');
const logger = require('../utils/logger');
const { webhookEventsCounter, bookingCounter } = require('../utils/metrics');

/**
 * POST /api/webhooks/payment
 *
 * Three properties this endpoint has to guarantee, none of which held before:
 *
 * 1. Authenticity. The signature check used to be wrapped in `if (signature)`,
 *    so omitting the header skipped verification entirely and any anonymous
 *    caller could confirm any booking. It is mandatory now, computed over the
 *    exact bytes received, and compared in constant time.
 *
 * 2. Idempotency. The old handler did SELECT-then-INSERT on webhook_logs,
 *    which leaves a window where two concurrent deliveries of one event both
 *    see "not processed" and both confirm. The INSERT is now first and the
 *    unique index on event_id is what decides; a duplicate key means someone
 *    else already has it.
 *
 * 3. Legal state transitions. Confirmation runs through ConfirmBookingPayment,
 *    which locks the booking row and refuses to confirm one that was
 *    cancelled or has expired.
 *
 * The route is mounted with express.raw, so req.body is a Buffer.
 */
const handlePaymentWebhook = async (req, res, next) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
  const signature = req.get('x-webhook-signature');

  // --- 1. Verify before parsing --------------------------------------
  if (!signature || !safeCompare(signature, signPayload(rawBody))) {
    webhookEventsCounter.inc({ event_type: 'payment', status: 'invalid_signature' });
    logger.warn('Rejected payment webhook with a missing or invalid signature');
    return res.status(401).json({ success: false, message: 'Invalid webhook signature.' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ success: false, message: 'Malformed webhook payload.' });
  }

  const { eventId, eventType } = event;
  const data = event.data || {};
  const { bookingId, orderId, transactionId, idempotencyKey, amount, paymentMethod, status, failureReason } = data;

  if (!eventId || !bookingId || !idempotencyKey) {
    return res.status(400).json({ success: false, message: 'Webhook payload is missing required fields.' });
  }

  // --- 2. Claim the event ---------------------------------------------
  try {
    await db.query(
      `INSERT INTO webhook_logs (event_id, event_type, idempotency_key, payload, status)
       VALUES (?, ?, ?, ?, 'RECEIVED')`,
      [eventId, eventType || 'payment', idempotencyKey, JSON.stringify(event)]
    );
  } catch (err) {
    if (err.code !== 'ER_DUP_ENTRY') return next(err);

    // Already claimed. A previous attempt that errored out mid-processing is
    // left as FAILED and *should* be retried; anything else is a genuine
    // duplicate delivery and must not be applied twice.
    const claimed = await db.query(
      "UPDATE webhook_logs SET status = 'RECEIVED' WHERE event_id = ? AND status = 'FAILED'",
      [eventId]
    );

    if (claimed.affectedRows === 0) {
      webhookEventsCounter.inc({ event_type: eventType || 'payment', status: 'duplicate' });
      logger.info('Duplicate webhook %s ignored', eventId);
      // 200 so the gateway stops retrying.
      return res.status(200).json({ success: true, message: 'Event already processed.', duplicate: true });
    }
    logger.info('Retrying previously failed webhook %s', eventId);
  }

  // --- 3. Apply the outcome -------------------------------------------
  const succeeded = status === 'SUCCESS' || eventType === 'payment.captured';

  try {
    const bookingRows = await db.query(
      'SELECT user_id, show_id, booking_ref, total_amount FROM bookings WHERE booking_id = ?',
      [bookingId]
    );
    if (bookingRows.length === 0) {
      await db.query(
        "UPDATE webhook_logs SET status = 'FAILED', error_message = ?, processed_at = NOW() WHERE event_id = ?",
        ['Booking not found', eventId]
      );
      return res.status(200).json({ success: true, message: 'Unknown booking; event recorded.' });
    }
    const booking = bookingRows[0];

    const seatRows = await db.query(
      'SELECT seat_id FROM booking_seats WHERE booking_id = ? AND is_active = 1',
      [bookingId]
    );
    const seatIds = seatRows.map((r) => r.seat_id);

    if (succeeded) {
      await db.query('CALL ConfirmBookingPayment(?, ?, ?, ?, ?, ?)', [
        bookingId,
        paymentMethod || 'UPI',
        transactionId || `txn_${eventId}`,
        idempotencyKey,
        orderId || null,
        amount ?? booking.total_amount
      ]);

      // The seats are committed in MySQL now, so the temporary holds are
      // redundant. Released without an owner filter because this runs as the
      // system, not as the customer.
      if (seatIds.length) await releaseSeatLocks(booking.show_id, seatIds);

      bookingCounter.inc({ status: 'confirmed' });
      webhookEventsCounter.inc({ event_type: eventType || 'payment', status: 'success' });

      await emitPaymentSuccessful({ bookingId, transactionId, amount, paymentMethod });
      await emitBookingConfirmed({
        bookingId,
        bookingRef: booking.booking_ref,
        userId: booking.user_id,
        showId: booking.show_id,
        seatIds,
        totalAmount: booking.total_amount
      });

      logger.info('Booking %s confirmed via webhook %s', booking.booking_ref, eventId);
    } else {
      await db.query('CALL FailBookingPayment(?, ?, ?, ?, ?)', [
        bookingId,
        paymentMethod || 'UPI',
        transactionId || `txn_${eventId}`,
        idempotencyKey,
        failureReason || 'Payment failed'
      ]);

      // A failed payment must put the seats back on sale immediately --
      // the old handler marked the booking Cancelled and left the Redis
      // locks in place, so the seats stayed invisible until the TTL lapsed.
      if (seatIds.length) {
        await releaseSeatLocks(booking.show_id, seatIds);
        await emitSeatReleased({ showId: booking.show_id, seatIds, reason: 'PAYMENT_FAILED' });
      }

      bookingCounter.inc({ status: 'payment_failed' });
      webhookEventsCounter.inc({ event_type: eventType || 'payment', status: 'payment_failed' });
      logger.info('Booking %s marked failed via webhook %s', booking.booking_ref, eventId);
    }

    await db.query(
      "UPDATE webhook_logs SET status = 'PROCESSED', processed_at = NOW() WHERE event_id = ?",
      [eventId]
    );

    return res.status(200).json({
      success: true,
      message: succeeded ? 'Payment captured; booking confirmed.' : 'Payment failure recorded; seats released.',
      bookingId
    });
  } catch (err) {
    await db.query(
      "UPDATE webhook_logs SET status = 'FAILED', error_message = ?, processed_at = NOW() WHERE event_id = ?",
      [String(err.message).slice(0, 500), eventId]
    ).catch(() => {});

    webhookEventsCounter.inc({ event_type: eventType || 'payment', status: 'error' });
    logger.error('Webhook %s failed: %s', eventId, err.message);

    // 500 tells the gateway to retry. The row is left in FAILED, which the
    // claim step above treats as retryable, so the redelivery is reprocessed
    // rather than silently swallowed as a duplicate.
    return res.status(500).json({ success: false, message: 'Could not process the payment event.' });
  }
};

module.exports = { handlePaymentWebhook };
