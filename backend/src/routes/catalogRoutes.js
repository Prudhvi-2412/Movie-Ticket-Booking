/**
 * Public catalogue: locations, movies, theatres, shows and search.
 * Read-only — every mutation lives under /api/admin.
 */
const express = require('express');
const locations = require('../controllers/locationController');
const movies = require('../controllers/movieController');
const theatres = require('../controllers/theaterController');
const shows = require('../controllers/showController');
const search = require('../controllers/searchController');
const { optionalAuth } = require('../middleware/authMiddleware');
const { validate, rules, Joi } = require('../middleware/validate');

const idParam = validate(Joi.object({ id: rules.id.required() }), 'params');
const showIdParam = validate(Joi.object({ showId: rules.id.required() }), 'params');

// ---- /api/locations --------------------------------------------------
const locationRouter = express.Router();
locationRouter.get('/', validate(Joi.object({
  search: Joi.string().max(100).allow(''),
  includeInactive: Joi.boolean().default(false)
}), 'query'), locations.listLocations);
locationRouter.get('/:id', idParam, locations.getLocation);

// ---- /api/movies -----------------------------------------------------
const movieRouter = express.Router();
movieRouter.get('/', validate(Joi.object({
  locationId: rules.id,
  status: Joi.string().valid('NowShowing', 'ComingSoon', 'Ended'),
  genre: Joi.string().max(80).allow(''),
  language: Joi.string().max(50).allow(''),
  search: Joi.string().max(120).allow(''),
  sort: Joi.string().valid('release', 'rating', 'title', 'popular').default('release'),
  includeUnpublished: Joi.boolean().default(false)
}), 'query'), movies.listMovies);
movieRouter.get('/meta/filters', movies.getFilterOptions);
movieRouter.get('/:id', idParam, validate(Joi.object({
  locationId: rules.id,
  date: rules.isoDate
}), 'query'), movies.getMovie);

// ---- /api/theatres ---------------------------------------------------
const theatreRouter = express.Router();
theatreRouter.get('/', validate(Joi.object({
  locationId: rules.id,
  city: Joi.string().max(100),
  movieId: rules.id,
  date: rules.isoDate,
  search: Joi.string().max(120).allow(''),
  includeInactive: Joi.boolean().default(false)
}), 'query'), theatres.listTheatres);
theatreRouter.get('/:id', idParam, theatres.getTheatre);

// ---- /api/shows ------------------------------------------------------
const showRouter = express.Router();
showRouter.get('/', validate(Joi.object({
  movieId: rules.id,
  theatreId: rules.id,
  locationId: rules.id,
  date: rules.isoDate,
  includeInactive: Joi.boolean().default(false)
}), 'query'), shows.listShows);
showRouter.get('/:showId', showIdParam, shows.getShow);
// optionalAuth so an anonymous visitor still sees the layout, while a signed-in
// one also sees which held seats are their own.
showRouter.get('/:showId/seats', showIdParam, optionalAuth, shows.getShowSeats);

// ---- /api/search -----------------------------------------------------
const searchRouter = express.Router();
searchRouter.get('/', validate(Joi.object({
  q: Joi.string().max(120).allow(''),
  locationId: rules.id,
  limit: Joi.number().integer().min(1).max(10).default(5)
}), 'query'), search.globalSearch);

module.exports = { locationRouter, movieRouter, theatreRouter, showRouter, searchRouter };
