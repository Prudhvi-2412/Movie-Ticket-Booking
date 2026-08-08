const express = require('express');
const router = express.Router();
const { getShowSeats, createShow, triggerDynamicPrice } = require('../controllers/showController');
const { authenticateToken } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/rbacMiddleware');

// Optional auth for getShowSeats to know if user locked seat
router.get('/:showId/seats', (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    return authenticateToken(req, res, next);
  }
  next();
}, getShowSeats);

router.post('/', authenticateToken, requireRole('Admin'), createShow);
router.post('/:showId/dynamic-price', authenticateToken, requireRole('Admin'), triggerDynamicPrice);

module.exports = router;
