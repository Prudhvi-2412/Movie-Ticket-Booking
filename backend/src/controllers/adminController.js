const db = require('../config/db');
const { ApiError, asyncHandler } = require('../utils/ApiError');
const { recordAudit } = require('../services/auditService');
const { attachSeats } = require('./bookingController');

const num = (v) => Number(v || 0);

/**
 * GET /api/admin/dashboard
 *
 * Every figure is a live aggregate. Nothing here is a constant, and the
 * trend arrays come from the daily_booking_trend view rather than being
 * synthesised in the browser.
 */
const getDashboard = asyncHandler(async (req, res) => {
  const [
    [totals], [today], [catalogue], topMovies, topTheatres, recentBookings, revenueTrend, occupancy
  ] = await Promise.all([
    db.query(`
      SELECT
        COALESCE(SUM(CASE WHEN status = 'Confirmed' THEN total_amount END), 0) AS total_revenue,
        COUNT(*)                                    AS total_bookings,
        SUM(status = 'Confirmed')                   AS confirmed_bookings,
        SUM(status IN ('Cancelled', 'Refunded'))    AS cancelled_bookings
      FROM bookings`),
    db.query(`
      SELECT
        COALESCE(SUM(CASE WHEN status = 'Confirmed' THEN total_amount END), 0) AS today_revenue,
        COUNT(*) AS today_bookings
      FROM bookings WHERE DATE(booking_time) = CURDATE()`),
    db.query(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE role = 'Customer' AND is_active = TRUE) AS total_users,
        (SELECT COUNT(*) FROM movies WHERE is_active = TRUE)                      AS total_movies,
        (SELECT COUNT(*) FROM movies WHERE is_active = TRUE AND status = 'NowShowing') AS now_showing,
        (SELECT COUNT(*) FROM theaters WHERE is_active = TRUE)                    AS active_theatres,
        (SELECT COUNT(*) FROM screens WHERE is_active = TRUE)                     AS active_screens,
        (SELECT COUNT(*) FROM locations WHERE is_active = TRUE)                   AS active_locations,
        (SELECT COUNT(*) FROM shows WHERE is_active = TRUE AND show_time > NOW()) AS upcoming_shows`),
    db.query('SELECT * FROM movie_revenue WHERE total_bookings > 0 ORDER BY total_revenue DESC LIMIT 5'),
    db.query('SELECT * FROM theater_revenue ORDER BY total_revenue DESC LIMIT 5'),
    db.query(`
      SELECT b.booking_id, b.booking_ref, b.total_amount, b.status, b.booking_time,
             u.full_name AS customer_name, u.email AS customer_email,
             m.title AS movie_title, t.name AS theater_name, s.show_time
        FROM bookings b
        JOIN users u     ON u.user_id = b.user_id
        JOIN shows s     ON s.show_id = b.show_id
        JOIN movies m    ON m.movie_id = s.movie_id
        JOIN screens sc  ON sc.screen_id = s.screen_id
        JOIN theaters t  ON t.theater_id = sc.theater_id
       ORDER BY b.booking_time DESC LIMIT 8`),
    db.query('SELECT * FROM daily_booking_trend ORDER BY booking_date ASC'),
    // Window spans recently-played *and* currently-on-sale shows. Limiting it
    // to the past alone reports 0% on any deployment whose schedule is still
    // entirely ahead of it, which reads as a broken metric rather than an
    // empty one.
    db.query(`
      SELECT ROUND(AVG(occupancy_percentage), 2) AS avg_occupancy
        FROM theater_occupancy
       WHERE show_time BETWEEN DATE_SUB(NOW(), INTERVAL 7 DAY)
                           AND DATE_ADD(NOW(), INTERVAL 7 DAY)`)
  ]);

  res.json({
    success: true,
    kpis: {
      totalRevenue: num(totals.total_revenue),
      todayRevenue: num(today.today_revenue),
      totalBookings: num(totals.total_bookings),
      todayBookings: num(today.today_bookings),
      confirmedBookings: num(totals.confirmed_bookings),
      cancelledBookings: num(totals.cancelled_bookings),
      cancellationRate: num(totals.total_bookings)
        ? Math.round((num(totals.cancelled_bookings) / num(totals.total_bookings)) * 1000) / 10
        : 0,
      totalUsers: num(catalogue.total_users),
      totalMovies: num(catalogue.total_movies),
      nowShowing: num(catalogue.now_showing),
      activeTheatres: num(catalogue.active_theatres),
      activeScreens: num(catalogue.active_screens),
      activeLocations: num(catalogue.active_locations),
      upcomingShows: num(catalogue.upcoming_shows),
      occupancyRate: num(occupancy[0]?.avg_occupancy)
    },
    topMovies,
    topTheatres,
    recentBookings,
    revenueTrend
  });
});

/** GET /api/admin/analytics — the full analytics set, all view-backed. */
const getAnalytics = asyncHandler(async (req, res) => {
  const [
    revenueByMovie, revenueByTheatre, revenueByLocation,
    occupancy, dailyTrend, peakHours, seatCategories, paymentOutcomes
  ] = await Promise.all([
    db.query('SELECT * FROM movie_revenue ORDER BY total_revenue DESC'),
    db.query('SELECT * FROM theater_revenue ORDER BY total_revenue DESC'),
    db.query('SELECT * FROM location_revenue ORDER BY total_revenue DESC'),
    db.query(`SELECT * FROM theater_occupancy
               WHERE show_time BETWEEN DATE_SUB(NOW(), INTERVAL 7 DAY) AND DATE_ADD(NOW(), INTERVAL 7 DAY)
               ORDER BY occupancy_percentage DESC LIMIT 50`),
    db.query('SELECT * FROM daily_booking_trend ORDER BY booking_date ASC'),
    db.query('SELECT * FROM peak_booking_hours ORDER BY hour_of_day ASC'),
    db.query('SELECT * FROM seat_category_performance ORDER BY revenue DESC'),
    db.query('SELECT * FROM payment_outcomes')
  ]);

  const attempts = paymentOutcomes.reduce((sum, r) => sum + num(r.attempts), 0);
  const successes = paymentOutcomes
    .filter((r) => r.payment_status === 'Success')
    .reduce((sum, r) => sum + num(r.attempts), 0);

  res.json({
    success: true,
    revenueByMovie,
    revenueByTheatre,
    revenueByLocation,
    occupancy,
    dailyTrend,
    peakHours,
    seatCategories,
    paymentOutcomes,
    paymentSuccessRate: attempts ? Math.round((successes / attempts) * 1000) / 10 : 0
  });
});

/** Kept for backwards compatibility with the original two analytics routes. */
const getRevenueAnalytics = asyncHandler(async (req, res) => {
  const revenue = await db.query('SELECT * FROM movie_revenue ORDER BY total_revenue DESC');
  res.json({ success: true, revenue });
});

const getOccupancyAnalytics = asyncHandler(async (req, res) => {
  const occupancy = await db.query(
    `SELECT * FROM theater_occupancy WHERE show_time > DATE_SUB(NOW(), INTERVAL 1 DAY)
      ORDER BY occupancy_percentage DESC LIMIT 100`
  );
  res.json({ success: true, occupancy });
});

/** GET /api/admin/bookings — every booking, filterable. */
const listAllBookings = asyncHandler(async (req, res) => {
  const { status, search, from, to, page = 1, limit = 25 } = req.query;

  const filters = [];
  const params = [];

  if (status) { filters.push('b.status = ?'); params.push(status); }
  if (from) { filters.push('b.booking_time >= ?'); params.push(from); }
  if (to) { filters.push('b.booking_time < DATE_ADD(?, INTERVAL 1 DAY)'); params.push(to); }
  if (search) {
    filters.push('(b.booking_ref LIKE ? OR u.full_name LIKE ? OR u.email LIKE ? OR m.title LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const offset = (page - 1) * limit;

  const [rows, [{ total }]] = await Promise.all([
    db.query(
      `SELECT b.booking_id, b.booking_ref, b.total_amount, b.status, b.booking_time,
              u.user_id, u.full_name AS customer_name, u.email AS customer_email,
              m.title AS movie_title, t.name AS theater_name,
              sc.screen_number, s.show_time, s.show_id
         FROM bookings b
         JOIN users u    ON u.user_id = b.user_id
         JOIN shows s    ON s.show_id = b.show_id
         JOIN movies m   ON m.movie_id = s.movie_id
         JOIN screens sc ON sc.screen_id = s.screen_id
         JOIN theaters t ON t.theater_id = sc.theater_id
         ${where}
        ORDER BY b.booking_time DESC
        LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    ),
    db.query(
      `SELECT COUNT(*) AS total FROM bookings b
         JOIN users u  ON u.user_id = b.user_id
         JOIN shows s  ON s.show_id = b.show_id
         JOIN movies m ON m.movie_id = s.movie_id
         ${where}`,
      params
    )
  ]);

  const bookings = await attachSeats(rows);

  res.json({
    success: true,
    bookings,
    pagination: { page, limit, total: num(total), pages: Math.ceil(num(total) / limit) }
  });
});

