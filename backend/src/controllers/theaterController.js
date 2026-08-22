const db = require('../config/db');
const { ApiError, asyncHandler } = require('../utils/ApiError');
const { recordAudit } = require('../services/auditService');

/** MySQL returns JSON columns already parsed on some driver versions and as text on others. */
const parseFacilities = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value); } catch { return []; }
};

const shape = (row) => ({ ...row, facilities: parseFacilities(row.facilities) });

/**
 * GET /api/theatres
 * Filters: locationId, city, movieId, date, search.
 *
 * When movieId + date are supplied this returns only theatres that actually
 * have a bookable show for that film on that day — the discovery query the
 * movie-details page needs.
 */
const listTheatres = asyncHandler(async (req, res) => {
  const { locationId, city, movieId, date, search, includeInactive } = req.query;

  const filters = [];
  const params = [];

  if (!includeInactive) filters.push('t.is_active = TRUE');
  if (locationId) { filters.push('t.location_id = ?'); params.push(locationId); }
  if (city) { filters.push('l.city = ?'); params.push(city); }
  if (search) {
    filters.push('(t.name LIKE ? OR t.location LIKE ? OR t.address LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (movieId) {
    // Half-open day range keeps the index on shows(screen_id, show_time)
    // usable; DATE(show_time) = ? would force a full scan.
    filters.push(`EXISTS (
      SELECT 1 FROM shows s
        JOIN screens sc ON sc.screen_id = s.screen_id
       WHERE sc.theater_id = t.theater_id
         AND s.movie_id = ?
         AND s.is_active = TRUE
         AND s.status = 'Scheduled'
         AND s.show_time > NOW()
         ${date ? 'AND s.show_time >= ? AND s.show_time < DATE_ADD(?, INTERVAL 1 DAY)' : ''}
    )`);
    params.push(movieId);
    if (date) params.push(date, date);
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const theatres = await db.query(
    `SELECT t.theater_id, t.name, t.location, t.address, t.contact_phone,
            t.facilities, t.is_active, t.location_id,
            l.city, l.state,
            COUNT(DISTINCT sc.screen_id) AS screen_count,
            -- Plain SUM, not SUM(DISTINCT): two screens of 96 seats are 192
            -- seats, and DISTINCT would collapse them to 96. Nothing in this
            -- query fans rows out, so no de-duplication is needed.
            COALESCE(SUM(sc.total_seats), 0) AS seat_capacity
       FROM theaters t
       JOIN locations l ON l.location_id = t.location_id
       LEFT JOIN screens sc ON sc.theater_id = t.theater_id AND sc.is_active = TRUE
       ${where}
       GROUP BY t.theater_id
       ORDER BY t.name ASC`,
    params
  );

  res.json({ success: true, count: theatres.length, theatres: theatres.map(shape) });
});

/** GET /api/theatres/:id — detail view with screens and today's activity. */
const getTheatre = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const rows = await db.query(
    `SELECT t.*, l.city, l.state, l.country
       FROM theaters t
       JOIN locations l ON l.location_id = t.location_id
      WHERE t.theater_id = ?`,
    [id]
  );
  if (rows.length === 0) throw ApiError.notFound('Theatre not found.');

  const screens = await db.query(
    `SELECT screen_id, screen_number, name, screen_type, total_seats, is_active
       FROM screens WHERE theater_id = ? ORDER BY screen_number`,
    [id]
  );

  const [stats] = await db.query(
    `SELECT
       (SELECT COUNT(*) FROM shows s
          JOIN screens sc ON sc.screen_id = s.screen_id
         WHERE sc.theater_id = ? AND s.is_active = TRUE AND s.show_time > NOW()) AS upcoming_shows,
       (SELECT COUNT(*) FROM bookings b
          JOIN shows s ON s.show_id = b.show_id
          JOIN screens sc ON sc.screen_id = s.screen_id
         WHERE sc.theater_id = ? AND b.status = 'Confirmed'
           AND DATE(b.booking_time) = CURDATE()) AS todays_bookings,
       (SELECT ROUND(AVG(occupancy_percentage), 2) FROM theater_occupancy
         WHERE theater_id = ? AND show_time >= CURDATE()) AS avg_occupancy`,
    [id, id, id]
  );

  res.json({ success: true, theatre: { ...shape(rows[0]), screens, stats } });
});

