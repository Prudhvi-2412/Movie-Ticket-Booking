const express = require('express');
const router = express.Router();
const { getRevenueAnalytics, getOccupancyAnalytics, getAuditLogs, getUsers, updateUserRole } = require('../controllers/adminController');
const { authenticateToken } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/rbacMiddleware');

router.use(authenticateToken);
router.use(requireRole('Admin'));

router.get('/analytics/revenue', getRevenueAnalytics);
router.get('/analytics/occupancy', getOccupancyAnalytics);
router.get('/audit-logs', getAuditLogs);
router.get('/users', getUsers);
router.put('/users/:id/role', updateUserRole);

module.exports = router;
