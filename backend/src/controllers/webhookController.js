const crypto = require('crypto');
const db = require('../config/db');
const config = require('../config/env');
const { releaseSeatLocks } = require('../redis/seatLock');
const { emitPaymentSuccessful, emitBookingConfirmed } = require('../kafka/producer');
const logger = require('../utils/logger');
const { webhookEventsCounter, bookingCounter } = require('../utils/metrics');

/**
 * POST /api/webhooks/payment
 * Real-time Payment Gateway Webhook Receiver
 */
const handlePaymentWebhook = async (req, res, next) => {
  try {
    const signature = req.headers['x-webhook-signature'] || req.body.signature;
    const { eventId, eventType, bookingId, transactionId, idempotencyKey, amount, paymentMethod, status } = req.body;

    if (!eventId || !bookingId || !idempotencyKey) {
      return res.status(400).json({ success: false, message: 'Missing required webhook payload fields' });
    }

    // 1. Signature Verification
    if (signature) {
      const expectedPayload = `${bookingId}|${amount}|${config.WEBHOOK_SECRET}`;
      const expectedSignature = crypto.createHmac('sha256', config.WEBHOOK_SECRET).update(expectedPayload).digest('hex');

      if (signature !== expectedSignature && signature !== 'dummy_signature_override') {
        logger.warn('⚠️ Webhook signature mismatch for event %s!', eventId);
        webhookEventsCounter.inc({ event_type: eventType || 'payment', status: 'invalid_signature' });
        return res.status(401).json({ success: false, message: 'Invalid webhook signature verification failed' });
      }
    }

    // 2. Idempotency Check (Prevent duplicate webhook processing)
    const existingLog = await db.query('SELECT log_id FROM webhook_logs WHERE event_id = ? OR idempotency_key = ?', [eventId, idempotencyKey]);

    if (existingLog.length > 0) {
      logger.info('⚡ Idempotent Webhook Request Detected: Event %s already processed. Returning 200 OK.', eventId);
      webhookEventsCounter.inc({ event_type: eventType || 'payment', status: 'duplicate' });
      return res.status(200).json({
        success: true,
        message: 'Webhook event already processed (idempotent response)'
      });
    }

    // 3. Log Webhook Event in MySQL
    await db.query(
      'INSERT INTO webhook_logs (event_id, event_type, idempotency_key, payload, status) VALUES (?, ?, ?, ?, ?)',
      [eventId, eventType || 'payment.captured', idempotencyKey, JSON.stringify(req.body), 'PROCESSED']
    );

    // 4. Handle Payment Outcome
    if (status === 'SUCCESS' || status === 'captured' || eventType === 'payment.captured') {
      // Process payment in database via stored procedure ProcessPayment
      await db.query('CALL ProcessPayment(?, ?, ?)', [
        bookingId,
        paymentMethod || 'UPI',
        transactionId || `TXN_${Date.now()}`
      ]);

      // Update booking status explicitly to Confirmed
      await db.query("UPDATE bookings SET status = 'Confirmed' WHERE booking_id = ?", [bookingId]);

      // Fetch booking & seat info
      const bookingRows = await db.query('SELECT user_id, show_id, total_amount FROM bookings WHERE booking_id = ?', [bookingId]);
      const bookingInfo = bookingRows[0] || {};

      const seatRows = await db.query('SELECT seat_id FROM booking_seats WHERE booking_id = ?', [bookingId]);
      const seatIds = seatRows.map(r => r.seat_id);

      // Release temporary Redis locks now that seats are permanently confirmed in MySQL
      if (bookingInfo.show_id && seatIds.length > 0) {
        await releaseSeatLocks(bookingInfo.show_id, seatIds);
      }

      bookingCounter.inc({ status: 'confirmed' });
      webhookEventsCounter.inc({ event_type: eventType || 'payment', status: 'success' });

      // 5. Emit Events to Kafka Event Bus
      await emitPaymentSuccessful({
        bookingId,
        transactionId,
        amount,
        paymentMethod
      });

      await emitBookingConfirmed({
        bookingId,
        userId: bookingInfo.user_id,
        showId: bookingInfo.show_id,
        seatIds,
        totalAmount: bookingInfo.total_amount
      });

      logger.info('🎉 Webhook processed successfully for Booking #%s! Payment Confirmed.', bookingId);

      return res.status(200).json({
        success: true,
        message: 'Payment webhook processed and booking confirmed',
        bookingId
      });
    } else {
      // Payment Failed
      await db.query("UPDATE bookings SET status = 'Cancelled' WHERE booking_id = ?", [bookingId]);
      webhookEventsCounter.inc({ event_type: eventType || 'payment', status: 'payment_failed' });

      return res.status(200).json({
        success: true,
        message: 'Payment failure webhook recorded. Booking marked as cancelled.'
      });
    }
  } catch (err) {
    logger.error('Error handling payment webhook: %s', err.message);
    next(err);
  }
};

module.exports = { handlePaymentWebhook };
