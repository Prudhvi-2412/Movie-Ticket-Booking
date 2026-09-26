const express = require('express');
const db = require('../config/db');
const { authenticateToken } = require('../middleware/authMiddleware');
const { asyncHandler } = require('../utils/ApiError');

const router = express.Router();
router.use(authenticateToken);

router.get('/', asyncHandler(async (req, res) => {
  const notifications = await db.query(
    `SELECT notification_id, booking_id, title, message, is_read, created_at
       FROM notifications WHERE user_id = ?
       ORDER BY created_at DESC, notification_id DESC LIMIT 100`,
    [req.user.userId]
  );
  const [unread] = await db.query(
    'SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0',
    [req.user.userId]
  );
  res.json({ success: true, notifications, unreadCount: unread.count });
}));

router.patch('/:id/read', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid notification ID.' });
  }
  const result = await db.query(
    'UPDATE notifications SET is_read = 1 WHERE notification_id = ? AND user_id = ?',
    [id, req.user.userId]
  );
  if (!result.affectedRows) {
    return res.status(404).json({ success: false, message: 'Notification not found.' });
  }
  res.json({ success: true });
}));

module.exports = router;
