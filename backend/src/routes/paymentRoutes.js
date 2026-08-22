const express = require('express');
const ctrl = require('../controllers/paymentController');
const { authenticateToken } = require('../middleware/authMiddleware');
const { bookingLimiter } = require('../middleware/rateLimiterMiddleware');
const { validate, rules, Joi } = require('../middleware/validate');

const router = express.Router();
router.use(authenticateToken);

const PAYMENT_METHODS = ['UPI', 'Credit Card', 'Debit Card', 'Net Banking'];

router.post('/initiate', bookingLimiter, validate(Joi.object({
  bookingId: rules.id.required(),
  paymentMethod: Joi.string().valid(...PAYMENT_METHODS).default('UPI')
})), ctrl.initiatePayment);

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
