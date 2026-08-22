#!/usr/bin/env node
/**
 * Seeds CineWave with a complete, realistic dataset: locations, theatres,
 * screens, full seat maps, movies, a week of showtimes with per-category
 * pricing, and login-able accounts.
 *
 * Passwords are hashed with the same bcrypt cost the API uses, so the seeded
 * accounts actually work. (The old SQL seed stored literal strings like
 * 'hash_aarav_001', so not one seeded user could log in.)
 *
 *   npm run db:seed          # skips if data already present
 *   npm run db:seed -- --force   # wipes booking + catalogue data first
 */
const bcrypt = require('bcryptjs');
const config = require('../src/config/env');
const { encrypt } = require('../src/utils/crypto');
const { createConnection, waitForDatabase } = require('./sqlRunner');
const {
  locations, theatres, seatLayouts, movies, showTimeSlots, users
} = require('./seedData');

const log = (...args) => console.log(...args);

const rowLabel = (index) => String.fromCharCode(65 + index);

/** Category price ladder per screen type, in rupees. */
const priceMatrix = {
  Standard: { Silver: 180, Gold: 220, Platinum: 280, Recliner: 450 },
  Premium: { Silver: 220, Gold: 270, Platinum: 340, Recliner: 520 },
  IMAX: { Silver: 300, Gold: 380, Platinum: 460, Recliner: 700 },
  '4DX': { Silver: 350, Gold: 420, Platinum: 500, Recliner: 750 },
  Recliner: { Silver: 260, Gold: 320, Platinum: 420, Recliner: 650 }
};

const hasData = async (conn) => {
  const [[{ count }]] = await conn.query('SELECT COUNT(*) AS count FROM locations');
  return count > 0;
};

const wipe = async (conn) => {
  log('  --force: clearing existing catalogue and booking data');
  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of [
    'seat_booking_logs', 'booking_logs', 'webhook_logs', 'audit_logs',
    'payments', 'booking_seats', 'bookings',
    'show_pricing', 'shows', 'seats', 'screens', 'theaters', 'locations',
    'movies', 'users'
  ]) {
    await conn.query(`TRUNCATE TABLE ${table}`);
  }
  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
};

const seedUsers = async (conn) => {
  for (const user of users) {
    const hash = await bcrypt.hash(user.password, 10);
    await conn.query(
      `INSERT INTO users (full_name, email, password_hash, role, phone_encrypted, preferences)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), role = VALUES(role)`,
      [user.full_name, user.email, hash, user.role, encrypt(user.phone),
        JSON.stringify({ favouriteLanguage: 'Hindi' })]
    );
  }
  log(`  ${users.length} users`);
};

const seedLocations = async (conn) => {
  const ids = {};
  for (const loc of locations) {
    const [res] = await conn.query(
      `INSERT INTO locations (city, state, country) VALUES (?, ?, 'India')
       ON DUPLICATE KEY UPDATE state = VALUES(state)`,
      [loc.city, loc.state]
    );
    ids[loc.city] = res.insertId || (
      await conn.query('SELECT location_id FROM locations WHERE city = ?', [loc.city])
    )[0][0].location_id;
  }
  log(`  ${locations.length} locations`);
  return ids;
};

const seedMovies = async (conn) => {
  const ids = [];
  for (const m of movies) {
    const [res] = await conn.query(
      `INSERT INTO movies (title, description, genre, language, duration_minutes, certificate,
                           release_date, rating, poster_url, banner_url, trailer_url,
                           director, cast_list, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [m.title, m.description, m.genre, m.language, m.duration_minutes, m.certificate,
        m.release_date, m.rating, m.poster_url, m.banner_url, m.trailer_url,
        m.director, m.cast_list, m.status]
    );
    ids.push({ movie_id: res.insertId, ...m });
  }
  log(`  ${movies.length} movies`);
  return ids;
};

const seedSeatsForScreen = async (conn, screenId, layoutName) => {
  const layout = seatLayouts[layoutName];
  const rows = [];
  for (let r = 0; r < layout.rows; r += 1) {
    const seatType = layout.plan[r] || 'Silver';
    for (let s = 1; s <= layout.seatsPerRow; s += 1) {
      rows.push([screenId, rowLabel(r), s, seatType]);
    }
  }
  await conn.query(
    'INSERT INTO seats (screen_id, seat_row, seat_number, seat_type) VALUES ?',
    [rows]
  );
  return rows.length;
};

const seedTheatres = async (conn, locationIds) => {
  const screens = [];
  let seatTotal = 0;

  for (const t of theatres) {
    const [res] = await conn.query(
      `INSERT INTO theaters (location_id, name, location, address, contact_phone, facilities)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [locationIds[t.city], t.name, t.location, t.address, t.contact_phone,
        JSON.stringify(t.facilities)]
    );
    const theaterId = res.insertId;

    for (const sc of t.screens) {
      const [scRes] = await conn.query(
        `INSERT INTO screens (theater_id, screen_number, name, screen_type)
         VALUES (?, ?, ?, ?)`,
        [theaterId, sc.screen_number, sc.name, sc.screen_type]
      );
      const screenId = scRes.insertId;
      seatTotal += await seedSeatsForScreen(conn, screenId, sc.layout);
      screens.push({ screen_id: screenId, theater_id: theaterId, city: t.city, screen_type: sc.screen_type });
    }
  }

  log(`  ${theatres.length} theatres, ${screens.length} screens, ${seatTotal} seats`);
  return screens;
};

