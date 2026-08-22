const express = require('express');
const ctrl = require('../controllers/authController');
const { authenticateToken } = require('../middleware/authMiddleware');
const { authLimiter } = require('../middleware/rateLimiterMiddleware');
const { validate, rules, Joi } = require('../middleware/validate');

const router = express.Router();

const registerSchema = Joi.object({
  full_name: Joi.string().min(2).max(100).trim().required(),
  email: rules.email.required(),
  password: rules.password.required(),
  phone: rules.phone.optional().allow('', null)
  // `role` is intentionally absent: self-registration cannot grant Admin.
});

const loginSchema = Joi.object({
  email: rules.email.required(),
  password: Joi.string().max(128).required()
});

const profileSchema = Joi.object({
  full_name: Joi.string().min(2).max(100).trim(),
  phone: rules.phone.allow('', null),
  avatar_url: rules.url.allow('', null),
  preferences: Joi.object()
}).min(1);

const passwordSchema = Joi.object({
  current_password: Joi.string().max(128).required(),
  new_password: rules.password.required()
});

router.post('/register', authLimiter, validate(registerSchema), ctrl.register);
router.post('/login', authLimiter, validate(loginSchema), ctrl.login);
router.post('/refresh-token', validate(Joi.object({ token: Joi.string().required() })), ctrl.refreshToken);

router.post('/logout', authenticateToken, ctrl.logout);
router.get('/me', authenticateToken, ctrl.me);
router.put('/me', authenticateToken, validate(profileSchema), ctrl.updateProfile);
router.put('/password', authenticateToken, validate(passwordSchema), ctrl.changePassword);

module.exports = router;
