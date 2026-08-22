const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const config = require('../config/env');
const logger = require('../utils/logger');
const { ApiError, asyncHandler } = require('../utils/ApiError');
const { encrypt, decrypt } = require('../utils/crypto');

const BCRYPT_ROUNDS = 10;

/**
 * Issues an access/refresh pair.
 *
 * The `jti` is what makes refresh-token rotation mean anything. JWT's `iat`
 * has one-second resolution, so signing the same payload twice inside the
 * same second produced byte-identical tokens — the "rotated" token equalled
 * the old one, and a captured refresh token stayed valid after use. A random
 * id per issuance guarantees every token is distinct.
 */
const generateTokens = (user) => {
  const base = { userId: user.user_id, email: user.email, role: user.role };
  return {
    accessToken: jwt.sign(
      { ...base, jti: crypto.randomUUID() },
      config.JWT_SECRET,
      { expiresIn: config.JWT_EXPIRES_IN }
    ),
    refreshToken: jwt.sign(
      { ...base, jti: crypto.randomUUID() },
      config.JWT_REFRESH_SECRET,
      { expiresIn: config.JWT_REFRESH_EXPIRES_IN }
    )
  };
};

const publicUser = (row) => ({
  user_id: row.user_id,
  full_name: row.full_name,
  email: row.email,
  role: row.role,
  avatar_url: row.avatar_url || null,
  phone: row.phone_encrypted ? decrypt(row.phone_encrypted) : null,
  preferences: row.preferences || null,
  created_at: row.created_at
});

/**
 * POST /api/auth/register
 *
 * Self-registration always creates a Customer. The old handler accepted a
 * `role` field from the request body, so anyone could POST
 * `{ role: 'Admin' }` and grant themselves the admin dashboard. Admins are
 * promoted by an existing admin through /api/admin/users/:id/role.
 */
const register = asyncHandler(async (req, res) => {
  const { full_name, email, password, phone } = req.body;

  const existing = await db.query('SELECT user_id FROM users WHERE email = ?', [email]);
  if (existing.length > 0) {
    throw ApiError.conflict('An account with this email already exists.');
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const result = await db.query(
    'INSERT INTO users (full_name, email, password_hash, role, phone_encrypted) VALUES (?, ?, ?, ?, ?)',
    [full_name, email, passwordHash, 'Customer', encrypt(phone)]
  );

  const user = { user_id: result.insertId, full_name, email, role: 'Customer' };
  const tokens = generateTokens(user);
  await db.query('UPDATE users SET refresh_token = ? WHERE user_id = ?', [tokens.refreshToken, user.user_id]);

  logger.info('Registered user %s', email);
  res.status(201).json({
    success: true,
    message: 'Welcome to CineWave.',
    user: { ...user, phone: phone || null, avatar_url: null },
    ...tokens
  });
});

/** POST /api/auth/login */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const users = await db.query('SELECT * FROM users WHERE email = ? AND is_active = TRUE', [email]);

  // Always run a bcrypt comparison, even when the account does not exist, so
  // response timing does not reveal which emails are registered.
  const user = users[0];
  const hash = user ? user.password_hash : '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi';
  const isMatch = await bcrypt.compare(password, hash);

  if (!user || !isMatch) {
    throw ApiError.unauthorized('Incorrect email or password.');
  }

  const tokens = generateTokens(user);
  await db.query('UPDATE users SET refresh_token = ? WHERE user_id = ?', [tokens.refreshToken, user.user_id]);

  logger.info('Login: %s (%s)', user.email, user.role);
  res.json({ success: true, user: publicUser(user), ...tokens });
});

/** POST /api/auth/refresh-token */
const refreshToken = asyncHandler(async (req, res) => {
  const { token } = req.body;

  let decoded;
  try {
    decoded = jwt.verify(token, config.JWT_REFRESH_SECRET);
  } catch {
    throw ApiError.unauthorized('Your session has expired. Please sign in again.', { code: 'REFRESH_INVALID' });
  }

  // The token must also be the one currently stored, so a token issued before
  // a logout or a password change is rejected even while cryptographically valid.
  const users = await db.query(
    'SELECT * FROM users WHERE user_id = ? AND refresh_token = ? AND is_active = TRUE',
    [decoded.userId, token]
  );
  if (users.length === 0) {
    throw ApiError.unauthorized('Your session has expired. Please sign in again.', { code: 'REFRESH_INVALID' });
  }

  const tokens = generateTokens(users[0]);
  await db.query('UPDATE users SET refresh_token = ? WHERE user_id = ?', [tokens.refreshToken, users[0].user_id]);

  res.json({ success: true, user: publicUser(users[0]), ...tokens });
});

/** POST /api/auth/logout — invalidates the stored refresh token. */
const logout = asyncHandler(async (req, res) => {
  await db.query('UPDATE users SET refresh_token = NULL WHERE user_id = ?', [req.user.userId]);
  res.json({ success: true, message: 'Signed out.' });
});

/** GET /api/auth/me */
const me = asyncHandler(async (req, res) => {
  const users = await db.query('SELECT * FROM users WHERE user_id = ? AND is_active = TRUE', [req.user.userId]);
  if (users.length === 0) throw ApiError.notFound('Account not found.');
  res.json({ success: true, user: publicUser(users[0]) });
});

/** PUT /api/auth/me */
const updateProfile = asyncHandler(async (req, res) => {
  const { full_name, phone, avatar_url, preferences } = req.body;

  await db.query(
    `UPDATE users
        SET full_name       = COALESCE(?, full_name),
            phone_encrypted = COALESCE(?, phone_encrypted),
            avatar_url      = COALESCE(?, avatar_url),
            preferences     = COALESCE(?, preferences)
      WHERE user_id = ?`,
    [
      full_name ?? null,
      phone === undefined ? null : encrypt(phone),
      avatar_url ?? null,
      preferences === undefined ? null : JSON.stringify(preferences),
      req.user.userId
    ]
  );

  const users = await db.query('SELECT * FROM users WHERE user_id = ?', [req.user.userId]);
  res.json({ success: true, message: 'Profile updated.', user: publicUser(users[0]) });
});

/** PUT /api/auth/password */
const changePassword = asyncHandler(async (req, res) => {
  const { current_password, new_password } = req.body;

  const users = await db.query('SELECT password_hash FROM users WHERE user_id = ?', [req.user.userId]);
  if (users.length === 0) throw ApiError.notFound('Account not found.');

  const isMatch = await bcrypt.compare(current_password, users[0].password_hash);
  if (!isMatch) throw ApiError.badRequest('Your current password is incorrect.');

  const passwordHash = await bcrypt.hash(new_password, BCRYPT_ROUNDS);
  // Clearing refresh_token forces every other session to sign in again.
  await db.query(
    'UPDATE users SET password_hash = ?, refresh_token = NULL WHERE user_id = ?',
    [passwordHash, req.user.userId]
  );

  res.json({ success: true, message: 'Password updated. Please sign in again on your other devices.' });
});

module.exports = { register, login, refreshToken, logout, me, updateProfile, changePassword, publicUser };
