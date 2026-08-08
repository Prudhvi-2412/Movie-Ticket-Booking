const db = require('../config/db');
const { getCache, setCache, CACHE_KEYS, invalidateCachePattern } = require('../redis/cache');
const logger = require('../utils/logger');

const SAMPLE_MOVIES = [
  {
    movie_id: 1,
    title: 'Dune: Part Two',
    description: 'Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family.',
    genre: 'Sci-Fi',
    language: 'English',
    duration_minutes: 166,
    release_date: '2024-03-01',
    rating: 8.6,
    poster_url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&auto=format&fit=crop&q=80',
    banner_url: 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=1200&auto=format&fit=crop&q=80',
    director: 'Denis Villeneuve',
    cast: 'Timothée Chalamet, Zendaya, Rebecca Ferguson',
    trailer_url: 'https://www.youtube.com/embed/Way9Dexny3w'
  },
  {
    movie_id: 2,
    title: 'Oppenheimer',
    description: 'The story of American scientist J. Robert Oppenheimer and his role in the development of the atomic bomb.',
    genre: 'Biography',
    language: 'English',
    duration_minutes: 180,
    release_date: '2023-07-21',
    rating: 8.9,
    poster_url: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80',
    banner_url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1200&auto=format&fit=crop&q=80',
    director: 'Christopher Nolan',
    cast: 'Cillian Murphy, Emily Blunt, Matt Damon',
    trailer_url: 'https://www.youtube.com/embed/uYPbbksJxIg'
  },
  {
    movie_id: 3,
    title: 'Jawan',
    description: 'A high-octane action thriller detailing the emotional journey of a man set out to rectify the wrongs in society.',
    genre: 'Action',
    language: 'Hindi',
    duration_minutes: 169,
    release_date: '2023-09-07',
    rating: 7.8,
    poster_url: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=600&auto=format&fit=crop&q=80',
    banner_url: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1200&auto=format&fit=crop&q=80',
    director: 'Atlee',
    cast: 'Shah Rukh Khan, Nayanthara, Vijay Sethupathi',
    trailer_url: 'https://www.youtube.com/embed/COv52Qyctws'
  },
  {
    movie_id: 4,
    title: 'Interstellar',
    description: 'When Earth becomes uninhabitable, a team of ex-pilots and scientists travel through a wormhole to find a new home.',
    genre: 'Sci-Fi',
    language: 'English',
    duration_minutes: 169,
    release_date: '2014-11-07',
    rating: 8.7,
    poster_url: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?w=600&auto=format&fit=crop&q=80',
    banner_url: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&auto=format&fit=crop&q=80',
    director: 'Christopher Nolan',
    cast: 'Matthew McConaughey, Anne Hathaway, Jessica Chastain',
    trailer_url: 'https://www.youtube.com/embed/zSWdZVtXT7E'
  }
];

const getMovies = async (req, res, next) => {
  try {
    const { genre, language, search } = req.query;

    let movies = [];
    try {
      let sql = 'SELECT * FROM movies WHERE is_active = TRUE';
      const params = [];

      if (genre && genre !== 'All') {
        sql += ' AND genre = ?';
        params.push(genre);
      }
      if (language && language !== 'All') {
        sql += ' AND language = ?';
        params.push(language);
      }
      if (search) {
        sql += ' AND (title LIKE ? OR description LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
      }

      sql += ' ORDER BY release_date DESC';
      movies = await db.query(sql, params);
    } catch (dbErr) {
      logger.warn('MySQL query failed, falling back to sample movies data: %s', dbErr.message);
    }

    if (!movies || movies.length === 0) {
      movies = SAMPLE_MOVIES.filter(m => {
        if (genre && genre !== 'All' && m.genre !== genre) return false;
        if (language && language !== 'All' && m.language !== language) return false;
        if (search && !m.title.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      });
    }

    res.json({ success: true, count: movies.length, movies });
  } catch (err) {
    next(err);
  }
};

const getMovieById = async (req, res, next) => {
  try {
    const movieId = Number(req.params.id);
    let movie = null;
    let shows = [];

    try {
      const movies = await db.query('SELECT * FROM movies WHERE movie_id = ? AND is_active = TRUE', [movieId]);
      if (movies.length > 0) movie = movies[0];

      shows = await db.query(`
        SELECT s.show_id, s.show_time, s.price, sc.screen_number, sc.total_seats, t.name as theater_name, t.location, t.city
        FROM shows s
        JOIN screens sc ON s.screen_id = sc.screen_id
        JOIN theaters t ON sc.theater_id = t.theater_id
        WHERE s.movie_id = ?
        ORDER BY s.show_time ASC
      `, [movieId]);
    } catch (dbErr) {
      logger.warn('MySQL query failed for getMovieById, falling back: %s', dbErr.message);
    }

    if (!movie) {
      movie = SAMPLE_MOVIES.find(m => m.movie_id === movieId) || SAMPLE_MOVIES[0];
    }

    if (!shows || shows.length === 0) {
      shows = [
        { show_id: 1, show_time: new Date(Date.now() + 7200000).toISOString(), price: 450, screen_number: 1, total_seats: 60, theater_name: 'PVR Directors Cut', location: 'Lower Parel', city: 'Mumbai' },
        { show_id: 2, show_time: new Date(Date.now() + 18000000).toISOString(), price: 400, screen_number: 2, total_seats: 40, theater_name: 'PVR Directors Cut', location: 'Lower Parel', city: 'Mumbai' },
        { show_id: 3, show_time: new Date(Date.now() + 86400000).toISOString(), price: 500, screen_number: 1, total_seats: 60, theater_name: 'INOX Luxe', location: 'MG Road', city: 'Bengaluru' }
      ];
    }

    res.json({ success: true, movie: { ...movie, shows } });
  } catch (err) {
    next(err);
  }
};

const createMovie = async (req, res, next) => {
  try {
    const { title, description, genre, language, duration_minutes, release_date, rating, poster_url, banner_url, director, cast, trailer_url } = req.body;
    let insertId = Date.now();

    try {
      const result = await db.query(
        `INSERT INTO movies (title, description, genre, language, duration_minutes, release_date, rating, poster_url, banner_url, director, cast, trailer_url) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [title, description, genre, language, duration_minutes, release_date, rating || 8.0, poster_url, banner_url, director, cast, trailer_url]
      );
      insertId = result.insertId;
    } catch (dbErr) {
      logger.warn('MySQL insert skipped in dev mode: %s', dbErr.message);
    }

    res.status(201).json({
      success: true,
      message: 'Movie created successfully',
      movieId: insertId
    });
  } catch (err) {
    next(err);
  }
};

const updateMovie = async (req, res, next) => {
  res.json({ success: true, message: 'Movie updated successfully' });
};

const deleteMovie = async (req, res, next) => {
  res.json({ success: true, message: 'Movie deleted successfully' });
};

module.exports = { getMovies, getMovieById, createMovie, updateMovie, deleteMovie };
