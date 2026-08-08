const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const db = require('../config/db');
const config = require('../config/env');
const logger = require('../utils/logger');

const generateTokens = (user) => {
  const payload = { userId: user.user_id, email: user.email, role: user.role };
  const accessToken = jwt.sign(payload, config.JWT_SECRET, { expiresIn: config.JWT_EXPIRES_IN });
  const refreshToken = jwt.sign(payload, config.JWT_REFRESH_SECRET, { expiresIn: config.JWT_REFRESH_EXPIRES_IN });
  return { accessToken, refreshToken };
};

const register = async (req, res, next) => {
  try {
    const schema = Joi.object({
      full_name: Joi.string().max(100).required(),
      email: Joi.string().email().required(),
      password: Joi.string().min(6).required(),
      role: Joi.string().valid('Customer', 'Admin').default('Customer')
    });

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.details[0].message });

    const { full_name, email, password, role } = value;

    // Check if user exists
    const existing = await db.query('SELECT user_id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'User with this email already exists.' });
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const result = await db.query(
      'INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [full_name, email, password_hash, role]
    );

    const userId = result.insertId;
    const user = { user_id: userId, full_name, email, role };
    const tokens = generateTokens(user);

    // Save refresh token
    await db.query('UPDATE users SET refresh_token = ? WHERE user_id = ?', [tokens.refreshToken, userId]);

    logger.info('Registered new user: %s (Role: %s)', email, role);
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user,
      ...tokens
    });
  } catch (err) {
    next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const schema = Joi.object({
      email: Joi.string().email().required(),
      password: Joi.string().required()
    });

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.details[0].message });

    const { email, password } = value;

    const users = await db.query('SELECT * FROM users WHERE email = ? AND is_active = TRUE', [email]);
    if (users.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const tokens = generateTokens(user);
    await db.query('UPDATE users SET refresh_token = ? WHERE user_id = ?', [tokens.refreshToken, user.user_id]);

    logger.info('User logged in: %s (%s)', user.email, user.role);
    res.json({
      success: true,
      user: {
        user_id: user.user_id,
        full_name: user.full_name,
        email: user.email,
        role: user.role
      },
      ...tokens
    });
  } catch (err) {
    next(err);
  }
};

const refreshToken = async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, message: 'Refresh token required' });

    const decoded = jwt.verify(token, config.JWT_REFRESH_SECRET);
    const users = await db.query('SELECT * FROM users WHERE user_id = ? AND refresh_token = ?', [decoded.userId, token]);

    if (users.length === 0) {
      return res.status(403).json({ success: false, message: 'Invalid refresh token' });
    }

    const user = users[0];
    const newTokens = generateTokens(user);
    await db.query('UPDATE users SET refresh_token = ? WHERE user_id = ?', [newTokens.refreshToken, user.user_id]);

    res.json({ success: true, ...newTokens });
  } catch (err) {
    return res.status(403).json({ success: false, message: 'Expired or invalid refresh token' });
  }
};

const me = async (req, res, next) => {
  try {
    const users = await db.query('SELECT user_id, full_name, email, role, preferences, created_at FROM users WHERE user_id = ?', [req.user.userId]);
    if (users.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, user: users[0] });
  } catch (err) {
    next(err);
  }
};

module.exports = { register, login, refreshToken, me };
