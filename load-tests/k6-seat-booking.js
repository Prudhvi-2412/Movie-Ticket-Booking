import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * k6 Load Test Script: High Concurrency Seat Locking & Reservation
 * Simulates 1,000 concurrent virtual users selecting seats & executing Redis locks.
 */

export const options = {
  stages: [
    { duration: '30s', target: 200 },  // Ramp up to 200 users
    { duration: '1m', target: 1000 },  // Spike to 1,000 users booking simultaneously
    { duration: '30s', target: 0 },    // Ramp down to 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<300'], // 95% of requests must complete under 300ms
    http_req_failed: ['rate<0.01'],    // Error rate must be under 1%
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:5000/api';

export default function () {
  const showId = 1;
  const randomSeatId = Math.floor(Math.random() * 50) + 1;

  // 1. Fetch available seats map
  const seatsRes = http.get(`${BASE_URL}/shows/${showId}/seats`);
  check(seatsRes, {
    'status is 200': (r) => r.status === 200,
    'latency under 200ms': (r) => r.timings.duration < 200,
  });

  // 2. Lock Seat in Redis
  const payload = JSON.stringify({
    showId: showId,
    seatIds: [randomSeatId]
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer dummy_token_for_k6_load_test'
    },
  };

  const lockRes = http.post(`${BASE_URL}/bookings/lock-seats`, payload, params);

  check(lockRes, {
    'lock status is 200 or 409 (conflict handled cleanly)': (r) => r.status === 200 || r.status === 409,
  });

  sleep(1);
}
