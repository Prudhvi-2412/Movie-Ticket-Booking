const db = require('../config/db');
const gateway = require('../services/paymentGateway');
const { handlePaymentWebhook } = require('./webhookController');
const { settleConfirmedBooking } = require('../services/bookingSettlement');
const { getRemainingLockSeconds } = require('../redis/seatLock');
const { ApiError, asyncHandler } = require('../utils/ApiError');
const logger = require('../utils/logger');

const PAYABLE_STATUSES = ['Pending', 'PaymentProcessing', 'PaymentFailed'];

/**
 * POST /api/payments/initiate
 *
 * Opens a checkout session for a booking the caller owns. Deliberately
 * returns no signature and no secret: the client gets an order id and the
 * authoritative amount, nothing it could use to forge a confirmation.
 */
const initiatePayment = asyncHandler(async (req, res) => {
  const { bookingId, paymentMethod = 'UPI' } = req.body;

  const rows = await db.query(
    `SELECT b.*, s.show_time FROM bookings b JOIN shows s ON s.show_id = b.show_id
      WHERE b.booking_id = ? AND b.user_id = ?`,
    [bookingId, req.user.userId]
  );
  if (rows.length === 0) throw ApiError.notFound('Booking not found.');
  const booking = rows[0];

  if (booking.status === 'Confirmed') {
    throw ApiError.conflict('This booking has already been paid for.');
  }
  if (!PAYABLE_STATUSES.includes(booking.status)) {
    throw ApiError.conflict('This booking can no longer be paid for.');
  }
  if (booking.expires_at && new Date(booking.expires_at).getTime() < Date.now()) {
    throw ApiError.gone('Your seat hold has expired. Please select your seats again.', { code: 'HOLD_EXPIRED' });
  }

  const seatRows = await db.query(
    'SELECT seat_id FROM booking_seats WHERE booking_id = ? AND is_active = 1',
    [bookingId]
  );
  const remaining = await getRemainingLockSeconds(booking.show_id, seatRows.map((r) => r.seat_id));
  if (remaining <= 0) {
    throw ApiError.gone('Your seat hold has expired. Please select your seats again.', { code: 'HOLD_EXPIRED' });
  }

  const order = await gateway.createOrder(bookingId, Number(booking.total_amount), booking.booking_ref);

  await db.query(
    `UPDATE bookings SET status = 'PaymentProcessing'
      WHERE booking_id = ? AND status IN ('Pending', 'PaymentFailed')`,
    [bookingId]
  );

  // Record the intent against this order. Two reasons: the callback can be
  // matched back to a booking without trusting the browser's claim about which
  // booking it paid for, and a payment that is authorised but never confirmed
  // still leaves a trace to reconcile. The idempotency key matches what
  // ConfirmBookingPayment uses, so this row is promoted in place rather than
  // leaving an orphaned Pending beside a Success.
  await db.query(
    `INSERT INTO payments (booking_id, payment_method, transaction_id, idempotency_key,
                           gateway_order_id, amount, payment_status)
     VALUES (?, ?, ?, ?, ?, ?, 'Pending')
     ON DUPLICATE KEY UPDATE gateway_order_id = VALUES(gateway_order_id), updated_at = NOW()`,
    [bookingId, paymentMethod, `intent_${order.orderId}`, `idem_${order.orderId}`,
      order.orderId, booking.total_amount]
  );

  res.json({
    success: true,
    checkoutSession: {
      provider: gateway.provider(),
      // Publishable key only — Checkout needs it in the browser. The key
      // secret and the webhook secret never leave the server.
      keyId: gateway.publicKey(),
      orderId: order.orderId,
      bookingId,
      bookingRef: booking.booking_ref,
      amount: order.amount,
      amountInPaise: gateway.toPaise(order.amount),
      currency: order.currency,
      paymentMethod,
      expiresInSeconds: remaining,
      customer: {
        name: req.user.email.split('@')[0],
        email: req.user.email
      },
      description: `${booking.booking_ref} · CineWave tickets`
    }
  });
});

