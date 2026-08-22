const Joi = require('joi');
const { ApiError } = require('../utils/ApiError');

/**
 * Validates and *replaces* the named request property with Joi's coerced
 * output. Coercion matters: `req.query.page` arrives as the string "2", and
 * handlers downstream expect a number.
 *
 * `stripUnknown` means a client cannot smuggle extra fields (a `role` on a
 * profile update, say) into a handler that spreads the body into SQL.
 */
const validate = (schema, property = 'body') => (req, res, next) => {
  const { error, value } = schema.validate(req[property], {
    abortEarly: false,
    stripUnknown: true,
    convert: true
  });

  if (error) {
    const details = error.details.map((d) => ({
      field: d.path.join('.'),
      message: d.message.replace(/"/g, '')
    }));
    return next(ApiError.badRequest(details[0].message, { code: 'VALIDATION_ERROR', details }));
  }

  // req.query is a getter in Express 5; assign defensively.
  try {
    req[property] = value;
  } catch {
    Object.keys(value).forEach((key) => { req[property][key] = value[key]; });
  }
  return next();
};

/** Reusable primitives so the same rules apply everywhere. */
const rules = {
  id: Joi.number().integer().positive(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  email: Joi.string().email({ minDomainSegments: 2 }).max(100).lowercase().trim(),
  password: Joi.string().min(8).max(128)
    .pattern(/[a-z]/).message('password must contain a lowercase letter')
    .pattern(/[A-Z]/).message('password must contain an uppercase letter')
    .pattern(/[0-9]/).message('password must contain a digit'),
  phone: Joi.string().pattern(/^[0-9+\- ]{7,20}$/).message('phone must be a valid number'),
  url: Joi.string().uri({ scheme: ['http', 'https'] }).max(500),
  seatType: Joi.string().valid('Silver', 'Gold', 'Platinum', 'Recliner'),
  isoDate: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).message('date must be YYYY-MM-DD')
};

module.exports = { validate, rules, Joi };
