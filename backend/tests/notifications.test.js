const { loginAdmin, registerCustomer, createShowFixture, destroyShowFixture, authed } = require('./helpers');
const db = require('../src/config/db');
const { handleNotificationEvent } = require('../src/kafka/consumers/notificationConsumer');
const { handleAnalyticsEvent } = require('../src/kafka/consumers/analyticsConsumer');

describe('Transactional booking events and notifications', () => {
  let adminToken;
  let fixture;
  let customer;
  let other;
  let bookingId;

  beforeAll(async () => {
    adminToken = await loginAdmin();
    fixture = await createShowFixture(adminToken);
    customer = await registerCustomer('notified');
    other = await registerCustomer('not-owner');
  }, 30_000);

  afterAll(async () => {
    await destroyShowFixture(adminToken, fixture);
  }, 30_000);

  const outboxEvent = async (type) => {
    const [row] = await db.query(
      'SELECT event_id, event_type, payload FROM outbox_events WHERE aggregate_id = ? AND event_type = ?',
      [bookingId, type]
    );
    return { eventId: row.event_id, eventType: row.event_type,
      data: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload };
  };

  it('writes an event with each booking transition and consumes confirmation once', async () => {
    const seatId = fixture.seatMap[0].seat_id;
    expect((await authed('post', '/api/bookings/lock-seats', customer.token)
      .send({ showId: fixture.showId, seatIds: [seatId] })).status).toBe(200);
    const created = await authed('post', '/api/bookings', customer.token)
      .send({ showId: fixture.showId, seatIds: [seatId] });
    expect(created.status).toBe(201);
    bookingId = created.body.booking.bookingId;
    expect((await outboxEvent('BookingCreated')).data.userId).toBe(customer.userId);

    const paid = await authed('post', '/api/payments/confirm', customer.token)
      .send({ bookingId });
    expect(paid.status).toBe(200);
    const event = await outboxEvent('BookingConfirmed');
    expect(event.data.showId).toBe(fixture.showId);

    await handleNotificationEvent(event);
    await handleNotificationEvent(event);
    await handleAnalyticsEvent(event);
    await handleAnalyticsEvent(event);
    const delivered = await authed('get', '/api/notifications', customer.token);
    expect(delivered.body.notifications).toHaveLength(1);
    expect(delivered.body.notifications[0].title).toBe('Booking confirmed');
    expect(delivered.body.unreadCount).toBe(1);
    const [consumed] = await db.query(
      'SELECT COUNT(*) AS n FROM consumed_events WHERE event_id = ?', [event.eventId]
    );
    expect(consumed.n).toBe(2);

    expect((await authed('get', '/api/notifications', other.token)).body.notifications).toHaveLength(0);
    const id = delivered.body.notifications[0].notification_id;
    expect((await authed('patch', `/api/notifications/${id}/read`, other.token)).status).toBe(404);
    expect((await authed('patch', `/api/notifications/${id}/read`, customer.token)).status).toBe(200);
  });

  it('delivers a cancellation notification without duplicating it', async () => {
    const cancelled = await authed('post', `/api/bookings/${bookingId}/cancel`, customer.token);
    expect(cancelled.status).toBe(200);
    const event = await outboxEvent('BookingCancelled');
    await handleNotificationEvent(event);
    await handleNotificationEvent(event);
    await handleAnalyticsEvent(event);
    const delivered = await authed('get', '/api/notifications', customer.token);
    expect(delivered.body.notifications).toHaveLength(2);
    expect(delivered.body.notifications[0].title).toBe('Booking cancelled');
  });
});
