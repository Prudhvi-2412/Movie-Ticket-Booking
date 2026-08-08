const express = require('express');
const router = express.Router();
const { register, login, refreshToken, me } = require('../controllers/authController');
const { authenticateToken } = require('../middleware/authMiddleware');
const { authLimiter } = require('../middleware/rateLimiterMiddleware');

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/refresh-token', refreshToken);
router.get('/me', authenticateToken, me);

module.exports = router;
