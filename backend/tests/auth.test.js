const request = require('supertest');
const app = require('../src/app');

describe('Auth API Endpoints', () => {
  const testEmail = `user_${Date.now()}@example.com`;

  it('should register a new customer user successfully', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        full_name: 'Test Customer',
        email: testEmail,
        password: 'password123',
        role: 'Customer'
      });

    expect(res.statusCode).toEqual(201);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body.user.email).toEqual(testEmail);
  });

  it('should reject registration with duplicate email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        full_name: 'Test Customer',
        email: testEmail,
        password: 'password123'
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body.success).toBe(false);
  });

  it('should authenticate user and return JWT tokens', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: testEmail,
        password: 'password123'
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('accessToken');
  });
});
