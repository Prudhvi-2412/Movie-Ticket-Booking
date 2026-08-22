const express = require('express');
const ctrl = require('../controllers/paymentController');
const gateway = require('../services/paymentGateway');
const { authenticateToken } = require('../middleware/authMiddleware');
const { bookingLimiter } = require('../middleware/rateLimiterMiddleware');
const { validate, rules, Joi } = require('../middleware/validate');

const router = express.Router();

const PAYMENT_METHODS = ['UPI', 'Credit Card', 'Debit Card', 'Net Banking'];

/**
 * GET /api/payments/config
 * Lets the browser know which gateway to render before a booking exists.
 * Public: it returns only the publishable key, which Razorpay Checkout
 * requires client-side anyway.
 */
router.get('/config', (req, res) => {
  res.json({
    success: true,
    provider: gateway.provider(),
    keyId: gateway.publicKey(),
    testMode: gateway.isTestMode(),
    // Drives whether the UI offers "mark as paid". Decided by the server so
    // the button cannot be conjured up client-side against live credentials.
    allowsTestBypass: gateway.allowsTestBypass()
  });
});

router.use(authenticateToken);

router.post('/initiate', bookingLimiter, validate(Joi.object({
  bookingId: rules.id.required(),
  paymentMethod: Joi.string().valid(...PAYMENT_METHODS).default('UPI')
})), ctrl.initiatePayment);

// Razorpay Checkout success handler posts these three fields verbatim.
router.post('/verify', bookingLimiter, validate(Joi.object({
  bookingId: rules.id.required(),
  razorpay_order_id: Joi.string().max(100).required(),
  razorpay_payment_id: Joi.string().max(100).required(),
  razorpay_signature: Joi.string().max(256).required()
})), ctrl.verifyPayment);

router.post('/cancel', validate(Joi.object({
  bookingId: rules.id.required()
})), ctrl.cancelPaymentAttempt);

// Simulator only — rejected with 403 when Razorpay keys are configured.
router.post('/confirm', bookingLimiter, validate(Joi.object({
  bookingId: rules.id.required(),
  orderId: Joi.string().max(100),
  paymentMethod: Joi.string().valid(...PAYMENT_METHODS).default('UPI'),
  outcome: Joi.string().valid('success', 'failure').default('success'),
  failureReason: Joi.string().max(255)
})), ctrl.confirmPayment);

router.get('/booking/:bookingId', validate(Joi.object({
  bookingId: rules.id.required()
}), 'params'), ctrl.getPaymentsForBooking);

module.exports = router;
