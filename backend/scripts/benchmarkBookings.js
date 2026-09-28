/**
 * Repeatable, bounded local capacity checks. Run against a separate API
 * process with NODE_ENV=test, so the per-IP abuse limit does not measure the
 * load generator rather than the booking path. Real MySQL and Redis required.
 *
 *   $env:NODE_ENV='test'; $env:PORT='5001'; node src/server.js
 *   $env:NODE_ENV='test'; npm run benchmark
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { performance } = require('perf_hooks');
const db = require('../src/config/db');
const redis = require('../src/config/redis');
const config = require('../src/config/env');
const {
  loginAdmin, registerCustomer, createShowFixture, destroyShowFixture
} = require('../tests/helpers');

const API = process.env.BENCHMARK_API_URL || 'http://127.0.0.1:5001';
const USERS = Number(process.env.BENCHMARK_USERS || 100);
const REPEATS = Number(process.env.BENCHMARK_REPEATS || 3);
const CONCURRENCIES = (process.env.BENCHMARK_CONCURRENCIES || '10,25,50')
  .split(',').map(Number);

if (config.NODE_ENV !== 'test' || !['127.0.0.1', 'localhost'].includes(config.DB_HOST)) {
  throw new Error('Benchmark requires NODE_ENV=test and a local MySQL host.');
}
if (!['127.0.0.1', 'localhost'].includes(new URL(API).hostname)) {
  throw new Error('Benchmark API must be on this machine.');
}
if (!Number.isInteger(USERS) || USERS < 2 || USERS > 200 ||
    !Number.isInteger(REPEATS) || REPEATS < 1 || REPEATS > 5 ||
    CONCURRENCIES.some((n) => !Number.isInteger(n) || n < 1 || n > USERS)) {
  throw new Error('Invalid benchmark size, repeats, or concurrency.');
}

const percentile = (values, p) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.ceil(p * sorted.length) - 1] * 10) / 10;
};

const post = async (route, token, body) => {
  const started = performance.now();
  const response = await fetch(`${API}${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000)
  });
  const data = await response.json();
  return { status: response.status, data, ms: performance.now() - started };
};

const bookingCounts = async (showId) => {
  const [row] = await db.query(
    `SELECT COUNT(DISTINCT b.booking_id) AS bookings,
            COUNT(bs.seat_id) AS allocations,
            COUNT(DISTINCT bs.seat_id) AS distinctSeats
       FROM bookings b
       LEFT JOIN booking_seats bs ON bs.booking_id = b.booking_id AND bs.is_active = 1
      WHERE b.show_id = ? AND b.status = 'Pending'`, [showId]
  );
  return {
    bookings: Number(row.bookings), allocations: Number(row.allocations),
    distinctSeats: Number(row.distinctSeats)
  };
};

const withFixture = async (adminToken, seatRows, run) => {
  const fixture = await createShowFixture(adminToken, { seatRows });
  try { return await run(fixture); } finally { await destroyShowFixture(adminToken, fixture); }
};

const contention = (adminToken, customers, repeat) => withFixture(
  adminToken, [{ seat_type: 'Silver', count: 1 }], async (fixture) => {
    const selection = { showId: fixture.showId, seatIds: [fixture.seatMap[0].seat_id] };
    const started = performance.now();
    const attempts = await Promise.all(customers.map((customer) =>
      post('/api/bookings/lock-seats', customer.token, selection)));
    const elapsedMs = performance.now() - started;
    const winners = attempts.map((result, index) => ({ ...result, index }))
      .filter((result) => result.status === 200);
    const conflicts = attempts.filter((result) => result.status === 409).length;
    if (winners.length !== 1 || conflicts !== customers.length - 1) {
      throw new Error(`Contention run ${repeat}: ${winners.length} holds, ${conflicts} conflicts; ` +
        `statuses ${JSON.stringify(attempts.reduce((a, x) => ({ ...a, [x.status]: (a[x.status] || 0) + 1 }), {}))}`);
    }
    const booked = await post('/api/bookings', customers[winners[0].index].token, selection);
    const database = await bookingCounts(fixture.showId);
    if (booked.status !== 201 || database.bookings !== 1 ||
        database.allocations !== 1 || database.distinctSeats !== 1) {
      throw new Error(`Contention run ${repeat}: booking ${booked.status}, DB ${JSON.stringify(database)}`);
    }
    return {
      repeat, contenders: customers.length, successfulHolds: 1, expectedConflicts: conflicts,
      unexpectedResponses: 0, bookingCreated: 1, database,
      lockBurstMs: Math.round(elapsedMs), lockP95Ms: percentile(attempts.map((x) => x.ms), .95)
    };
  }
);

const bookingLoad = (adminToken, customers, concurrency, repeat) => withFixture(
  adminToken,
  Array.from({ length: Math.ceil(customers.length / 20) }, () =>
    ({ seat_type: 'Silver', count: 20 })),
  async (fixture) => {
    const samples = [];
    let cursor = 0;
    const started = performance.now();
    const worker = async () => {
      while (cursor < customers.length) {
        const index = cursor++;
        const selection = { showId: fixture.showId, seatIds: [fixture.seatMap[index].seat_id] };
        const operationStarted = performance.now();
        try {
          const held = await post('/api/bookings/lock-seats', customers[index].token, selection);
          if (held.status !== 200) {
            samples.push({ status: held.status, phase: 'hold', ms: performance.now() - operationStarted });
            continue;
          }
          const booked = await post('/api/bookings', customers[index].token, selection);
          samples.push({ status: booked.status, phase: 'booking', ms: performance.now() - operationStarted });
        } catch (error) {
          samples.push({ status: 'network', phase: error.message, ms: performance.now() - operationStarted });
        }
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    const elapsedMs = performance.now() - started;
    const successes = samples.filter((sample) => sample.status === 201);
    const database = await bookingCounts(fixture.showId);
    if (successes.length !== customers.length || database.bookings !== customers.length ||
        database.allocations !== customers.length || database.distinctSeats !== customers.length) {
      throw new Error(`Load run ${concurrency}/${repeat}: ${successes.length} successful; ` +
        `DB ${JSON.stringify(database)}; errors ${JSON.stringify(samples.filter((x) => x.status !== 201))}`);
    }
    return {
      repeat, concurrency, attempts: customers.length, successfulBookings: successes.length,
      errorRate: 0, database, elapsedMs: Math.round(elapsedMs),
      bookingsPerSecond: Math.round(successes.length / elapsedMs * 100000) / 100,
      endToEndP50Ms: percentile(successes.map((x) => x.ms), .5),
      endToEndP95Ms: percentile(successes.map((x) => x.ms), .95)
    };
  }
);

const main = async () => {
  const health = await fetch(`${API}/health`).then((r) => r.json());
  if (health.dependencies?.database !== 'connected' || health.dependencies?.redis !== 'connected') {
    throw new Error('Benchmark API must use live MySQL and Redis.');
  }
  const adminToken = await loginAdmin();
  const customers = [];
  const report = {
    measuredAt: new Date().toISOString(), api: API, mode: 'local test-mode API; rate limit skipped',
    scope: 'Redis hold plus MySQL pending booking creation; payment excluded',
    runtime: {
      platform: `${os.platform()} ${os.release()}`,
      cpu: os.cpus()[0]?.model,
      logicalProcessors: os.cpus().length,
      memoryGiB: Math.round(os.totalmem() / 2 ** 30 * 10) / 10,
      node: process.version
    },
    users: USERS, repeats: REPEATS, contention: [], bookingLoad: []
  };
  try {
    console.log(`Registering ${USERS} isolated customers outside timed runs...`);
    for (let index = 0; index < USERS; index += 1) {
      customers.push(await registerCustomer('benchmark'));
    }
    for (let repeat = 1; repeat <= REPEATS; repeat += 1) {
      const result = await contention(adminToken, customers, repeat);
      report.contention.push(result);
      console.log(`Contention ${repeat}: 1 booking, ${result.expectedConflicts} conflicts, ` +
        `${result.lockBurstMs} ms burst`);
    }
    for (const concurrency of CONCURRENCIES) {
      for (let repeat = 1; repeat <= REPEATS; repeat += 1) {
        const result = await bookingLoad(adminToken, customers, concurrency, repeat);
        report.bookingLoad.push(result);
        console.log(`Load ${concurrency}/${repeat}: ${result.successfulBookings}/${result.attempts} bookings, ` +
          `${result.bookingsPerSecond}/s, p95 ${result.endToEndP95Ms} ms`);
      }
    }
    const output = path.join(__dirname, '../../load-tests/results/booking-benchmark.json');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Verified result: ${output}`);
  } finally {
    if (customers.length) {
      const ids = customers.map((customer) => customer.userId);
      await db.query(`DELETE FROM users WHERE user_id IN (${ids.map(() => '?').join(',')})`, ids);
    }
    await redis.quit();
    await db.pool.end();
  }
};

main().catch((error) => { console.error(error); process.exitCode = 1; });
