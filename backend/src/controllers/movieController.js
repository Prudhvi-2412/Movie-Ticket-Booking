const db = require('../config/db');
const { ApiError, asyncHandler } = require('../utils/ApiError');
const { recordAudit } = require('../services/auditService');
const { getCache, setCache, invalidateCachePattern, CACHE_KEYS } = require('../redis/cache');

/**
 * GET /api/movies
 *
 * Filters: locationId, status, genre, language, search, sort.
 *
 * locationId is the important one: the customer picks a city first, and a
 * film should only appear if it has an upcoming show in that city. The old
 * endpoint returned the entire catalogue regardless of location, so users
 * could open a movie and find nowhere to watch it.
 */
const listMovies = asyncHandler(async (req, res) => {
  const { locationId, status, genre, language, search, sort = 'release', includeUnpublished } = req.query;

  const filters = ['m.is_active = TRUE'];
  const params = [];

  if (!includeUnpublished) filters.push('m.is_published = TRUE');
  if (status) { filters.push('m.status = ?'); params.push(status); }
  if (genre && genre !== 'All') { filters.push('m.genre = ?'); params.push(genre); }
  if (language && language !== 'All') { filters.push('m.language = ?'); params.push(language); }
  if (search) {
    filters.push('(m.title LIKE ? OR m.description LIKE ? OR m.cast_list LIKE ? OR m.director LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }

  // Upcoming films have no shows yet, so a location filter must not hide them.
  if (locationId) {
    filters.push(`(m.status = 'ComingSoon' OR EXISTS (
      SELECT 1 FROM shows s
        JOIN screens sc ON sc.screen_id = s.screen_id
        JOIN theaters t ON t.theater_id = sc.theater_id
       WHERE s.movie_id = m.movie_id
         AND t.location_id = ?
         AND t.is_active = TRUE
         AND s.is_active = TRUE
         AND s.status = 'Scheduled'
         AND s.show_time > NOW()
    ))`);
    params.push(locationId);
  }

  const orderBy = {
    release: 'm.release_date DESC',
    rating: 'm.rating DESC',
    title: 'm.title ASC',
    popular: 'booking_count DESC, m.rating DESC'
  }[sort] || 'm.release_date DESC';

  const movies = await db.query(
    `SELECT m.movie_id, m.title, m.description, m.genre, m.language, m.duration_minutes,
            m.certificate, m.release_date, m.rating, m.poster_url, m.banner_url,
            m.trailer_url, m.director, m.cast_list, m.status, m.is_published,
            (SELECT COUNT(*) FROM bookings b
               JOIN shows s2 ON s2.show_id = b.show_id
              WHERE s2.movie_id = m.movie_id AND b.status = 'Confirmed') AS booking_count
       FROM movies m
      WHERE ${filters.join(' AND ')}
      ORDER BY ${orderBy}`,
    params
  );

  res.json({ success: true, count: movies.length, movies });
});

/**
 * GET /api/movies/:id
 * Optional ?locationId & ?date scope the returned showtimes to what the
 * customer can actually book.
 */
const getMovie = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { locationId, date } = req.query;

  const movies = await db.query(
    'SELECT * FROM movies WHERE movie_id = ? AND is_active = TRUE',
    [id]
  );
  if (movies.length === 0) throw ApiError.notFound('Movie not found.');

  const params = [id];
  let locationClause = '';
  let dateClause = '';

  if (locationId) { locationClause = 'AND t.location_id = ?'; params.push(locationId); }
  if (date) {
    dateClause = 'AND s.show_time >= ? AND s.show_time < DATE_ADD(?, INTERVAL 1 DAY)';
    params.push(date, date);
  }

  const shows = await db.query(
    `SELECT s.show_id, s.show_time, s.end_time, s.base_price, s.demand_multiplier,
            sc.screen_id, sc.screen_number, sc.name AS screen_name, sc.screen_type, sc.total_seats,
            t.theater_id, t.name AS theater_name, t.location AS theater_locality, t.facilities,
            l.location_id, l.city,
            GetScreenStatus(s.show_id) AS fill_status,
            COALESCE((SELECT MIN(price) FROM show_pricing sp WHERE sp.show_id = s.show_id), s.base_price)
              * s.demand_multiplier AS from_price
       FROM shows s
       JOIN screens sc  ON sc.screen_id = s.screen_id
       JOIN theaters t  ON t.theater_id = sc.theater_id
       JOIN locations l ON l.location_id = t.location_id
      WHERE s.movie_id = ?
        AND s.is_active = TRUE
        AND s.status = 'Scheduled'
        AND s.show_time > NOW()
        AND t.is_active = TRUE
        AND sc.is_active = TRUE
        ${locationClause}
        ${dateClause}
      ORDER BY s.show_time ASC`,
    params
  );

  // Group by theatre so the UI can render "PVR Nexus -> 12:30, 15:45, 19:15".
  const theatreMap = new Map();
  for (const show of shows) {
    if (!theatreMap.has(show.theater_id)) {
      theatreMap.set(show.theater_id, {
        theater_id: show.theater_id,
        theater_name: show.theater_name,
        locality: show.theater_locality,
        city: show.city,
        facilities: typeof show.facilities === 'string'
          ? JSON.parse(show.facilities || '[]')
          : (show.facilities || []),
        shows: []
      });
    }
    theatreMap.get(show.theater_id).shows.push({
      show_id: show.show_id,
      show_time: show.show_time,
      end_time: show.end_time,
      screen_number: show.screen_number,
      screen_name: show.screen_name,
      screen_type: show.screen_type,
      fill_status: show.fill_status,
      from_price: Math.round(Number(show.from_price))
    });
  }

  // Which of the next 7 days actually have shows, for the date strip.
  const availableDates = await db.query(
    `SELECT DATE(s.show_time) AS show_date, COUNT(*) AS show_count
       FROM shows s
       JOIN screens sc ON sc.screen_id = s.screen_id
       JOIN theaters t ON t.theater_id = sc.theater_id
      WHERE s.movie_id = ? AND s.is_active = TRUE AND s.status = 'Scheduled'
        AND s.show_time > NOW()
        AND s.show_time < DATE_ADD(CURDATE(), INTERVAL 8 DAY)
        AND t.is_active = TRUE
        ${locationId ? 'AND t.location_id = ?' : ''}
      GROUP BY DATE(s.show_time)
      ORDER BY show_date`,
    locationId ? [id, locationId] : [id]
  );

  res.json({
    success: true,
    movie: movies[0],
    availableDates,
    theatres: [...theatreMap.values()],
    showCount: shows.length
  });
});

