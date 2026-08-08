const crypto = require('crypto');
const db = require('../config/db');
const config = require('../config/env');
const logger = require('../utils/logger');

/**
 * Initialize simulated checkout session (Razorpay / Stripe style)
 */
const initiatePaymentSession = async (req, res, next) => {
  try {
    const { bookingId, paymentMethod } = req.body;
    const userId = req.user.userId;

    const bookings = await db.query('SELECT * FROM bookings WHERE booking_id = ? AND user_id = ?', [bookingId, userId]);
    if (bookings.length === 0) {
      return res.status(404).json({ success: false, message: 'Booking record not found' });
    }

    const booking = bookings[0];
    const orderId = `order_${bookingId}_${Date.now()}`;
    const transactionId = `txn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const idempotencyKey = `idem_${bookingId}_${Date.now()}`;

    // Create signature payload
    const signaturePayload = `${orderId}|${booking.total_amount}|${config.WEBHOOK_SECRET}`;
    const signature = crypto.createHmac('sha256', config.WEBHOOK_SECRET).update(signaturePayload).digest('hex');

    res.json({
      success: true,
      checkoutSession: {
        orderId,
        transactionId,
        idempotencyKey,
        signature,
        amount: booking.total_amount,
        currency: 'INR',
        bookingId,
        paymentMethod: paymentMethod || 'UPI',
        webhookEndpoint: '/api/webhooks/payment'
      }
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { initiatePaymentSession };
