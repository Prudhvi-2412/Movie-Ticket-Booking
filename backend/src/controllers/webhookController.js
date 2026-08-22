const db = require('../config/db');
const gateway = require('../services/paymentGateway');
const { settleConfirmedBooking, settleFailedBooking } = require('../services/bookingSettlement');
const logger = require('../utils/logger');
const { webhookEventsCounter } = require('../utils/metrics');

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
 * Handles both Razorpay's payload shape and the simulator's; the gateway
 * service normalises them so everything below sees one envelope.
 *
 * The route is mounted with express.raw, so req.body is a Buffer — the
 * signature covers the exact bytes sent, and re-serialising a parsed object
 * (different key order, different whitespace) yields a different digest.
 */
const handlePaymentWebhook = async (req, res, next) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
  // Razorpay signs with x-razorpay-signature; the simulator uses its own header.
  const signature = req.get('x-razorpay-signature') || req.get('x-webhook-signature');

  // --- 1. Verify before parsing --------------------------------------
  if (!signature || !gateway.verifyWebhookSignature(rawBody, signature)) {
    webhookEventsCounter.inc({ event_type: 'payment', status: 'invalid_signature' });
    logger.warn('Rejected payment webhook with a missing or invalid signature');
    return res.status(401).json({ success: false, message: 'Invalid webhook signature.' });
  }

  let event;
  try {
    event = gateway.parseWebhookEvent(JSON.parse(rawBody.toString('utf8')));
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
  // An explicit status always wins. Deciding with
  // `status === 'SUCCESS' || eventType === 'payment.captured'` meant a
  // declined payment delivered under a capture-shaped event type was applied
  // as a success and confirmed the booking without payment.
  const succeeded = status
    ? ['SUCCESS', 'captured', 'CAPTURED'].includes(status)
    : eventType === 'payment.captured';

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

    if (succeeded) {
      await db.query('CALL ConfirmBookingPayment(?, ?, ?, ?, ?, ?)', [
        bookingId,
        paymentMethod || 'UPI',
        transactionId || `txn_${eventId}`,
        idempotencyKey,
        orderId || null,
        amount ?? booking.total_amount
      ]);

      // Shared with the Checkout callback path — see bookingSettlement.js.
      await settleConfirmedBooking(bookingId, booking, { transactionId, amount, paymentMethod });
      webhookEventsCounter.inc({ event_type: eventType || 'payment', status: 'success' });
    } else {
      await db.query('CALL FailBookingPayment(?, ?, ?, ?, ?)', [
        bookingId,
        paymentMethod || 'UPI',
        transactionId || `txn_${eventId}`,
        idempotencyKey,
        failureReason || 'Payment failed'
      ]);

      await settleFailedBooking(bookingId, booking);
      webhookEventsCounter.inc({ event_type: eventType || 'payment', status: 'payment_failed' });
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
    /*
     * A SIGNAL from one of the booking procedures ("this booking can no
     * longer be paid for", "the seat hold has expired") is a business
     * outcome, not a server fault. Answering 500 would make the gateway
     * redeliver the same event indefinitely against a booking that will
     * never accept it. The event is recorded as IGNORED and acknowledged.
     *
     * A capture landing on a cancelled booking does mean money was taken
     * that needs refunding, so it is logged at warn level for reconciliation
     * — webhook_logs WHERE status = 'IGNORED' is the queue to work through.
     */
    const isBusinessRule = err.sqlState === '45000';
    const logStatus = isBusinessRule ? 'IGNORED' : 'FAILED';

    await db.query(
      `UPDATE webhook_logs SET status = ?, error_message = ?, processed_at = NOW() WHERE event_id = ?`,
      [logStatus, String(err.message).slice(0, 500), eventId]
    ).catch(() => {});

    if (isBusinessRule) {
      webhookEventsCounter.inc({ event_type: eventType || 'payment', status: 'ignored' });
      logger.warn(
        'Webhook %s could not be applied to booking %s: %s. Manual reconciliation may be needed.',
        eventId, bookingId, err.message
      );
      return res.status(200).json({
        success: true,
        applied: false,
        message: err.message,
        bookingId
      });
    }

    webhookEventsCounter.inc({ event_type: eventType || 'payment', status: 'error' });
    logger.error('Webhook %s failed: %s', eventId, err.message);

    // 500 tells the gateway to retry. The row is left in FAILED, which the
    // claim step above treats as retryable, so the redelivery is reprocessed
    // rather than silently swallowed as a duplicate.
    return res.status(500).json({ success: false, message: 'Could not process the payment event.' });
  }
};

module.exports = { handlePaymentWebhook };
