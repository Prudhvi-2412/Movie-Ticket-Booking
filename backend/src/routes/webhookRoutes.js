const express = require('express');
const router = express.Router();
const { handlePaymentWebhook } = require('../controllers/webhookController');

// Webhooks must be public endpoints
router.post('/payment', handlePaymentWebhook);

module.exports = router;
