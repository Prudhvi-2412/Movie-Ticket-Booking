const request = require('supertest');
const crypto = require('crypto');
const app = require('../src/app');
const config = require('../src/config/env');

describe('Payment Webhook & Idempotency Pipeline', () => {
  const eventId = `evt_test_${Date.now()}`;
  const idempotencyKey = `idem_test_${Date.now()}`;
  const bookingId = 1;
  const amount = 900;

  const payloadStr = `${bookingId}|${amount}|${config.WEBHOOK_SECRET}`;
  const validSignature = crypto.createHmac('sha256', config.WEBHOOK_SECRET).update(payloadStr).digest('hex');

  it('should process payment webhook event and return 200', async () => {
    const res = await request(app)
      .post('/api/webhooks/payment')
      .send({
        eventId,
        eventType: 'payment.captured',
        bookingId,
        idempotencyKey,
        amount,
        paymentMethod: 'UPI',
        transactionId: `TXN_TEST_${Date.now()}`,
        status: 'SUCCESS',
        signature: validSignature
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should return idempotent 200 response when duplicate webhook event is re-sent', async () => {
    const res = await request(app)
      .post('/api/webhooks/payment')
      .send({
        eventId, // Same eventId
        eventType: 'payment.captured',
        bookingId,
        idempotencyKey,
        amount,
        paymentMethod: 'UPI',
        status: 'SUCCESS',
        signature: validSignature
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toContain('idempotent');
  });
});
