const db = require('../config/db');
const { getCache, setCache, CACHE_KEYS, invalidateCachePattern } = require('../redis/cache');
const logger = require('../utils/logger');

const getMovies = async (req, res, next) => {
  try {
    const { genre, language, search } = req.query;

    // Cache strategy for default listing
    if (!genre && !language && !search) {
      const cached = await getCache(CACHE_KEYS.ALL_MOVIES);
      if (cached) {
        return res.json({ success: true, cached: true, movies: cached });
      }
    }

    let sql = 'SELECT * FROM movies WHERE is_active = TRUE';
    const params = [];

    if (genre) {
      sql += ' AND genre = ?';
      params.push(genre);
    }
    if (language) {
      sql += ' AND language = ?';
      params.push(language);
    }
    if (search) {
      sql += ' AND (title LIKE ? OR description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    sql += ' ORDER BY release_date DESC';

    const movies = await db.query(sql, params);

    if (!genre && !language && !search) {
      await setCache(CACHE_KEYS.ALL_MOVIES, movies, 300);
    }

    res.json({ success: true, count: movies.length, movies });
  } catch (err) {
    next(err);
  }
};

const getMovieById = async (req, res, next) => {
  try {
    const movieId = req.params.id;
    const cacheKey = CACHE_KEYS.MOVIE_DETAILS(movieId);
    
    const cached = await getCache(cacheKey);
    if (cached) {
      return res.json({ success: true, cached: true, movie: cached });
    }

    const movies = await db.query('SELECT * FROM movies WHERE movie_id = ? AND is_active = TRUE', [movieId]);
    if (movies.length === 0) {
      return res.status(404).json({ success: false, message: 'Movie not found' });
    }

    const movie = movies[0];
    
    // Also fetch available shows for this movie
    const shows = await db.query(`
      SELECT s.show_id, s.show_time, s.price, sc.screen_number, sc.total_seats, t.name as theater_name, t.location, t.city
      FROM shows s
      JOIN screens sc ON s.screen_id = sc.screen_id
      JOIN theaters t ON sc.theater_id = t.theater_id
      WHERE s.movie_id = ? AND s.show_time > NOW()
      ORDER BY s.show_time ASC
    `, [movieId]);

    const responseData = { ...movie, shows };
    await setCache(cacheKey, responseData, 300);

    res.json({ success: true, movie: responseData });
  } catch (err) {
    next(err);
  }
};

const createMovie = async (req, res, next) => {
  try {
    const { title, description, genre, language, duration_minutes, release_date, rating, poster_url, banner_url, director, cast, trailer_url } = req.body;

    const result = await db.query(
      `INSERT INTO movies (title, description, genre, language, duration_minutes, release_date, rating, poster_url, banner_url, director, cast, trailer_url) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, description, genre, language, duration_minutes, release_date, rating || 8.0, poster_url, banner_url, director, cast, trailer_url]
    );

    await invalidateCachePattern('cache:movies:*');

    res.status(201).json({
      success: true,
      message: 'Movie created successfully',
      movieId: result.insertId
    });
  } catch (err) {
    next(err);
  }
};

const updateMovie = async (req, res, next) => {
  try {
    const movieId = req.params.id;
    const fields = req.body;

    const updates = [];
    const params = [];
    for (const [key, value] of Object.entries(fields)) {
      updates.push(`${key} = ?`);
      params.push(value);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields provided to update' });
    }

    params.push(movieId);
    await db.query(`UPDATE movies SET ${updates.join(', ')} WHERE movie_id = ?`, params);

    await invalidateCachePattern('cache:movies:*');

    res.json({ success: true, message: 'Movie updated successfully' });
  } catch (err) {
    next(err);
  }
};

const deleteMovie = async (req, res, next) => {
  try {
    const movieId = req.params.id;
    // Soft delete
    await db.query('UPDATE movies SET is_active = FALSE WHERE movie_id = ?', [movieId]);

    await invalidateCachePattern('cache:movies:*');

    res.json({ success: true, message: 'Movie deleted (soft delete) successfully' });
  } catch (err) {
    next(err);
  }
};

module.exports = { getMovies, getMovieById, createMovie, updateMovie, deleteMovie };
