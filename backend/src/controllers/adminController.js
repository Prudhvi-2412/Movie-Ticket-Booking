const db = require('../config/db');
const logger = require('../utils/logger');

const getRevenueAnalytics = async (req, res, next) => {
  try {
    const revenueRows = await db.query('SELECT * FROM movie_revenue ORDER BY total_revenue DESC');
    res.json({ success: true, revenue: revenueRows });
  } catch (err) {
    next(err);
  }
};

const getOccupancyAnalytics = async (req, res, next) => {
  try {
    const occupancyRows = await db.query('SELECT * FROM theater_occupancy ORDER BY occupancy_percentage DESC');
    res.json({ success: true, occupancy: occupancyRows });
  } catch (err) {
    next(err);
  }
};

const getAuditLogs = async (req, res, next) => {
  try {
    const logs = await db.query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100');
    res.json({ success: true, logs });
  } catch (err) {
    next(err);
  }
};

const getUsers = async (req, res, next) => {
  try {
    const users = await db.query('SELECT user_id, full_name, email, role, is_active, created_at FROM users ORDER BY created_at DESC');
    res.json({ success: true, users });
  } catch (err) {
    next(err);
  }
};

const updateUserRole = async (req, res, next) => {
  try {
    const userId = req.params.id;
    const { role } = req.body;
    
    if (!['Customer', 'Admin'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    await db.query('UPDATE users SET role = ? WHERE user_id = ?', [role, userId]);
    res.json({ success: true, message: `User role updated to ${role}` });
  } catch (err) {
    next(err);
  }
};

module.exports = { getRevenueAnalytics, getOccupancyAnalytics, getAuditLogs, getUsers, updateUserRole };
