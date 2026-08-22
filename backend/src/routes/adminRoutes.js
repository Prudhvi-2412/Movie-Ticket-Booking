/**
 * Admin surface. Everything below requires a valid token *and* the Admin
 * role — the guards are applied at the router level so a new route cannot be
 * added without them by accident.
 */
const express = require('express');
const admin = require('../controllers/adminController');
const locations = require('../controllers/locationController');
const theatres = require('../controllers/theaterController');
const screens = require('../controllers/screenController');
const seats = require('../controllers/seatController');
const movies = require('../controllers/movieController');
const shows = require('../controllers/showController');
const { authenticateToken } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/rbacMiddleware');
const { validate, rules, Joi } = require('../middleware/validate');

const router = express.Router();
router.use(authenticateToken);
router.use(requireRole('Admin'));

const idParam = validate(Joi.object({ id: rules.id.required() }), 'params');
const showIdParam = validate(Joi.object({ showId: rules.id.required() }), 'params');
const screenIdParam = validate(Joi.object({ screenId: rules.id.required() }), 'params');

const SEAT_TYPES = ['Silver', 'Gold', 'Platinum', 'Recliner'];
const SCREEN_TYPES = ['Standard', 'Premium', 'IMAX', '4DX', 'Recliner'];

// ---- Dashboard & analytics -------------------------------------------
router.get('/dashboard', admin.getDashboard);
router.get('/analytics', admin.getAnalytics);
router.get('/analytics/revenue', admin.getRevenueAnalytics);
router.get('/analytics/occupancy', admin.getOccupancyAnalytics);
router.get('/audit-logs', admin.getAuditLogs);
router.get('/webhook-logs', admin.getWebhookLogs);

// ---- Bookings & users -------------------------------------------------
router.get('/bookings', validate(Joi.object({
  status: Joi.string().max(30),
  search: Joi.string().max(120).allow(''),
  from: rules.isoDate,
  to: rules.isoDate,
  page: rules.page,
  limit: rules.limit
}), 'query'), admin.listAllBookings);

router.get('/users', validate(Joi.object({
  search: Joi.string().max(120).allow(''),
  role: Joi.string().valid('Customer', 'Admin'),
  page: rules.page,
  limit: rules.limit
}), 'query'), admin.getUsers);

router.put('/users/:id/role', idParam, validate(Joi.object({
  role: Joi.string().valid('Customer', 'Admin').required()
})), admin.updateUserRole);

router.put('/users/:id/status', idParam, validate(Joi.object({
  is_active: Joi.boolean().required()
})), admin.updateUserStatus);

// ---- Locations --------------------------------------------------------
const locationSchema = Joi.object({
  city: Joi.string().min(2).max(100).trim().required(),
  state: Joi.string().min(2).max(100).trim().required(),
  country: Joi.string().max(100).default('India'),
  is_active: Joi.boolean().default(true)
});

router.get('/locations', locations.listLocations);
router.post('/locations', validate(locationSchema), locations.createLocation);
router.put('/locations/:id', idParam, validate(locationSchema.fork(
  ['city', 'state'], (s) => s.optional()
).min(1)), locations.updateLocation);
router.delete('/locations/:id', idParam, locations.deleteLocation);

// ---- Theatres ---------------------------------------------------------
const theatreSchema = Joi.object({
  location_id: rules.id.required(),
  name: Joi.string().min(2).max(255).trim().required(),
  location: Joi.string().min(2).max(255).trim().required(),
  address: Joi.string().max(500).allow('', null),
  contact_phone: rules.phone.allow('', null),
  facilities: Joi.array().items(Joi.string().max(80)).default([]),
  is_active: Joi.boolean().default(true)
});

router.get('/theatres', theatres.listTheatres);
router.get('/theatres/:id', idParam, theatres.getTheatre);
router.post('/theatres', validate(theatreSchema), theatres.createTheatre);
router.put('/theatres/:id', idParam, validate(theatreSchema.fork(
  ['location_id', 'name', 'location'], (s) => s.optional()
).min(1)), theatres.updateTheatre);
router.delete('/theatres/:id', idParam, theatres.deleteTheatre);

// ---- Screens ----------------------------------------------------------
const screenSchema = Joi.object({
  theater_id: rules.id.required(),
  screen_number: Joi.number().integer().min(1).max(99).required(),
  name: Joi.string().max(80).allow('', null),
  screen_type: Joi.string().valid(...SCREEN_TYPES).default('Standard'),
  is_active: Joi.boolean().default(true)
  // total_seats is derived from the seat map by trigger, never supplied.
});

