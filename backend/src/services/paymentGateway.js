const crypto = require('crypto');
const config = require('../config/env');

/**
 * Stand-in for a hosted payment gateway (Razorpay/Stripe shaped).
 *
 * This exists so the *integration* is real even though no money moves: the
 * server creates an order, the "gateway" signs a callback with the shared
 * secret, and the webhook endpoint verifies that signature exactly as it
 * would verify a real one.
 *
 * What matters is where the secret lives. The previous flow had the browser
 * call /payments/initiate, receive a valid HMAC signature, and then POST its
 * own webhook to confirm the booking — so any customer could mint a
 * confirmed booking for free with two requests and never pay. Signatures are
 * now produced here and never leave the process.
 *
 * Swapping in a real gateway means replacing createOrder and signPayload with
 * SDK calls; the webhook handler needs no changes.
 */

const signPayload = (rawBody) =>
  crypto.createHmac('sha256', config.WEBHOOK_SECRET).update(rawBody).digest('hex');

const createOrder = (bookingId, amount) => ({
  orderId: `order_${bookingId}_${crypto.randomBytes(6).toString('hex')}`,
  amount,
  currency: 'INR'
});

const newTransactionId = () => `txn_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

/**
 * Builds the webhook envelope a gateway would send us, plus its signature.
 * `idempotencyKey` is derived from the order, so a retried callback for the
 * same order collides on the unique index instead of paying twice.
 */
const buildWebhookEvent = ({ bookingId, orderId, transactionId, amount, paymentMethod, succeeded, failureReason }) => {
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

module.exports = { signPayload, createOrder, newTransactionId, buildWebhookEvent };
