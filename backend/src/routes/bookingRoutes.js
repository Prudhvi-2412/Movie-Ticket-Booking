const express = require('express');
const router = express.Router();
const { lockSeats, createBooking, cancelBooking, getUserBookings } = require('../controllers/bookingController');
const { authenticateToken } = require('../middleware/authMiddleware');

router.use(authenticateToken);

router.post('/lock-seats', lockSeats);
router.post('/create', createBooking);
router.post('/:id/cancel', cancelBooking);
router.get('/my-bookings', getUserBookings);

module.exports = router;