/**
 * POST /api/payments/verify
 *
 * The Razorpay Checkout success handler posts here with the three fields the
 * widget returns. The signature is HMAC-SHA256 of "<order_id>|<payment_id>"
 * keyed with the key secret, so only Razorpay could have produced it.
 *
 * This is the *fast* path — it exists so the customer sees confirmation
 * immediately instead of waiting on a webhook. The webhook remains the
 * authoritative source and may arrive before or after this; both funnel into
 * ConfirmBookingPayment, which is idempotent, so whichever lands first wins
 * and the other is a no-op.
 */
const verifyPayment = asyncHandler(async (req, res) => {
  const { bookingId, razorpay_order_id: orderId, razorpay_payment_id: paymentId,
    razorpay_signature: signature } = req.body;

  const rows = await db.query(
    'SELECT * FROM bookings WHERE booking_id = ? AND user_id = ?',
    [bookingId, req.user.userId]
  );
  if (rows.length === 0) throw ApiError.notFound('Booking not found.');
  const booking = rows[0];

  if (booking.status === 'Confirmed') {
    // The webhook got here first. Nothing to do.
    return res.json({
      success: true, bookingId: Number(bookingId),
      bookingRef: booking.booking_ref, status: 'Confirmed',
      message: 'This booking is already confirmed.'
    });
  }

  if (!gateway.verifyCheckoutSignature({ orderId, paymentId, signature })) {
    logger.warn('Rejected a payment callback with an invalid signature (booking %s)', bookingId);
    throw ApiError.unauthorized('We could not verify that payment. Nothing has been charged.');
  }

  // The order must be the one this server created for this booking — without
  // this, a signature from any of the caller's own orders would confirm any of
  // their bookings, including a cheaper one.
  const intents = await db.query(
    'SELECT payment_id FROM payments WHERE booking_id = ? AND gateway_order_id = ?',
    [bookingId, orderId]
  );
  if (intents.length === 0) {
    throw ApiError.badRequest('That payment does not belong to this booking.');
  }

  // Trust Razorpay's record of the amount, not the browser's.
  let amount = Number(booking.total_amount);
  let method = 'UPI';
  if (gateway.isLive) {
    const payment = await gateway.fetchPayment(paymentId);
    if (payment.status !== 'captured' && payment.status !== 'authorized') {
      throw ApiError.badRequest(`Payment is ${payment.status}, not captured.`);
    }
    amount = gateway.toRupees(payment.amount);
    method = payment.method === 'card' ? 'Credit Card'
      : payment.method === 'netbanking' ? 'Net Banking' : 'UPI';

    if (Math.abs(amount - Number(booking.total_amount)) > 0.01) {
      logger.error('Amount mismatch on booking %s: paid %s, expected %s',
        bookingId, amount, booking.total_amount);
      throw ApiError.badRequest('The amount paid does not match this booking.');
    }
  }

  await db.query('CALL ConfirmBookingPayment(?, ?, ?, ?, ?, ?)', [
    bookingId, method, paymentId, `idem_${orderId}`, orderId, amount
  ]);

  await settleConfirmedBooking(bookingId, booking);

  const updated = await db.query(
    'SELECT status, booking_ref FROM bookings WHERE booking_id = ?', [bookingId]
  );

  return res.json({
    success: true,
    message: 'Payment successful. Your booking is confirmed.',
    bookingId: Number(bookingId),
    bookingRef: updated[0].booking_ref,
    status: updated[0].status
  });
});

/**
 * POST /api/payments/cancel
 * Called when the customer dismisses the Checkout widget. Puts the booking
 * back to Pending so they can retry without losing their seat hold.
 */
const cancelPaymentAttempt = asyncHandler(async (req, res) => {
  const { bookingId } = req.body;

  await db.query(
    `UPDATE bookings SET status = 'Pending'
      WHERE booking_id = ? AND user_id = ? AND status = 'PaymentProcessing'`,
    [bookingId, req.user.userId]
  );

  res.json({ success: true, message: 'Payment cancelled. Your seats are still held.' });
});

