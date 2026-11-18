const rateLimit = require('express-rate-limit');
const env = require('../config/env');

const apiRateLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => env.nodeEnv === 'test' || req.path === '/health' || req.path === '/healthy' || req.path === '/ready',
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later.'
    }
  }
});

const publicSubmissionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.nodeEnv === 'test',
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many submissions from this IP, please wait before retrying.'
    }
  }
});

const authRateLimiter = rateLimit({
  windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 25),
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.nodeEnv === 'test' && process.env.ENABLE_TEST_RATE_LIMIT !== 'true',
  message: {
    success: false,
    error: {
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
      message: 'Too many authentication attempts. Please wait and try again later.'
    }
  }
});

const candidateVerificationLimiter = rateLimit({
  windowMs: Number(process.env.CANDIDATE_VERIFICATION_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.CANDIDATE_VERIFICATION_RATE_LIMIT_MAX || 12),
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.nodeEnv === 'test' && process.env.ENABLE_TEST_RATE_LIMIT !== 'true',
  message: {
    success: false,
    error: {
      code: 'VERIFICATION_RATE_LIMIT_EXCEEDED',
      message: 'Too many verification attempts. Please wait and try again later.'
    }
  }
});

const candidateRecoveryLimiter = rateLimit({
  windowMs: Number(process.env.CANDIDATE_RECOVERY_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.CANDIDATE_RECOVERY_RATE_LIMIT_MAX || 10),
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.nodeEnv === 'test' && process.env.ENABLE_TEST_RATE_LIMIT !== 'true',
  message: {
    success: false,
    error: {
      code: 'RECOVERY_RATE_LIMIT_EXCEEDED',
      message: 'Too many password recovery attempts. Please wait and try again later.'
    }
  }
});

module.exports = {
  apiRateLimiter,
  publicSubmissionLimiter,
  authRateLimiter,
  candidateVerificationLimiter,
  candidateRecoveryLimiter
};

