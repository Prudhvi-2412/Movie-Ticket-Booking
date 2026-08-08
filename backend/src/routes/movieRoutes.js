const express = require('express');
const router = express.Router();
const { getMovies, getMovieById, createMovie, updateMovie, deleteMovie } = require('../controllers/movieController');
const { authenticateToken } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/rbacMiddleware');

router.get('/', getMovies);
router.get('/:id', getMovieById);
router.post('/', authenticateToken, requireRole('Admin'), createMovie);
router.put('/:id', authenticateToken, requireRole('Admin'), updateMovie);
router.delete('/:id', authenticateToken, requireRole('Admin'), deleteMovie);

module.exports = router;