/** GET /api/admin/users */
const getUsers = asyncHandler(async (req, res) => {
  const { search, role, page = 1, limit = 25 } = req.query;

  const filters = [];
  const params = [];
  if (role) { filters.push('u.role = ?'); params.push(role); }
  if (search) {
    filters.push('(u.full_name LIKE ? OR u.email LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const offset = (page - 1) * limit;

  const [users, [{ total }]] = await Promise.all([
    db.query(
      `SELECT u.user_id, u.full_name, u.email, u.role, u.is_active, u.created_at,
              COUNT(b.booking_id) AS booking_count,
              COALESCE(SUM(CASE WHEN b.status = 'Confirmed' THEN b.total_amount END), 0) AS lifetime_value
         FROM users u
         LEFT JOIN bookings b ON b.user_id = u.user_id
         ${where}
        GROUP BY u.user_id
        ORDER BY u.created_at DESC
        LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    ),
    db.query(`SELECT COUNT(*) AS total FROM users u ${where}`, params)
  ]);

  res.json({
    success: true,
    users,
    pagination: { page, limit, total: num(total), pages: Math.ceil(num(total) / limit) }
  });
});

/** PUT /api/admin/users/:id/role */
const updateUserRole = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  if (Number(id) === req.user.userId && role !== 'Admin') {
    // Without this an admin can lock themselves out of the dashboard.
    throw ApiError.badRequest('You cannot remove your own admin access.');
  }

  const existing = await db.query('SELECT user_id, email FROM users WHERE user_id = ?', [id]);
  if (existing.length === 0) throw ApiError.notFound('User not found.');

  // Changing a role invalidates any refresh token carrying the old claim.
  await db.query('UPDATE users SET role = ?, refresh_token = NULL WHERE user_id = ?', [role, id]);
  await recordAudit(req.user.userId, 'UPDATE_ROLE', 'USER', id, { role });

  res.json({ success: true, message: `${existing[0].email} is now ${role}.` });
});

/** PUT /api/admin/users/:id/status */
const updateUserStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { is_active } = req.body;

  if (Number(id) === req.user.userId) {
    throw ApiError.badRequest('You cannot deactivate your own account.');
  }

  const existing = await db.query('SELECT email FROM users WHERE user_id = ?', [id]);
  if (existing.length === 0) throw ApiError.notFound('User not found.');

  await db.query('UPDATE users SET is_active = ?, refresh_token = NULL WHERE user_id = ?', [is_active, id]);
  await recordAudit(req.user.userId, is_active ? 'ACTIVATE' : 'DEACTIVATE', 'USER', id, {});

  res.json({ success: true, message: `${existing[0].email} ${is_active ? 'activated' : 'deactivated'}.` });
});

/** GET /api/admin/audit-logs */
const getAuditLogs = asyncHandler(async (req, res) => {
  const { limit = 100 } = req.query;
  const logs = await db.query(
    `SELECT a.audit_id, a.action, a.entity, a.entity_id, a.details, a.created_at,
            u.full_name AS actor_name, u.email AS actor_email
       FROM audit_logs a
       LEFT JOIN users u ON u.user_id = a.user_id
      ORDER BY a.created_at DESC LIMIT ?`,
    [limit]
  );
  res.json({ success: true, logs });
});

/** GET /api/admin/webhook-logs — payment event ledger, incl. duplicates rejected. */
const getWebhookLogs = asyncHandler(async (req, res) => {
  const { limit = 100 } = req.query;
  const logs = await db.query(
    `SELECT log_id, event_id, event_type, idempotency_key, status, error_message, created_at, processed_at
       FROM webhook_logs ORDER BY created_at DESC LIMIT ?`,
    [limit]
  );
  res.json({ success: true, logs });
});

module.exports = {
  getDashboard, getAnalytics, getRevenueAnalytics, getOccupancyAnalytics,
  listAllBookings, getUsers, updateUserRole, updateUserStatus, getAuditLogs, getWebhookLogs
};