/**
 * POST /api/payments/confirm  — test mode only.
 *
 * Marks a booking as paid without a real payment. The server builds and signs
 * the callback the gateway would send and feeds it through the real webhook
 * handler, so signature verification, idempotency and the booking state
 * machine are all genuinely exercised — only the money is missing.
 *
 * Exists so the flow can be demonstrated and walked end to end without
 * completing a UPI or card payment every time. Refused outright on live
 * Razorpay credentials, where it would be a way to get free tickets.
 */
const confirmPayment = asyncHandler(async (req, res) => {
  if (!gateway.allowsTestBypass()) {
    throw ApiError.forbidden(
      'Marking a booking as paid is only possible in test mode. Complete payment through Razorpay Checkout.'
    );
  }

  const { bookingId, orderId, paymentMethod = 'UPI', outcome = 'success' } = req.body;

  const rows = await db.query(
    'SELECT * FROM bookings WHERE booking_id = ? AND user_id = ?',
    [bookingId, req.user.userId]
  );
  if (rows.length === 0) throw ApiError.notFound('Booking not found.');
  const booking = rows[0];

  if (booking.status === 'Confirmed') {
    return res.json({ success: true, message: 'This booking is already confirmed.', bookingId, status: 'Confirmed' });
  }

  const succeeded = outcome === 'success';
  const resolvedOrder = orderId
    || (await gateway.createOrder(bookingId, Number(booking.total_amount), booking.booking_ref)).orderId;

  const { rawBody, signature } = gateway.buildWebhookEvent({
    bookingId: Number(bookingId),
    orderId: resolvedOrder,
    transactionId: gateway.newTransactionId(),
    amount: Number(booking.total_amount),
    paymentMethod,
    succeeded,
    failureReason: req.body.failureReason
  });

  // Invoke the webhook handler in-process with a synthetic request/response
  // rather than making an HTTP call to ourselves — same code path, no
  // dependency on the service's own public URL.
  const webhookReq = {
    body: Buffer.from(rawBody),
    get: (header) => (header.toLowerCase() === 'x-webhook-signature' ? signature : undefined)
  };

  const result = await new Promise((resolve, reject) => {
    const webhookRes = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { resolve({ statusCode: this.statusCode, payload }); return this; }
    };
    handlePaymentWebhook(webhookReq, webhookRes, reject).catch(reject);
  });

  if (result.statusCode >= 400) {
    logger.error('Gateway callback for booking %s failed: %j', bookingId, result.payload);
    throw new ApiError(502, 'The payment could not be completed. Please try again.');
  }

  const updated = await db.query(
    'SELECT status, booking_ref FROM bookings WHERE booking_id = ?',
    [bookingId]
  );

  res.json({
    success: succeeded,
    message: succeeded
      ? 'Payment successful. Your booking is confirmed.'
      : 'Payment failed. Your seats have been released.',
    bookingId: Number(bookingId),
    bookingRef: updated[0].booking_ref,
    status: updated[0].status
  });
});

/** GET /api/payments/booking/:bookingId — payment attempts for one booking. */
const getPaymentsForBooking = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;

  const bookings = await db.query('SELECT user_id FROM bookings WHERE booking_id = ?', [bookingId]);
  if (bookings.length === 0) throw ApiError.notFound('Booking not found.');
  if (bookings[0].user_id !== req.user.userId && req.user.role !== 'Admin') {
    throw ApiError.forbidden('This booking belongs to another account.');
  }

  const payments = await db.query(
    `SELECT payment_id, payment_method, transaction_id, gateway_order_id, amount,
            payment_status, failure_reason, payment_time
       FROM payments WHERE booking_id = ? ORDER BY payment_time DESC`,
    [bookingId]
  );

  res.json({ success: true, payments });
});

module.exports = {
  initiatePayment,
  verifyPayment,
  cancelPaymentAttempt,
  confirmPayment,
  getPaymentsForBooking,
  PAYABLE_STATUSES
};
