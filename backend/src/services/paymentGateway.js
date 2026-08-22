const crypto = require('crypto');
const Razorpay = require('razorpay');
const config = require('../config/env');
const logger = require('../utils/logger');
const { safeCompare } = require('../utils/crypto');

/**
 * Payment gateway.
 *
 * Runs against real Razorpay when RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are
 * configured, and against a local simulator otherwise. The simulator is not a
 * shortcut — CI and the test suite have no network and no Razorpay account, so
 * without it the whole booking suite would be unrunnable. Both modes go through
 * the same verification and webhook code paths, so what the tests exercise is
 * what production runs.
 *
 * Three secrets, three different jobs — mixing them up is the classic way to
 * get a Razorpay integration subtly wrong:
 *
 *   KEY_ID          public. Sent to the browser to open Checkout.
 *   KEY_SECRET      signs the Checkout *callback* (order_id|payment_id).
 *   WEBHOOK_SECRET  signs the *webhook* body. Set separately in the Razorpay
 *                   dashboard; it is NOT the key secret.
 */
const isLive = Boolean(config.RAZORPAY_KEY_ID && config.RAZORPAY_KEY_SECRET);

let client = null;
if (isLive) {
  client = new Razorpay({
    key_id: config.RAZORPAY_KEY_ID,
    key_secret: config.RAZORPAY_KEY_SECRET
  });
  logger.info('Payments: Razorpay (%s)', config.RAZORPAY_KEY_ID.startsWith('rzp_test') ? 'test mode' : 'LIVE MODE');
} else {
  logger.warn('Payments: no Razorpay keys configured — using the local simulator.');
}

const provider = () => (isLive ? 'razorpay' : 'simulator');

/** Razorpay works in the smallest currency unit. ₹704.00 -> 70400 paise. */
const toPaise = (rupees) => Math.round(Number(rupees) * 100);
const toRupees = (paise) => Number(paise) / 100;

/**
 * Creates an order the browser can pay against.
 * `receipt` is capped at 40 characters by Razorpay.
 */
const createOrder = async (bookingId, amount, bookingRef) => {
  if (!isLive) {
    return {
      orderId: `order_sim_${bookingId}_${crypto.randomBytes(5).toString('hex')}`,
      amount,
      currency: 'INR',
      provider: 'simulator'
    };
  }

  const order = await client.orders.create({
    amount: toPaise(amount),
    currency: 'INR',
    receipt: String(bookingRef || `booking_${bookingId}`).slice(0, 40),
    // Surfaces in the Razorpay dashboard, which is what makes a disputed
    // payment traceable back to a booking without a database lookup.
    notes: { bookingId: String(bookingId), bookingRef: String(bookingRef || '') }
  });

  return {
    orderId: order.id,
    amount: toRupees(order.amount),
    currency: order.currency,
    provider: 'razorpay'
  };
};

/**
 * Verifies the signature Razorpay Checkout hands back to the browser.
 * HMAC-SHA256 of "<order_id>|<payment_id>" keyed with the *key secret*.
 */
const verifyCheckoutSignature = ({ orderId, paymentId, signature }) => {
  if (!isLive) {
    // The simulator signs the same string with the webhook secret, so the
    // shape of the check is identical in both modes.
    const expected = crypto.createHmac('sha256', config.WEBHOOK_SECRET)
      .update(`${orderId}|${paymentId}`).digest('hex');
    return safeCompare(signature, expected);
  }

  const expected = crypto.createHmac('sha256', config.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`).digest('hex');
  return safeCompare(signature, expected);
};

/**
 * Verifies a webhook body. Razorpay signs the raw bytes with the webhook
 * secret, so this must be handed the Buffer as received — re-serialising a
 * parsed object produces a different digest.
 */
const verifyWebhookSignature = (rawBody, signature) => {
  const secret = isLive && config.RAZORPAY_WEBHOOK_SECRET
    ? config.RAZORPAY_WEBHOOK_SECRET
    : config.WEBHOOK_SECRET;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeCompare(signature, expected);
};

/** Fetches a payment from Razorpay so its amount and status can be trusted. */
const fetchPayment = async (paymentId) => {
  if (!isLive) return null;
  return client.payments.fetch(paymentId);
};

/**
 * Normalises a webhook body into the shape the handler works with.
 *
 * Razorpay sends `{ event, payload: { payment: { entity } } }` and identifies
 * the booking through the order's notes. The simulator sends a flat envelope.
 * Everything downstream sees one shape.
 */
const parseWebhookEvent = (body) => {
  // --- Razorpay ---------------------------------------------------
  if (body.event && body.payload) {
    const entity = body.payload.payment?.entity || body.payload.order?.entity || {};
    const notes = entity.notes || {};
    const captured = ['payment.captured', 'order.paid'].includes(body.event);

    return {
      // Razorpay has no per-delivery event id in the body; the payment id plus
      // the event name is unique per outcome and is what makes redelivery of
      // the same event collide on our idempotency index.
      eventId: `rzp_${body.event}_${entity.id}`,
      eventType: body.event,
      data: {
        bookingId: Number(notes.bookingId),
        orderId: entity.order_id,
        transactionId: entity.id,
        idempotencyKey: `idem_${entity.order_id || entity.id}`,
        amount: entity.amount != null ? toRupees(entity.amount) : null,
        currency: entity.currency || 'INR',
        paymentMethod: mapMethod(entity.method),
        status: captured ? 'SUCCESS' : 'FAILED',
        failureReason: entity.error_description || entity.error_reason || null
      }
    };
  }

  // --- Simulator --------------------------------------------------
  return { eventId: body.eventId, eventType: body.eventType, data: body.data || {} };
};

/** Razorpay's method names -> the payments.payment_method enum. */
const mapMethod = (method) => ({
  upi: 'UPI',
  card: 'Credit Card',
  netbanking: 'Net Banking',
  wallet: 'UPI',
  emi: 'Credit Card'
}[method] || 'UPI');

// ---------------------------------------------------------------------
// Simulator-only helpers, used by /api/payments/confirm and the test suite.
// ---------------------------------------------------------------------

const newTransactionId = () => `pay_sim_${crypto.randomBytes(8).toString('hex')}`;

const signPayload = (rawBody) =>
  crypto.createHmac('sha256', config.WEBHOOK_SECRET).update(rawBody).digest('hex');

/** Builds the callback the simulator would receive, plus its signature. */
const buildWebhookEvent = ({
  bookingId, orderId, transactionId, amount, paymentMethod, succeeded, failureReason
}) => {
  const payload = {
    eventId: `evt_${crypto.randomUUID()}`,
    eventType: succeeded ? 'payment.captured' : 'payment.failed',
    createdAt: new Date().toISOString(),
    data: {
      bookingId,
      orderId,
      transactionId,
      idempotencyKey: `idem_${orderId}`,
      amount,
      currency: 'INR',
      paymentMethod,
      status: succeeded ? 'SUCCESS' : 'FAILED',
      failureReason: succeeded ? null : (failureReason || 'Payment declined by issuing bank')
    }
  };

  const rawBody = JSON.stringify(payload);
  return { payload, rawBody, signature: signPayload(rawBody) };
};

module.exports = {
  isLive,
  provider,
  publicKey: () => config.RAZORPAY_KEY_ID || null,
  createOrder,
  verifyCheckoutSignature,
  verifyWebhookSignature,
  parseWebhookEvent,
  fetchPayment,
  toPaise,
  toRupees,
  // simulator
  newTransactionId,
  signPayload,
  buildWebhookEvent
};
