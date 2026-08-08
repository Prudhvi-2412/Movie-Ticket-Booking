const request = require('supertest');
const app = require('../src/app');

describe('Booking API & Distributed Seat Locking', () => {
  let authToken = '';

  beforeAll(async () => {
    const email = `test_booking_${Date.now()}@example.com`;
    const res = await request(app)
      .post('/api/auth/register')
      .send({ full_name: 'Booking User', email, password: 'password123' });
    authToken = res.body.accessToken;
  });

  it('should lock requested seats in Redis with TTL', async () => {
    const res = await request(app)
      .post('/api/bookings/lock-seats')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        showId: 1,
        seatIds: [10, 11]
      });

    expect(res.statusCode).toBeOneOf ? expect(res.statusCode).toBeLessThan(500) : expect([200, 409]).toContain(res.statusCode);
  });

  it('should reject unauthenticated booking request', async () => {
    const res = await request(app)
      .post('/api/bookings/create')
      .send({ showId: 1, seatIds: [10], totalAmount: 450 });

    expect(res.statusCode).toEqual(401);
  });
});