/** GET /api/movies/meta/filters — genres and languages actually in the catalogue. */
const getFilterOptions = asyncHandler(async (req, res) => {
  const cached = await getCache(CACHE_KEYS.FILTER_OPTIONS);
  if (cached) return res.json({ success: true, ...cached, cached: true });

  const [genres, languages] = await Promise.all([
    db.query("SELECT DISTINCT genre FROM movies WHERE is_active = TRUE AND genre IS NOT NULL ORDER BY genre"),
    db.query("SELECT DISTINCT language FROM movies WHERE is_active = TRUE AND language IS NOT NULL ORDER BY language")
  ]);

  const payload = {
    genres: genres.map((g) => g.genre),
    languages: languages.map((l) => l.language)
  };
  await setCache(CACHE_KEYS.FILTER_OPTIONS, payload, 300);
  return res.json({ success: true, ...payload });
});

const MOVIE_FIELDS = [
  'title', 'description', 'genre', 'language', 'duration_minutes', 'certificate',
  'release_date', 'rating', 'poster_url', 'banner_url', 'trailer_url',
  'director', 'cast_list', 'status', 'is_published'
];

/** POST /api/admin/movies */
const createMovie = asyncHandler(async (req, res) => {
  const values = MOVIE_FIELDS.map((f) => (req.body[f] === undefined ? null : req.body[f]));

  const result = await db.query(
    `INSERT INTO movies (${MOVIE_FIELDS.join(', ')}) VALUES (${MOVIE_FIELDS.map(() => '?').join(', ')})`,
    values
  );

  await invalidateCachePattern('cache:movies:*');
  await recordAudit(req.user.userId, 'CREATE', 'MOVIE', result.insertId, { title: req.body.title });

  const rows = await db.query('SELECT * FROM movies WHERE movie_id = ?', [result.insertId]);
  res.status(201).json({ success: true, message: `"${req.body.title}" added.`, movie: rows[0] });
});

/** PUT /api/admin/movies/:id */
const updateMovie = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existing = await db.query('SELECT movie_id FROM movies WHERE movie_id = ? AND is_active = TRUE', [id]);
  if (existing.length === 0) throw ApiError.notFound('Movie not found.');

  // Build the SET list from supplied fields only, so an omitted field is left
  // alone rather than being overwritten with NULL.
  const updates = MOVIE_FIELDS.filter((f) => req.body[f] !== undefined);
  if (updates.length === 0) throw ApiError.badRequest('No fields to update.');

  await db.query(
    `UPDATE movies SET ${updates.map((f) => `${f} = ?`).join(', ')} WHERE movie_id = ?`,
    [...updates.map((f) => req.body[f]), id]
  );

  await invalidateCachePattern('cache:movies:*');
  await recordAudit(req.user.userId, 'UPDATE', 'MOVIE', id, req.body);

  const rows = await db.query('SELECT * FROM movies WHERE movie_id = ?', [id]);
  res.json({ success: true, message: 'Movie updated.', movie: rows[0] });
});

/** DELETE /api/admin/movies/:id — soft delete; tickets already sold stay valid. */
const deleteMovie = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existing = await db.query('SELECT title FROM movies WHERE movie_id = ? AND is_active = TRUE', [id]);
  if (existing.length === 0) throw ApiError.notFound('Movie not found.');

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('UPDATE movies SET is_active = FALSE, is_published = FALSE WHERE movie_id = ?', [id]);
    // Pull its future shows off sale too, otherwise they stay bookable.
    await connection.query(
      "UPDATE shows SET is_active = FALSE WHERE movie_id = ? AND show_time > NOW()",
      [id]
    );
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }

  await invalidateCachePattern('cache:movies:*');
  await recordAudit(req.user.userId, 'DELETE', 'MOVIE', id, { title: existing[0].title });
  res.json({ success: true, message: `"${existing[0].title}" removed and its upcoming shows withdrawn.` });
});

module.exports = { listMovies, getMovie, getFilterOptions, createMovie, updateMovie, deleteMovie };
