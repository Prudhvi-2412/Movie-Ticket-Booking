import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import { Counter, Rate } from 'k6/metrics';

/**
 * Seat-locking contention test.
 *
 * Many virtual users fight over a small pool of seats on one show. The point
 * is not throughput — it is that exactly one user wins each seat and everyone
 * else gets a clean 409 rather than a 500, a hang, or (as the original
 * implementation did) a false success.
 *
 * The previous version sent `Authorization: Bearer dummy_token_for_k6_load_test`,
 * so every lock request was rejected with 401 and the run measured nothing but
 * the auth middleware. Real accounts are provisioned in setup() instead.
 *
 *   k6 run load-tests/k6-seat-booking.js
 *   k6 run -e API_URL=http://localhost:5000/api -e VUS=200 load-tests/k6-seat-booking.js
 */

const BASE_URL = __ENV.API_URL || 'http://localhost:5000/api';
const PEAK_VUS = Number(__ENV.VUS || 200);
// A deliberately small pool: contention is the thing being measured.
const SEAT_POOL = Number(__ENV.SEAT_POOL || 30);

const locksAcquired = new Counter('seat_locks_acquired');
const locksRejected = new Counter('seat_locks_rejected_cleanly');
const unexpectedStatus = new Rate('seat_lock_unexpected_status');

export const options = {
  stages: [
    { duration: '20s', target: Math.ceil(PEAK_VUS / 4) },
    { duration: '40s', target: PEAK_VUS },
    { duration: '20s', target: 0 }
  ],
  thresholds: {
    // Every lock attempt must resolve to a decision — never an error.
    seat_lock_unexpected_status: ['rate==0'],
    http_req_failed: ['rate<0.01'],
    'http_req_duration{endpoint:seatmap}': ['p(95)<400'],
    'http_req_duration{endpoint:lock}': ['p(95)<500']
  }
};

const json = (token) => ({
  headers: {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }
});

/**
 * Finds a real bookable show and registers a pool of accounts. Runs once,
 * before the VUs start.
 */
export function setup() {
  const showsRes = http.get(`${BASE_URL}/shows`);
  if (showsRes.status !== 200) {
    fail(`Could not list shows (${showsRes.status}). Is the backend running at ${BASE_URL}?`);
  }

  const shows = showsRes.json('shows') || [];
  if (shows.length === 0) fail('No upcoming shows. Run "npm run db:seed" first.');

  // Prefer the largest screen so the seat pool is not exhausted immediately.
  const show = shows.reduce((a, b) => (b.total_seats > a.total_seats ? b : a));

  const seatsRes = http.get(`${BASE_URL}/shows/${show.show_id}/seats`);
  const seatIds = (seatsRes.json('seatMap') || [])
    .filter((s) => s.status === 'AVAILABLE')
    .slice(0, SEAT_POOL)
    .map((s) => s.seat_id);

  if (seatIds.length === 0) fail(`Show ${show.show_id} has no available seats.`);

  // One account per VU: sharing a token would mean every request came from the
  // same user, and re-locking your own seat is deliberately not a conflict.
  const tokens = [];
  for (let i = 0; i < PEAK_VUS; i += 1) {
    const res = http.post(`${BASE_URL}/auth/register`, JSON.stringify({
      full_name: `Load Test ${i}`,
      email: `k6.${Date.now()}.${i}@example.com`,
      password: 'LoadTest@123'
    }), json());

    if (res.status === 201) tokens.push(res.json('accessToken'));
  }

  if (tokens.length === 0) fail('Could not register any load-test accounts.');

  console.log(`show ${show.show_id} · ${seatIds.length} seats · ${tokens.length} accounts`);
  return { showId: show.show_id, seatIds, tokens };
}

export default function (data) {
  const token = data.tokens[(__VU - 1) % data.tokens.length];
  const seatId = data.seatIds[Math.floor(Math.random() * data.seatIds.length)];

  const seatsRes = http.get(`${BASE_URL}/shows/${data.showId}/seats`, {
    tags: { endpoint: 'seatmap' }
  });
  check(seatsRes, { 'seat map returns 200': (r) => r.status === 200 });

  const lockRes = http.post(
    `${BASE_URL}/bookings/lock-seats`,
    JSON.stringify({ showId: data.showId, seatIds: [seatId] }),
    { ...json(token), tags: { endpoint: 'lock' } }
  );

  if (lockRes.status === 200) locksAcquired.add(1);
  else if (lockRes.status === 409) locksRejected.add(1);

  // 429 is a legitimate outcome: the booking rate limiter is doing its job.
  const decided = [200, 409, 429].includes(lockRes.status);
  unexpectedStatus.add(!decided);

  check(lockRes, {
    'lock resolves to a decision (200 / 409 / 429)': () => decided,
    'never a server error': (r) => r.status < 500
  });

  sleep(1);
}
