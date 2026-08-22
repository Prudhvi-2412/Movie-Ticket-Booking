const db = require('../config/db');
const { ApiError, asyncHandler } = require('../utils/ApiError');
const { recordAudit } = require('../services/auditService');

/** GET /api/admin/screens?theatreId= */
const listScreens = asyncHandler(async (req, res) => {
  const { theatreId } = req.query;

  const screens = await db.query(
    `SELECT sc.screen_id, sc.theater_id, sc.screen_number, sc.name, sc.screen_type,
            sc.total_seats, sc.is_active,
            t.name AS theater_name, l.city,
            (SELECT COUNT(*) FROM shows s
              WHERE s.screen_id = sc.screen_id AND s.is_active = TRUE AND s.show_time > NOW()) AS upcoming_shows
       FROM screens sc
       JOIN theaters t  ON t.theater_id = sc.theater_id
       JOIN locations l ON l.location_id = t.location_id
      ${theatreId ? 'WHERE sc.theater_id = ?' : ''}
      ORDER BY t.name, sc.screen_number`,
    theatreId ? [theatreId] : []
  );

  res.json({ success: true, count: screens.length, screens });
});

/** GET /api/admin/screens/:id */
const getScreen = asyncHandler(async (req, res) => {
  const rows = await db.query(
    `SELECT sc.*, t.name AS theater_name, t.theater_id, l.city
       FROM screens sc
       JOIN theaters t  ON t.theater_id = sc.theater_id
       JOIN locations l ON l.location_id = t.location_id
      WHERE sc.screen_id = ?`,
    [req.params.id]
  );
  if (rows.length === 0) throw ApiError.notFound('Screen not found.');

  const seatSummary = await db.query(
    `SELECT seat_type, COUNT(*) AS count
       FROM seats WHERE screen_id = ? AND is_active = TRUE
      GROUP BY seat_type`,
    [req.params.id]
  );

  res.json({ success: true, screen: { ...rows[0], seatSummary } });
});

/**
 * POST /api/admin/screens
 * total_seats is intentionally not accepted — it is derived from the seat map
 * by database triggers.
 */
const createScreen = asyncHandler(async (req, res) => {
  const { theater_id, screen_number, name, screen_type = 'Standard', is_active = true } = req.body;

  const theatre = await db.query('SELECT theater_id FROM theaters WHERE theater_id = ?', [theater_id]);
  if (theatre.length === 0) throw ApiError.badRequest('That theatre does not exist.');

  const duplicate = await db.query(
    'SELECT screen_id FROM screens WHERE theater_id = ? AND screen_number = ?',
    [theater_id, screen_number]
  );
  if (duplicate.length > 0) throw ApiError.conflict(`Screen ${screen_number} already exists in this theatre.`);

  const result = await db.query(
    'INSERT INTO screens (theater_id, screen_number, name, screen_type, is_active) VALUES (?, ?, ?, ?, ?)',
    [theater_id, screen_number, name ?? `Screen ${screen_number}`, screen_type, is_active]
  );

  await recordAudit(req.user.userId, 'CREATE', 'SCREEN', result.insertId, { theater_id, screen_number });
  const rows = await db.query('SELECT * FROM screens WHERE screen_id = ?', [result.insertId]);
  res.status(201).json({
    success: true,
    message: 'Screen created. Configure its seat layout next.',
    screen: rows[0]
  });
});

/** PUT /api/admin/screens/:id */
const updateScreen = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { screen_number, name, screen_type, is_active } = req.body;

  const existing = await db.query('SELECT * FROM screens WHERE screen_id = ?', [id]);
  if (existing.length === 0) throw ApiError.notFound('Screen not found.');

  if (screen_number && screen_number !== existing[0].screen_number) {
    const duplicate = await db.query(
      'SELECT screen_id FROM screens WHERE theater_id = ? AND screen_number = ? AND screen_id <> ?',
      [existing[0].theater_id, screen_number, id]
    );
    if (duplicate.length > 0) throw ApiError.conflict(`Screen ${screen_number} already exists in this theatre.`);
  }

  await db.query(
    `UPDATE screens
        SET screen_number = COALESCE(?, screen_number),
            name          = COALESCE(?, name),
            screen_type   = COALESCE(?, screen_type),
            is_active     = COALESCE(?, is_active)
      WHERE screen_id = ?`,
    [screen_number ?? null, name ?? null, screen_type ?? null, is_active ?? null, id]
  );

  await recordAudit(req.user.userId, 'UPDATE', 'SCREEN', id, req.body);
  const rows = await db.query('SELECT * FROM screens WHERE screen_id = ?', [id]);
  res.json({ success: true, message: 'Screen updated.', screen: rows[0] });
});

/** DELETE /api/admin/screens/:id */
const deleteScreen = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existing = await db.query('SELECT * FROM screens WHERE screen_id = ?', [id]);
  if (existing.length === 0) throw ApiError.notFound('Screen not found.');

  const [{ booking_count: bookingCount }] = await db.query(
    `SELECT COUNT(*) AS booking_count
       FROM bookings b JOIN shows s ON s.show_id = b.show_id
      WHERE s.screen_id = ?`,
    [id]
  );

  if (Number(bookingCount) > 0) {
    await db.query('UPDATE screens SET is_active = FALSE WHERE screen_id = ?', [id]);
    await recordAudit(req.user.userId, 'DEACTIVATE', 'SCREEN', id, { bookingCount });
    return res.json({
      success: true,
      deleted: false,
      message: `This screen has ${bookingCount} booking(s) on record and was disabled instead of deleted.`
    });
  }

  await db.query('DELETE FROM screens WHERE screen_id = ?', [id]);
  await recordAudit(req.user.userId, 'DELETE', 'SCREEN', id, { name: existing[0].name });
  return res.json({ success: true, deleted: true, message: 'Screen deleted.' });
});

module.exports = { listScreens, getScreen, createScreen, updateScreen, deleteScreen };
