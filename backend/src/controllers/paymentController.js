const db = require('../config/db');
const config = require('../config/env');
const gateway = require('../services/paymentGateway');
const { handlePaymentWebhook } = require('./webhookController');
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

  const order = gateway.createOrder(bookingId, Number(booking.total_amount));

  await db.query(
    "UPDATE bookings SET status = 'PaymentProcessing' WHERE booking_id = ? AND status IN ('Pending', 'PaymentFailed')",
    [bookingId]
  );

  res.json({
    success: true,
    checkoutSession: {
      orderId: order.orderId,
      bookingId,
      bookingRef: booking.booking_ref,
      amount: order.amount,
      currency: order.currency,
      paymentMethod,
      expiresInSeconds: remaining
    }
  });
});

/**
 * POST /api/payments/confirm
 *
 * Stands in for the customer completing (or abandoning) payment on the
 * gateway's hosted page. The server builds and signs the callback the
 * gateway would send, then feeds it through the real webhook handler — so
 * signature verification, idempotency and the booking state machine are all
 * genuinely exercised rather than bypassed.
 *
 * `outcome` lets the UI offer an explicit "simulate failure" path so the
 * failure branch is testable. It is not a way to fake success: success still
 * has to survive every check the webhook applies.
 */
const confirmPayment = asyncHandler(async (req, res) => {
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
  const { rawBody, signature } = gateway.buildWebhookEvent({
    bookingId: Number(bookingId),
    orderId: orderId || gateway.createOrder(bookingId, Number(booking.total_amount)).orderId,
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

module.exports = { initiatePayment, confirmPayment, getPaymentsForBooking, PAYABLE_STATUSES, config };
