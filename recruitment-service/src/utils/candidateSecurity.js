const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { normalizeEmail } = require('./validationHelpers');

const CANDIDATE_JWT_ISSUER = 'nexnuv-recruitment-candidate';
const CANDIDATE_JWT_AUDIENCE = 'nexnuv-candidate-portal';

let dummyPasswordHash = null;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== 'string' || !storedHash.includes(':')) {
    return false;
  }
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex || keyHex.length !== 128) {
    return false;
  }
  const derived = crypto.scryptSync(String(password || ''), salt, 64);
  const expected = Buffer.from(keyHex, 'hex');
  if (derived.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(derived, expected);
}

/**
 * Constant-time mitigation for missing candidate emails during login.
 */
function getDummyPasswordHash() {
  if (!dummyPasswordHash) {
    dummyPasswordHash = hashPassword(crypto.randomBytes(24).toString('hex'));
  }
  return dummyPasswordHash;
}

function generateNumericOtp(digits = 6) {
  const max = 10 ** digits;
  return crypto.randomInt(0, max).toString().padStart(digits, '0');
}

function generateResetToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function hashCandidateToken(rawToken, purpose) {
  if (!purpose) {
    throw new Error('Token hash purpose is required');
  }
  return crypto
    .createHmac('sha256', env.candidateAuth.tokenHashSecret)
    .update(`${purpose}:${String(rawToken || '')}`)
    .digest('hex');
}

function timingSafeEqualHex(leftHex, rightHex) {
  if (!leftHex || !rightHex || typeof leftHex !== 'string' || typeof rightHex !== 'string') {
    return false;
  }
  const leftBuf = Buffer.from(leftHex, 'hex');
  const rightBuf = Buffer.from(rightHex, 'hex');
  if (leftBuf.length === 0 || leftBuf.length !== rightBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuf, rightBuf);
}

function signCandidateToken(candidateAccount) {
  return jwt.sign(
    {
      sub: candidateAccount.id,
      userId: candidateAccount.id,
      email: normalizeEmail(candidateAccount.email),
      name: candidateAccount.fullName,
      organisationId: null,
      employeeId: null,
      userType: 'CANDIDATE',
      roles: ['CANDIDATE'],
      tokenVersion: Number(candidateAccount.tokenVersion || 1),
      emailVerified: Boolean(candidateAccount.emailVerified)
    },
    env.jwt.candidateSecret,
    {
      algorithm: 'HS256',
      issuer: CANDIDATE_JWT_ISSUER,
      audience: CANDIDATE_JWT_AUDIENCE,
      expiresIn: env.jwt.expiresIn
    }
  );
}

function sanitizeCandidateAccount(account) {
  if (!account) return null;
  return {
    userId: account.id,
    email: normalizeEmail(account.email),
    name: account.fullName,
    organisationId: null,
    employeeId: null,
    userType: 'CANDIDATE',
    roles: ['CANDIDATE'],
    emailVerified: Boolean(account.emailVerified),
    emailVerifiedAt: account.emailVerifiedAt || null,
    passwordChangedAt: account.passwordChangedAt || null,
    lastLoginAt: account.lastLoginAt || null
  };
}

module.exports = {
  CANDIDATE_JWT_ISSUER,
  CANDIDATE_JWT_AUDIENCE,
  hashPassword,
  verifyPassword,
  getDummyPasswordHash,
  generateNumericOtp,
  generateResetToken,
  hashCandidateToken,
  timingSafeEqualHex,
  signCandidateToken,
  sanitizeCandidateAccount
};

