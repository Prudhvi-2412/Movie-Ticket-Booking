const express = require('express');
const ctrl = require('../controllers/bookingController');
const { authenticateToken } = require('../middleware/authMiddleware');
const { bookingLimiter } = require('../middleware/rateLimiterMiddleware');
const { validate, rules, Joi } = require('../middleware/validate');

const router = express.Router();
router.use(authenticateToken);

const seatSelectionSchema = Joi.object({
  showId: rules.id.required(),
  seatIds: Joi.array().items(rules.id).min(1).max(10).unique().required()
});

const idParam = validate(Joi.object({ id: rules.id.required() }), 'params');

router.post('/lock-seats', bookingLimiter, validate(seatSelectionSchema), ctrl.lockSeats);
router.post('/', bookingLimiter, validate(seatSelectionSchema), ctrl.createBooking);

router.get('/my', validate(Joi.object({
  status: Joi.string().valid(
    'Pending', 'PaymentProcessing', 'Confirmed', 'PaymentFailed', 'Cancelled', 'Refunded', 'Expired'
  )
}), 'query'), ctrl.getMyBookings);

router.get('/:id', idParam, ctrl.getBooking);
router.get('/:id/ticket', idParam, ctrl.getTicket);
router.post('/:id/cancel', idParam, ctrl.cancelBooking);

// --- Legacy aliases --------------------------------------------------
// The original frontend called POST /bookings/create and GET
// /bookings/my-bookings. Kept so nothing that still uses those paths breaks.
router.post('/create', bookingLimiter, validate(seatSelectionSchema), ctrl.createBooking);
router.get('/my-bookings', ctrl.getMyBookings);

module.exports = router;
