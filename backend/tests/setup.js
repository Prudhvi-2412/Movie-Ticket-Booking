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
delete process.env.RAZORPAY_KEY_ID;
delete process.env.RAZORPAY_KEY_SECRET;
delete process.env.RAZORPAY_WEBHOOK_SECRET;

process.env.NODE_ENV = 'test';