/** POST /api/admin/theatres */
const createTheatre = asyncHandler(async (req, res) => {
  const { location_id, name, location, address, contact_phone, facilities = [], is_active = true } = req.body;

  const loc = await db.query('SELECT location_id FROM locations WHERE location_id = ?', [location_id]);
  if (loc.length === 0) throw ApiError.badRequest('That location does not exist.');

  const duplicate = await db.query(
    'SELECT theater_id FROM theaters WHERE name = ? AND location_id = ?',
    [name, location_id]
  );
  if (duplicate.length > 0) throw ApiError.conflict(`A theatre named "${name}" already exists in this city.`);

  const result = await db.query(
    `INSERT INTO theaters (location_id, name, location, address, contact_phone, facilities, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [location_id, name, location, address ?? null, contact_phone ?? null, JSON.stringify(facilities), is_active]
  );

  await recordAudit(req.user.userId, 'CREATE', 'THEATRE', result.insertId, { name });
  const rows = await db.query('SELECT * FROM theaters WHERE theater_id = ?', [result.insertId]);
  res.status(201).json({ success: true, message: `${name} added.`, theatre: shape(rows[0]) });
});

/** PUT /api/admin/theatres/:id */
const updateTheatre = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { location_id, name, location, address, contact_phone, facilities, is_active } = req.body;

  const existing = await db.query('SELECT * FROM theaters WHERE theater_id = ?', [id]);
  if (existing.length === 0) throw ApiError.notFound('Theatre not found.');

  await db.query(
    `UPDATE theaters
        SET location_id   = COALESCE(?, location_id),
            name          = COALESCE(?, name),
            location      = COALESCE(?, location),
            address       = COALESCE(?, address),
            contact_phone = COALESCE(?, contact_phone),
            facilities    = COALESCE(?, facilities),
            is_active     = COALESCE(?, is_active)
      WHERE theater_id = ?`,
    [location_id ?? null, name ?? null, location ?? null, address ?? null, contact_phone ?? null,
      facilities === undefined ? null : JSON.stringify(facilities), is_active ?? null, id]
  );

  await recordAudit(req.user.userId, 'UPDATE', 'THEATRE', id, req.body);
  const rows = await db.query('SELECT * FROM theaters WHERE theater_id = ?', [id]);
  res.json({ success: true, message: 'Theatre updated.', theatre: shape(rows[0]) });
});

/** DELETE /api/admin/theatres/:id — deletes when unused, deactivates otherwise. */
const deleteTheatre = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existing = await db.query('SELECT * FROM theaters WHERE theater_id = ?', [id]);
  if (existing.length === 0) throw ApiError.notFound('Theatre not found.');

  const [{ booking_count: bookingCount }] = await db.query(
    `SELECT COUNT(*) AS booking_count
       FROM bookings b
       JOIN shows s   ON s.show_id = b.show_id
       JOIN screens sc ON sc.screen_id = s.screen_id
      WHERE sc.theater_id = ?`,
    [id]
  );

  if (Number(bookingCount) > 0) {
    await db.query('UPDATE theaters SET is_active = FALSE WHERE theater_id = ?', [id]);
    await recordAudit(req.user.userId, 'DEACTIVATE', 'THEATRE', id, { bookingCount });
    return res.json({
      success: true,
      deleted: false,
      message: `${existing[0].name} has ${bookingCount} booking(s) on record and was disabled instead of deleted.`
    });
  }

  await db.query('DELETE FROM theaters WHERE theater_id = ?', [id]);
  await recordAudit(req.user.userId, 'DELETE', 'THEATRE', id, { name: existing[0].name });
  return res.json({ success: true, deleted: true, message: `${existing[0].name} deleted.` });
});

module.exports = { listTheatres, getTheatre, createTheatre, updateTheatre, deleteTheatre };