router.get('/screens', validate(Joi.object({ theatreId: rules.id }), 'query'), screens.listScreens);
router.get('/screens/:id', idParam, screens.getScreen);
router.post('/screens', validate(screenSchema), screens.createScreen);
router.put('/screens/:id', idParam, validate(screenSchema.fork(
  ['theater_id', 'screen_number'], (s) => s.optional()
).min(1)), screens.updateScreen);
router.delete('/screens/:id', idParam, screens.deleteScreen);

// ---- Seats ------------------------------------------------------------
router.get('/screens/:screenId/seats', screenIdParam, seats.getSeatMap);

router.post('/screens/:screenId/seats/generate', screenIdParam, validate(Joi.object({
  rows: Joi.array().items(Joi.object({
    row: Joi.string().max(2).uppercase(),
    seat_type: Joi.string().valid(...SEAT_TYPES).required(),
    count: Joi.number().integer().min(1).max(40).required()
  })).min(1).max(30).required(),
  replace: Joi.boolean().default(true)
})), seats.generateSeatLayout);

router.put('/screens/:screenId/seats/bulk', screenIdParam, validate(Joi.object({
  seat_ids: Joi.array().items(rules.id).min(1).max(1000).required(),
  seat_type: Joi.string().valid(...SEAT_TYPES),
  is_active: Joi.boolean()
}).or('seat_type', 'is_active')), seats.bulkUpdateSeats);

router.put('/seats/:id', idParam, validate(Joi.object({
  seat_type: Joi.string().valid(...SEAT_TYPES),
  is_active: Joi.boolean()
}).min(1)), seats.updateSeat);

// ---- Movies -----------------------------------------------------------
const movieSchema = Joi.object({
  title: Joi.string().min(1).max(255).trim().required(),
  description: Joi.string().max(5000).allow('', null),
  genre: Joi.string().max(80).allow('', null),
  language: Joi.string().max(50).allow('', null),
  duration_minutes: Joi.number().integer().min(1).max(600).required(),
  certificate: Joi.string().max(16).allow('', null),
  release_date: rules.isoDate.allow('', null),
  rating: Joi.number().min(0).max(10).allow(null),
  poster_url: rules.url.allow('', null),
  banner_url: rules.url.allow('', null),
  trailer_url: rules.url.allow('', null),
  director: Joi.string().max(150).allow('', null),
  cast_list: Joi.string().max(2000).allow('', null),
  status: Joi.string().valid('ComingSoon', 'NowShowing', 'Ended').default('NowShowing'),
  is_published: Joi.boolean().default(true)
});

router.get('/movies', validate(Joi.object({
  status: Joi.string().valid('NowShowing', 'ComingSoon', 'Ended'),
  genre: Joi.string().max(80).allow(''),
  language: Joi.string().max(50).allow(''),
  search: Joi.string().max(120).allow(''),
  sort: Joi.string().valid('release', 'rating', 'title', 'popular').default('release'),
  includeUnpublished: Joi.boolean().default(true),
  locationId: rules.id
}), 'query'), movies.listMovies);

router.post('/movies', validate(movieSchema), movies.createMovie);
router.put('/movies/:id', idParam, validate(movieSchema.fork(
  ['title', 'duration_minutes'], (s) => s.optional()
).min(1)), movies.updateMovie);
router.delete('/movies/:id', idParam, movies.deleteMovie);

// ---- Shows ------------------------------------------------------------
const pricingSchema = Joi.object().pattern(
  Joi.string().valid(...SEAT_TYPES),
  Joi.number().min(0).max(100000)
);

router.get('/shows', validate(Joi.object({
  movieId: rules.id,
  theatreId: rules.id,
  locationId: rules.id,
  date: rules.isoDate,
  includeInactive: Joi.boolean().default(true)
}), 'query'), shows.listShows);

router.post('/shows', validate(Joi.object({
  movie_id: rules.id.required(),
  screen_id: rules.id.required(),
  theater_id: rules.id,
  location_id: rules.id,
  show_time: Joi.date().iso().required(),
  end_time: Joi.date().iso().greater(Joi.ref('show_time')),
  base_price: Joi.number().min(0).max(100000).required(),
  pricing: pricingSchema.default({})
})), shows.createShow);

router.put('/shows/:showId', showIdParam, validate(Joi.object({
  show_time: Joi.date().iso(),
  end_time: Joi.date().iso(),
  base_price: Joi.number().min(0).max(100000),
  status: Joi.string().valid('Scheduled', 'Cancelled', 'Completed'),
  is_active: Joi.boolean(),
  pricing: pricingSchema
}).min(1)), shows.updateShow);

router.delete('/shows/:showId', showIdParam, shows.deleteShow);
router.post('/shows/:showId/dynamic-price', showIdParam, shows.triggerDynamicPrice);

module.exports = router;
