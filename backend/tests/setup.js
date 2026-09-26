/**
 * Forces the payment simulator for the test suite.
 *
 * Runs via jest's `setupFiles`, which executes before any test module is
 * required — so paymentGateway.js sees these cleared and never constructs a
 * Razorpay client.
 *
 * The suite must not depend on network access or a live Razorpay account, and
 * it must not create real orders against the account on every run. The
 * simulator goes through the same verification, idempotency and state-machine
 * code, so what is asserted here is what production executes.
 */
// Keep empty variables defined: dotenv does not overwrite them with keys from
// backend/.env, so tests cannot accidentally call a real Razorpay account.
process.env.RAZORPAY_KEY_ID = '';
process.env.RAZORPAY_KEY_SECRET = '';
process.env.RAZORPAY_WEBHOOK_SECRET = '';

process.env.NODE_ENV = 'test';
