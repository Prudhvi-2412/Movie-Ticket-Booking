const crypto = require('crypto');
const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/db');

/**
 * Shared fixtures for the integration suite.
 *
 * These tests run against real MySQL and Redis rather than mocks: the
 * behaviour under test *is* the interaction between them (atomic locks, a
 * unique index rejecting a second claim on a seat, a stored procedure's
 * status guards). Mocking either would test the mock.
 *
 * Start the datastores first:  docker compose up -d mysql redis
 */

const unique = () => crypto.randomBytes(4).toString('hex');

const ADMIN = { email: 'admin@cinewave.com', password: 'Admin@123' };

const loginAdmin = async () => {
  const res = await request(app).post('/api/auth/login').send(ADMIN);
  if (res.status !== 200) {
    throw new Error(
      `Could not sign in as the seeded admin (${res.status}). Run "npm run db:setup" first.`
    );
  }
  return res.body.accessToken;
};

const registerCustomer = async (label = 'user') => {
  const email = `${label}.${unique()}@cinewave-test.com`;
  const res = await request(app).post('/api/auth/register').send({
    full_name: `Test ${label}`,
    email,
    password: 'Customer@123'
  });
  if (res.status !== 201) throw new Error(`Could not register ${email}: ${res.body?.message}`);
  return { email, token: res.body.accessToken, userId: res.body.user.user_id };
};

/**
 * Builds an isolated location -> theatre -> screen -> seats -> movie -> show
 * chain so tests never contend with each other or with seeded data.
 */
const createShowFixture = async (adminToken, { seatRows } = {}) => {
  const suffix = unique();
  const auth = (req) => req.set('Authorization', `Bearer ${adminToken}`);

  const location = await auth(request(app).post('/api/admin/locations'))
    .send({ city: `Testopolis-${suffix}`, state: 'Test State' });

  const theatre = await auth(request(app).post('/api/admin/theatres')).send({
    location_id: location.body.location.location_id,
    name: `Test Cinema ${suffix}`,
    location: 'Test Area'
  });

  const screen = await auth(request(app).post('/api/admin/screens')).send({
    theater_id: theatre.body.theatre.theater_id,
    screen_number: 1,
    screen_type: 'Standard'
  });

  const layout = await auth(
    request(app).post(`/api/admin/screens/${screen.body.screen.screen_id}/seats/generate`)
  ).send({
    rows: seatRows || [
      { seat_type: 'Platinum', count: 4 },
      { seat_type: 'Silver', count: 4 }
    ]
  });

  const movie = await auth(request(app).post('/api/admin/movies')).send({
    title: `Test Film ${suffix}`,
    duration_minutes: 100,
    language: 'English',
    genre: 'Drama',
    status: 'NowShowing'
  });

  const show = await auth(request(app).post('/api/admin/shows')).send({
    movie_id: movie.body.movie.movie_id,
    screen_id: screen.body.screen.screen_id,
    show_time: new Date(Date.now() + 8 * 3600_000).toISOString(),
    base_price: 100,
    pricing: { Silver: 100, Gold: 150, Platinum: 200, Recliner: 300 }
  });

  if (!show.body?.show?.show_id) {
    throw new Error(`Fixture show was not created: ${JSON.stringify(show.body)}`);
  }

  const seats = await request(app).get(`/api/shows/${show.body.show.show_id}/seats`);

  return {
    suffix,
    locationId: location.body.location.location_id,
    theatreId: theatre.body.theatre.theater_id,
    screenId: screen.body.screen.screen_id,
    movieId: movie.body.movie.movie_id,
    showId: show.body.show.show_id,
    totalSeats: layout.body.totalSeats,
    seatMap: seats.body.seatMap
  };
};

/** Removes a fixture chain. Order matters: children before parents. */
const destroyShowFixture = async (adminToken, fixture) => {
  if (!fixture) return;
  const auth = (req) => req.set('Authorization', `Bearer ${adminToken}`);

  // Bookings hold FKs onto shows and seats, so clear them first. Only ever
  // touches rows belonging to this fixture's show.
  await db.query('DELETE FROM payments WHERE booking_id IN (SELECT booking_id FROM bookings WHERE show_id = ?)', [fixture.showId]);
  await db.query('DELETE FROM booking_seats WHERE show_id = ?', [fixture.showId]);
  await db.query('DELETE FROM bookings WHERE show_id = ?', [fixture.showId]);

  await auth(request(app).delete(`/api/admin/shows/${fixture.showId}`));
  await auth(request(app).delete(`/api/admin/movies/${fixture.movieId}`));
  await auth(request(app).delete(`/api/admin/screens/${fixture.screenId}`));
  await auth(request(app).delete(`/api/admin/theatres/${fixture.theatreId}`));
  await auth(request(app).delete(`/api/admin/locations/${fixture.locationId}`));
};

const authed = (method, path, token) =>
  request(app)[method](path).set('Authorization', `Bearer ${token}`);

module.exports = {
  app,
  unique,
  loginAdmin,
  registerCustomer,
  createShowFixture,
  destroyShowFixture,
  authed
};
