const express = require('express');
const { handlePaymentWebhook } = require('../controllers/webhookController');
const { webhookLimiter } = require('../middleware/rateLimiterMiddleware');

const router = express.Router();

/**
 * Public endpoint — the payment gateway calls it, so it cannot require a JWT.
 * Authentication is the HMAC signature over the request body instead.
 *
 * express.raw is essential: the signature covers the exact bytes the gateway
 * sent, and re-serialising a parsed object (different key order, different
 * whitespace) produces a different digest and would fail every check.
 */
router.post('/payment', webhookLimiter, express.raw({ type: '*/*', limit: '256kb' }), handlePaymentWebhook);

module.exports = router;
