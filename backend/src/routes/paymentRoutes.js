const express = require('express');
const router = express.Router();
const { initiatePaymentSession } = require('../controllers/paymentController');
const { authenticateToken } = require('../middleware/authMiddleware');

router.post('/initiate', authenticateToken, initiatePaymentSession);

module.exports = router;
