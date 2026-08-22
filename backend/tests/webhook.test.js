const request = require('supertest');
const crypto = require('crypto');
const {
  app, unique, loginAdmin, registerCustomer, createShowFixture, destroyShowFixture, authed
} = require('./helpers');
const db = require('../src/config/db');
const config = require('../src/config/env');
const { getShowLockedSeatsMap } = require('../src/redis/seatLock');

/** Signs a body exactly as the gateway would, over the raw bytes. */
const sign = (rawBody) =>
  crypto.createHmac('sha256', config.WEBHOOK_SECRET).update(rawBody).digest('hex');

const postWebhook = (payload, { signature } = {}) => {
  const rawBody = JSON.stringify(payload);
  const req = request(app)
    .post('/api/webhooks/payment')
    .set('Content-Type', 'application/json');

  if (signature !== null) req.set('x-webhook-signature', signature ?? sign(rawBody));
  return req.send(rawBody);
};

const makeEvent = (bookingId, overrides = {}) => ({
  eventId: `evt_${unique()}`,
  eventType: 'payment.captured',
  createdAt: new Date().toISOString(),
  data: {
    bookingId,
    orderId: `order_${unique()}`,
    transactionId: `txn_${unique()}`,
    idempotencyKey: `idem_${unique()}`,
    amount: null,
    currency: 'INR',
    paymentMethod: 'UPI',
    status: 'SUCCESS',
    ...overrides
  }
});

