const db = require('../config/db');
const { asyncHandler } = require('../utils/ApiError');

/**
 * GET /api/search?q=&locationId=
 *
 * Single endpoint powering the header search box: movies, theatres and
 * cities in one round trip, so the dropdown does not have to fan out to
 * three APIs on every keystroke.
 */
const globalSearch = asyncHandler(async (req, res) => {
  const { q, locationId, limit = 5 } = req.query;

  if (!q || q.trim().length < 2) {
    return res.json({ success: true, query: q || '', movies: [], theatres: [], locations: [] });
  }

  const like = `%${q.trim()}%`;

  const [movies, theatres, locations] = await Promise.all([
    db.query(
      `SELECT movie_id, title, poster_url, genre, language, certificate, rating, status
         FROM movies
        WHERE is_active = TRUE AND is_published = TRUE
          AND (title LIKE ? OR cast_list LIKE ? OR director LIKE ?)
        ORDER BY (title LIKE ?) DESC, rating DESC
        LIMIT ?`,
      [like, like, like, `${q.trim()}%`, limit]
    ),
    db.query(
      `SELECT t.theater_id, t.name, t.location, l.city
         FROM theaters t JOIN locations l ON l.location_id = t.location_id
        WHERE t.is_active = TRUE
          AND (t.name LIKE ? OR t.location LIKE ?)
          ${locationId ? 'AND t.location_id = ?' : ''}
        ORDER BY t.name LIMIT ?`,
      locationId ? [like, like, locationId, limit] : [like, like, limit]
    ),
    db.query(
      `SELECT location_id, city, state FROM locations
        WHERE is_active = TRUE AND (city LIKE ? OR state LIKE ?)
        ORDER BY city LIMIT ?`,
      [like, like, limit]
    )
  ]);

  return res.json({ success: true, query: q, movies, theatres, locations });
});

module.exports = { globalSearch };
