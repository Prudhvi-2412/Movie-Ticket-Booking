const request = require('supertest');
const {
  app, loginAdmin, registerCustomer, createShowFixture, destroyShowFixture, authed
} = require('./helpers');
const db = require('../src/config/db');
const config = require('../src/config/env');

describe('Booking flow', () => {
  let adminToken;
  let fixture;
  let alice;
  let bob;

  beforeAll(async () => {
    adminToken = await loginAdmin();
    fixture = await createShowFixture(adminToken);
    alice = await registerCustomer('alice');
    bob = await registerCustomer('bob');
  }, 30_000);

  afterAll(async () => {
    await destroyShowFixture(adminToken, fixture);
  }, 30_000);

  const seatAt = (i) => fixture.seatMap[i];

  it('exposes the full seat map with server-side prices', async () => {
    const res = await request(app).get(`/api/shows/${fixture.showId}/seats`);

    expect(res.status).toBe(200);
    expect(res.body.seatMap).toHaveLength(fixture.totalSeats);
    expect(res.body.seatMap.every((s) => s.status === 'AVAILABLE')).toBe(true);

    const platinum = res.body.seatMap.find((s) => s.seat_type === 'Platinum');
    const silver = res.body.seatMap.find((s) => s.seat_type === 'Silver');
    expect(platinum.price).toBe(200);
    expect(silver.price).toBe(100);
  });

  it('requires authentication to hold seats', async () => {
    const res = await request(app).post('/api/bookings/lock-seats')
      .send({ showId: fixture.showId, seatIds: [seatAt(0).seat_id] });

    expect(res.status).toBe(401);
  });

  it('holds seats and quotes a total the client did not supply', async () => {
    const seats = [seatAt(0), seatAt(1)];
    const res = await authed('post', '/api/bookings/lock-seats', alice.token)
      .send({ showId: fixture.showId, seatIds: seats.map((s) => s.seat_id) });

    expect(res.status).toBe(200);
    expect(res.body.hold.expiresInSeconds).toBeGreaterThan(0);
    expect(res.body.hold.expiresInSeconds).toBeLessThanOrEqual(config.SEAT_LOCK_TTL);

    const expectedSeatAmount = seats.reduce((sum, s) => sum + s.price, 0);
    const fee = seats.length * config.CONVENIENCE_FEE_PER_SEAT;
    expect(res.body.summary.seatAmount).toBe(expectedSeatAmount);
    expect(res.body.summary.convenienceFee).toBe(fee);
    expect(res.body.summary.taxAmount)
      .toBeCloseTo((expectedSeatAmount + fee) * config.GST_RATE, 2);
  });

  it('refuses a hold on a seat another customer is already holding', async () => {
    const res = await authed('post', '/api/bookings/lock-seats', bob.token)
      .send({ showId: fixture.showId, seatIds: [seatAt(0).seat_id] });

    expect(res.status).toBe(409);
    expect(res.body.conflictSeats).toContain(seatAt(0).seat_id);
  });

  it('shows a held seat as LOCKED to others and HELD_BY_ME to the holder', async () => {
    const forBob = await authed('get', `/api/shows/${fixture.showId}/seats`, bob.token);
    const forAlice = await authed('get', `/api/shows/${fixture.showId}/seats`, alice.token);

    const asBob = forBob.body.seatMap.find((s) => s.seat_id === seatAt(0).seat_id);
    const asAlice = forAlice.body.seatMap.find((s) => s.seat_id === seatAt(0).seat_id);

    expect(asBob.status).toBe('LOCKED');
    expect(asAlice.status).toBe('HELD_BY_ME');
  });

  it('refuses to book seats the caller never held', async () => {
    // Bypassing lock-seats must not be a way to take someone's checkout.
    const res = await authed('post', '/api/bookings', bob.token)
      .send({ showId: fixture.showId, seatIds: [seatAt(0).seat_id] });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SEAT_HOLD_LOST');
  });

  let bookingId;

  it('creates a pending booking for the holder', async () => {
    const res = await authed('post', '/api/bookings', alice.token)
      .send({ showId: fixture.showId, seatIds: [seatAt(0).seat_id, seatAt(1).seat_id] });

    expect(res.status).toBe(201);
    expect(res.body.booking.status).toBe('Pending');
    expect(res.body.booking.bookingRef).toMatch(/^CW-\d{4}-\d{6}$/);
    bookingId = res.body.booking.bookingId;
  });

  it('ignores any amount the client tries to dictate', async () => {
    const [row] = await db.query('SELECT total_amount FROM bookings WHERE booking_id = ?', [bookingId]);
    const seatAmount = seatAt(0).price + seatAt(1).price;
    const fee = 2 * config.CONVENIENCE_FEE_PER_SEAT;
    const expected = Math.round((seatAmount + fee) * (1 + config.GST_RATE) * 100) / 100;

    expect(Number(row.total_amount)).toBeCloseTo(expected, 2);
  });

  it('rejects a seat that does not belong to the show', async () => {
    const res = await authed('post', '/api/bookings/lock-seats', bob.token)
      .send({ showId: fixture.showId, seatIds: [999_999] });

    expect(res.status).toBe(400);
  });

  it('caps the number of seats in one booking', async () => {
    const res = await authed('post', '/api/bookings/lock-seats', bob.token)
      .send({ showId: fixture.showId, seatIds: Array.from({ length: 20 }, (_, i) => i + 1) });

    expect(res.status).toBe(400);
  });

  it('lets the database reject a double allocation even if the API is bypassed', async () => {
    // Writing straight to booking_seats simulates a bug or a second process
    // getting past every application-level guard. uq_seat_occupancy is the
    // last line of defence and must still refuse.
    const booking = await db.query(
      `INSERT INTO bookings (booking_ref, user_id, show_id, total_amount, status)
       VALUES (CONCAT('TST-', SUBSTRING(MD5(RAND()), 1, 12)), ?, ?, 1, 'Pending')`,
      [bob.userId, fixture.showId]
    );

    await expect(
      db.query(
        'INSERT INTO booking_seats (booking_id, show_id, seat_id, seat_price) VALUES (?, ?, ?, ?)',
        [booking.insertId, fixture.showId, seatAt(0).seat_id, 100]
      )
    ).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });

    await db.query('DELETE FROM bookings WHERE booking_id = ?', [booking.insertId]);
  });

  it('returns the booking to its owner and hides it from everyone else', async () => {
    const mine = await authed('get', `/api/bookings/${bookingId}`, alice.token);
    expect(mine.status).toBe(200);
    expect(mine.body.booking.seats).toHaveLength(2);

    const theirs = await authed('get', `/api/bookings/${bookingId}`, bob.token);
    expect(theirs.status).toBe(403);
  });

  it('will not issue a ticket before the booking is paid for', async () => {
    const res = await authed('get', `/api/bookings/${bookingId}/ticket`, alice.token);
    expect(res.status).toBe(400);
  });

  it('cancels a booking and puts the seats back on sale', async () => {
    const res = await authed('post', `/api/bookings/${bookingId}/cancel`, alice.token);
    expect(res.status).toBe(200);

    const seats = await request(app).get(`/api/shows/${fixture.showId}/seats`);
    const released = seats.body.seatMap.find((s) => s.seat_id === seatAt(0).seat_id);
    expect(released.status).toBe('AVAILABLE');

    // And the seat can genuinely be taken by someone else afterwards.
    const rebook = await authed('post', '/api/bookings/lock-seats', bob.token)
      .send({ showId: fixture.showId, seatIds: [seatAt(0).seat_id] });
    expect(rebook.status).toBe(200);
  });
});