describe('Payment webhook', () => {
  let adminToken;
  let fixture;
  let customer;

  beforeAll(async () => {
    adminToken = await loginAdmin();
    // Roomy enough that every test can take seats no other test has touched.
    fixture = await createShowFixture(adminToken, {
      seatRows: [
        { seat_type: 'Platinum', count: 10 },
        { seat_type: 'Silver', count: 10 }
      ]
    });
    customer = await registerCustomer('payer');
  }, 30_000);

  afterAll(async () => {
    await destroyShowFixture(adminToken, fixture);
  }, 30_000);

  /**
   * Hands out seats no earlier test has used.
   *
   * A rejected webhook deliberately leaves its booking Pending, which keeps
   * those seats allocated — so reusing an index across tests would make the
   * next lock attempt fail for the right reason at the wrong time.
   */
  let seatCursor = 0;
  const takeSeats = (count) => {
    const slice = fixture.seatMap.slice(seatCursor, seatCursor + count);
    seatCursor += count;
    if (slice.length < count) throw new Error('Fixture ran out of seats');
    return slice.map((s) => s.seat_id);
  };

  /** Holds seats and creates a pending booking, returning its id. */
  const newPendingBooking = async (count = 1) => {
    const seatIds = takeSeats(count);
    const lock = await authed('post', '/api/bookings/lock-seats', customer.token)
      .send({ showId: fixture.showId, seatIds });
    expect(lock.status).toBe(200);

    const booking = await authed('post', '/api/bookings', customer.token)
      .send({ showId: fixture.showId, seatIds });
    expect(booking.status).toBe(201);
    return { bookingId: booking.body.booking.bookingId, seatIds };
  };

  it('rejects an unsigned webhook', async () => {
    // The original handler only verified when a signature was present, so
    // omitting the header skipped authentication entirely.
    const { bookingId } = await newPendingBooking();
    const res = await postWebhook(makeEvent(bookingId), { signature: null });

    expect(res.status).toBe(401);

    const [booking] = await db.query('SELECT status FROM bookings WHERE booking_id = ?', [bookingId]);
    expect(booking.status).not.toBe('Confirmed');
  });

  it('rejects a webhook with a wrong signature', async () => {
    const { bookingId } = await newPendingBooking();
    const res = await postWebhook(makeEvent(bookingId), { signature: 'f'.repeat(64) });

    expect(res.status).toBe(401);
  });

  it('rejects a signature computed over a different body', async () => {
    // Tampering with the amount after signing must invalidate the request.
    const { bookingId } = await newPendingBooking();
    const event = makeEvent(bookingId);
    const signature = sign(JSON.stringify(event));

    event.data.amount = 1;
    const res = await postWebhook(event, { signature });

    expect(res.status).toBe(401);
  });

  it('confirms a booking on a validly signed capture event', async () => {
    const { bookingId, seatIds } = await newPendingBooking(2);
    const res = await postWebhook(makeEvent(bookingId));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const [booking] = await db.query(
      'SELECT status, confirmed_at FROM bookings WHERE booking_id = ?', [bookingId]
    );
    expect(booking.status).toBe('Confirmed');
    expect(booking.confirmed_at).not.toBeNull();

    // Confirmation makes the seats permanent, so the temporary holds go.
    const locks = await getShowLockedSeatsMap(fixture.showId);
    seatIds.forEach((id) => expect(locks[id]).toBeUndefined());

    const seats = await request(app).get(`/api/shows/${fixture.showId}/seats`);
    seatIds.forEach((id) => {
      expect(seats.body.seatMap.find((s) => s.seat_id === id).status).toBe('BOOKED');
    });
  });

  it('treats a replayed event id as already processed', async () => {
    const { bookingId } = await newPendingBooking();
    const event = makeEvent(bookingId);

    const first = await postWebhook(event);
    expect(first.status).toBe(200);
    expect(first.body.duplicate).toBeUndefined();

    const replay = await postWebhook(event);
    expect(replay.status).toBe(200);
    expect(replay.body.duplicate).toBe(true);

    // One payment row, not two — the replay must not charge again.
    const payments = await db.query(
      "SELECT payment_id FROM payments WHERE booking_id = ? AND payment_status = 'Success'",
      [bookingId]
    );
    expect(payments).toHaveLength(1);
  });

  it('does not double-book when the same payment arrives under a new event id', async () => {
    // A gateway retry can carry a fresh event id. The booking's status guard
    // has to hold even when the idempotency ledger does not catch it.
    const { bookingId } = await newPendingBooking();

    await postWebhook(makeEvent(bookingId));
    const second = await postWebhook(makeEvent(bookingId));

    expect(second.status).toBe(200);

    const [booking] = await db.query(
      'SELECT status FROM bookings WHERE booking_id = ?', [bookingId]
    );
    expect(booking.status).toBe('Confirmed');

    const seatRows = await db.query(
      'SELECT COUNT(*) AS count FROM booking_seats WHERE booking_id = ? AND is_active = 1',
      [bookingId]
    );
    expect(Number(seatRows[0].count)).toBe(1);
  });

  it('releases the seats when payment fails', async () => {
    const { bookingId, seatIds } = await newPendingBooking();

    const res = await postWebhook(makeEvent(bookingId, {
      status: 'FAILED',
      failureReason: 'Insufficient funds'
    }));
    expect(res.status).toBe(200);

    const [booking] = await db.query('SELECT status FROM bookings WHERE booking_id = ?', [bookingId]);
    expect(booking.status).toBe('PaymentFailed');

    // The failure path used to leave the Redis keys in place, so the seats
    // stayed invisible until the TTL lapsed.
    const locks = await getShowLockedSeatsMap(fixture.showId);
    seatIds.forEach((id) => expect(locks[id]).toBeUndefined());

    const seats = await request(app).get(`/api/shows/${fixture.showId}/seats`);
    seatIds.forEach((id) => {
      expect(seats.body.seatMap.find((s) => s.seat_id === id).status).toBe('AVAILABLE');
    });
  });

  it('will not resurrect a cancelled booking', async () => {
    const { bookingId } = await newPendingBooking();
    await authed('post', `/api/bookings/${bookingId}/cancel`, customer.token);

    const res = await postWebhook(makeEvent(bookingId));
    expect(res.status).toBe(200);

    const [booking] = await db.query('SELECT status FROM bookings WHERE booking_id = ?', [bookingId]);
    expect(['Cancelled', 'Refunded']).toContain(booking.status);
  });

  it('records an event for an unknown booking without failing', async () => {
    const res = await postWebhook(makeEvent(99_999_999));
    expect(res.status).toBe(200);
  });

  it('rejects a payload missing required fields', async () => {
    const res = await postWebhook({ eventId: `evt_${unique()}`, data: {} });
    expect(res.status).toBe(400);
  });
});
