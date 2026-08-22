const db = require('../config/db');
const { ApiError, asyncHandler } = require('../utils/ApiError');
const { recordAudit } = require('../services/auditService');

/**
 * GET /api/locations
 * Public list of cities a customer can book in. `?all=true` (admin) also
 * returns disabled cities.
 */
const listLocations = asyncHandler(async (req, res) => {
  const { search, includeInactive } = req.query;

  const filters = [];
  const params = [];

  if (!includeInactive) filters.push('l.is_active = TRUE');
  if (search) {
    filters.push('(l.city LIKE ? OR l.state LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const locations = await db.query(
    `SELECT l.location_id, l.city, l.state, l.country, l.is_active, l.created_at,
            COUNT(DISTINCT t.theater_id) AS theatre_count
       FROM locations l
       LEFT JOIN theaters t ON t.location_id = l.location_id AND t.is_active = TRUE
       ${where}
       GROUP BY l.location_id
       ORDER BY l.city ASC`,
    params
  );

  res.json({ success: true, count: locations.length, locations });
});

/** GET /api/locations/:id */
const getLocation = asyncHandler(async (req, res) => {
  const rows = await db.query('SELECT * FROM locations WHERE location_id = ?', [req.params.id]);
  if (rows.length === 0) throw ApiError.notFound('Location not found.');
  res.json({ success: true, location: rows[0] });
});

/** POST /api/admin/locations */
const createLocation = asyncHandler(async (req, res) => {
  const { city, state, country = 'India', is_active = true } = req.body;

  const duplicate = await db.query(
    'SELECT location_id FROM locations WHERE city = ? AND state = ? AND country = ?',
    [city, state, country]
  );
  if (duplicate.length > 0) throw ApiError.conflict(`${city} already exists.`);

  const result = await db.query(
    'INSERT INTO locations (city, state, country, is_active) VALUES (?, ?, ?, ?)',
    [city, state, country, is_active]
  );

  await recordAudit(req.user.userId, 'CREATE', 'LOCATION', result.insertId, { city, state });
  const rows = await db.query('SELECT * FROM locations WHERE location_id = ?', [result.insertId]);
  res.status(201).json({ success: true, message: `${city} added.`, location: rows[0] });
});

/** PUT /api/admin/locations/:id */
const updateLocation = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { city, state, country, is_active } = req.body;

  const existing = await db.query('SELECT * FROM locations WHERE location_id = ?', [id]);
  if (existing.length === 0) throw ApiError.notFound('Location not found.');

  await db.query(
    `UPDATE locations
        SET city = COALESCE(?, city),
            state = COALESCE(?, state),
            country = COALESCE(?, country),
            is_active = COALESCE(?, is_active)
      WHERE location_id = ?`,
    [city ?? null, state ?? null, country ?? null, is_active ?? null, id]
  );

  await recordAudit(req.user.userId, 'UPDATE', 'LOCATION', id, req.body);
  const rows = await db.query('SELECT * FROM locations WHERE location_id = ?', [id]);
  res.json({ success: true, message: 'Location updated.', location: rows[0] });
});

/**
 * DELETE /api/admin/locations/:id
 *
 * Deletes outright only when nothing depends on the row; otherwise it is
 * deactivated. Hard-deleting a city that has sold tickets would either
 * orphan them or be refused by the foreign keys, so the response says which
 * of the two happened instead of failing opaquely.
 */
const deleteLocation = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existing = await db.query('SELECT * FROM locations WHERE location_id = ?', [id]);
  if (existing.length === 0) throw ApiError.notFound('Location not found.');

  const [{ theatre_count: theatreCount }] = await db.query(
    'SELECT COUNT(*) AS theatre_count FROM theaters WHERE location_id = ?',
    [id]
  );

  if (Number(theatreCount) > 0) {
    await db.query('UPDATE locations SET is_active = FALSE WHERE location_id = ?', [id]);
    await recordAudit(req.user.userId, 'DEACTIVATE', 'LOCATION', id, { theatreCount });
    return res.json({
      success: true,
      deleted: false,
      message: `${existing[0].city} has ${theatreCount} theatre(s) and was disabled instead of deleted.`
    });
  }

  await db.query('DELETE FROM locations WHERE location_id = ?', [id]);
  await recordAudit(req.user.userId, 'DELETE', 'LOCATION', id, { city: existing[0].city });
  return res.json({ success: true, deleted: true, message: `${existing[0].city} deleted.` });
});

module.exports = { listLocations, getLocation, createLocation, updateLocation, deleteLocation };
