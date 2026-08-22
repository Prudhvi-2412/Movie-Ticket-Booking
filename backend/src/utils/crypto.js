const crypto = require('crypto');
const config = require('../config/env');
const logger = require('./logger');

/**
 * Application-side field encryption for personally identifiable data.
 *
 * Phone numbers were previously encrypted with MySQL's AES_ENCRYPT and the
 * literal key 'my_secret_key', which was hardcoded in the schema, the seed
 * file and a view definition. That put the key in the query log, the binlog
 * and anyone's `SHOW CREATE VIEW` output.
 *
 * Doing it here instead means the key never crosses the wire to MySQL, and
 * AES-256-GCM gives authentication as well as confidentiality.
 *
 * Layout of the stored buffer:  [ iv (12B) | authTag (16B) | ciphertext ]
 */
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

// Fixed salt is fine here: the input secret is already high-entropy, and a
// stable salt is what lets us decrypt rows written by an earlier process.
const KEY = crypto.scryptSync(
  process.env.DATA_ENCRYPTION_KEY || config.JWT_SECRET,
  'cinewave-field-encryption-v1',
  32
);

const encrypt = (plaintext) => {
  if (plaintext === null || plaintext === undefined || plaintext === '') return null;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
};

const decrypt = (buffer) => {
  if (!buffer || buffer.length <= IV_LENGTH + TAG_LENGTH) return null;

  try {
    const iv = buffer.subarray(0, IV_LENGTH);
    const tag = buffer.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ciphertext = buffer.subarray(IV_LENGTH + TAG_LENGTH);

    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch (err) {
    // Wrong key or tampered ciphertext. Never surface the raw bytes.
    logger.warn('Failed to decrypt an encrypted field: %s', err.message);
    return null;
  }
};

/** Constant-time comparison for signatures, safe on length mismatch. */
const safeCompare = (a, b) => {
  const bufA = Buffer.from(String(a || ''), 'utf8');
  const bufB = Buffer.from(String(b || ''), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

module.exports = { encrypt, decrypt, safeCompare };
