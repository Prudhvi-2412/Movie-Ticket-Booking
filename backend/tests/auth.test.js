const request = require('supertest');
const { app, unique, registerCustomer, authed } = require('./helpers');

describe('Authentication and authorisation', () => {
  const email = `auth.${unique()}@test.cinewave`;
  const password = 'Customer@123';
  let tokens;

  it('registers a customer and returns a token pair', async () => {
    const res = await request(app).post('/api/auth/register').send({
      full_name: 'Auth Test User',
      email,
      password
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));
    expect(res.body.user.email).toBe(email);
    tokens = res.body;
  });

  it('never returns the password hash to the client', async () => {
    const res = await authed('get', '/api/auth/me', tokens.accessToken);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
  });

  it('ignores a role field in the registration body', async () => {
    // Self-service registration must not be a path to the admin console.
    const res = await request(app).post('/api/auth/register').send({
      full_name: 'Would-be Admin',
      email: `escalate.${unique()}@test.cinewave`,
      password,
      role: 'Admin'
    });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('Customer');
  });

  it('rejects a weak password', async () => {
    const res = await request(app).post('/api/auth/register').send({
      full_name: 'Weak Password',
      email: `weak.${unique()}@test.cinewave`,
      password: 'short'
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('rejects a duplicate email with 409', async () => {
    const res = await request(app).post('/api/auth/register')
      .send({ full_name: 'Duplicate', email, password });

    expect(res.status).toBe(409);
  });

  it('signs in with correct credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
  });

  it('rejects a wrong password with 401 and no detail about which field failed', async () => {
    const res = await request(app).post('/api/auth/login').send({ email, password: 'WrongPass1' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Incorrect email or password.');
  });

  it('returns the same message for an unknown account', async () => {
    // Identical wording, so the endpoint cannot be used to enumerate emails.
    const res = await request(app).post('/api/auth/login')
      .send({ email: `ghost.${unique()}@test.cinewave`, password });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Incorrect email or password.');
  });

  it('rejects a protected route without a token', async () => {
    const res = await request(app).get('/api/bookings/my');
    expect(res.status).toBe(401);
  });

  it('rejects a protected route with a malformed token', async () => {
    const res = await authed('get', '/api/bookings/my', 'not-a-real-jwt');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_INVALID');
  });

  it('rejects an admin route for a customer with 403', async () => {
    const customer = await registerCustomer('rbac');
    const res = await authed('get', '/api/admin/dashboard', customer.token);
    expect(res.status).toBe(403);
  });

  it('exchanges a refresh token for a new access token', async () => {
    const res = await request(app).post('/api/auth/refresh-token')
      .send({ token: tokens.refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
  });

  it('rejects a refresh token that has been rotated away', async () => {
    // The previous test rotated it; the stale one must no longer work.
    const res = await request(app).post('/api/auth/refresh-token')
      .send({ token: tokens.refreshToken });

    expect(res.status).toBe(401);
  });
});