/**
 * Schedules `DAYS_AHEAD` days of shows. Each screen runs the standard slot
 * grid; a screen's movie rotates so every city has several films on sale.
 */
const seedShows = async (conn, screens, movieRows) => {
  const DAYS_AHEAD = 7;
  const nowShowing = movieRows.filter((m) => m.status === 'NowShowing');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let created = 0;
  let rotation = 0;

  for (let day = 0; day < DAYS_AHEAD; day += 1) {
    for (const screen of screens) {
      for (let slot = 0; slot < showTimeSlots.length; slot += 1) {
        const movie = nowShowing[rotation % nowShowing.length];
        rotation += 1;

        const [hh, mm] = showTimeSlots[slot].split(':').map(Number);
        const start = new Date(today);
        start.setDate(start.getDate() + day);
        start.setHours(hh, mm, 0, 0);

        // Skip slots that have already passed today — a show you cannot book
        // is noise, not data.
        if (start.getTime() <= Date.now()) continue;

        // 20 minutes of trailers and turnaround after the runtime.
        const end = new Date(start.getTime() + (movie.duration_minutes + 20) * 60_000);

        const prices = priceMatrix[screen.screen_type] || priceMatrix.Standard;

        try {
          // Date objects, not formatted strings: the connection runs with
          // timezone 'Z', so the driver converts these local showtimes to UTC
          // for storage. Hand-formatted local strings would be stored as if
          // they were already UTC and land hours off from NOW().
          const [res] = await conn.query(
            `INSERT INTO shows (movie_id, screen_id, show_time, end_time, base_price)
             VALUES (?, ?, ?, ?, ?)`,
            [movie.movie_id, screen.screen_id, start, end, prices.Silver]
          );
          const showId = res.insertId;

          await conn.query(
            'INSERT INTO show_pricing (show_id, seat_type, price) VALUES ?',
            [Object.entries(prices).map(([type, price]) => [showId, type, price])]
          );
          created += 1;
        } catch (err) {
          // The overlap trigger legitimately rejects a slot when a long film
          // runs into the next one. Skipping is the correct outcome.
          if (!/already has a show scheduled/.test(err.message)) throw err;
        }
      }
    }
  }

  log(`  ${created} shows across ${DAYS_AHEAD} days`);
  return created;
};

const seed = async ({ force = false } = {}) => {
  log(`\nCineWave seed -> ${config.DB_HOST}:${config.DB_PORT}/${config.DB_NAME}`);
  await waitForDatabase();
  const conn = await createConnection();

  try {
    if (force) {
      await wipe(conn);
    } else if (await hasData(conn)) {
      log('  database already seeded — nothing to do (use --force to reseed)\n');
      return;
    }

    await seedUsers(conn);
    const locationIds = await seedLocations(conn);
    const movieRows = await seedMovies(conn);
    const screens = await seedTheatres(conn, locationIds);
    await seedShows(conn, screens, movieRows);

    log('\nSeed complete. Development sign-ins:');
    log('  Admin     admin@cinewave.com / Admin@123');
    log('  Customer  aarav@example.com  / Customer@123\n');
  } finally {
    await conn.end();
  }
};

if (require.main === module) {
  seed({ force: process.argv.includes('--force') }).catch((err) => {
    console.error(`\nSeed failed:\n  ${err.message}\n`);
    process.exit(1);
  });
}

module.exports = { seed };
