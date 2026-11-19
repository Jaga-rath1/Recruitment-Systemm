'use strict';

const express = require('express');
const { z } = require('zod');
const validate = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const {
  authRateLimiter,
  candidateVerificationLimiter,
  candidateRecoveryLimiter
} = require('../../middleware/rateLimiter');
const { strongPasswordSchema } = require('../../utils/validationHelpers');
const controller = require('./auth.controller');

const router = express.Router();

const loginSchema = {
  body: z.object({
    email: z.string().email(),
    password: z.string().min(6).max(128)
  })
};

const candidateRegisterSchema = {
  body: z.object({
    fullName: z.string().trim().min(2).max(160),
    email: z.string().trim().email().max(255),
    password: strongPasswordSchema('Password')
  })
};

const verifyEmailSchema = {
  body: z.object({
    email: z.string().trim().email().max(255),
    otp: z.string().trim().regex(/^\d{6}$/, 'Verification code must be a 6-digit number')
  })
};

const emailOnlySchema = {
  body: z.object({
    email: z.string().trim().email().max(255)
  })
};

const resetPasswordSchema = {
  body: z
    .object({
      token: z.string().trim().min(16).max(512),
      newPassword: strongPasswordSchema('New password'),
      confirmPassword: z.string().min(8).max(128).optional()
    })
    .refine((data) => data.confirmPassword === undefined || data.confirmPassword === data.newPassword, {
      message: 'Password confirmation does not match new password',
      path: ['confirmPassword']
    })
};

const changePasswordSchema = {
  body: z
    .object({
      currentPassword: z.string().min(1).max(128),
      newPassword: strongPasswordSchema('New password'),
      confirmPassword: z.string().min(8).max(128)
    })
    .refine((data) => data.confirmPassword === data.newPassword, {
      message: 'Password confirmation does not match new password',
      path: ['confirmPassword']
    })
};

const candidateActivateSchema = {
  body: z
    .object({
      token: z.string().trim().min(16).max(512),
      password: strongPasswordSchema('Password'),
      confirmPassword: z.string().min(8).max(128).optional()
    })
    .refine((data) => data.confirmPassword === undefined || data.confirmPassword === data.password, {
      message: 'Password confirmation does not match password',
      path: ['confirmPassword']
    })
};

const tokenQuerySchema = {
  query: z.object({
    token: z.string().trim().min(16).max(512)
  })
};

// --- Four Dedicated Login Portals ---
// 1. Candidate Login
router.post('/candidate/login', authRateLimiter, validate(loginSchema), controller.candidateLogin);

// 2. Platform Admin Login
router.post('/platform-admin/login', authRateLimiter, validate(loginSchema), controller.platformAdminLogin);

// 3. Organisation Admin Login
router.post('/org-admin/login', authRateLimiter, validate(loginSchema), controller.orgAdminLogin);

// 4. Recruiter Login
router.post('/recruiter/login', authRateLimiter, validate(loginSchema), controller.recruiterLogin);

// Backward-compatible generic login for existing integration tests
router.post('/login', authRateLimiter, validate(loginSchema), controller.login);

// --- Candidate Identity Lifecycle ---
router.post('/candidate/register', authRateLimiter, validate(candidateRegisterSchema), controller.candidateRegister);
router.post('/candidate/verify-email', candidateVerificationLimiter, validate(verifyEmailSchema), controller.verifyCandidateEmail);
router.post('/candidate/resend-verification', candidateVerificationLimiter, validate(emailOnlySchema), controller.resendCandidateVerification);
router.post('/candidate/forgot-password', candidateRecoveryLimiter, validate(emailOnlySchema), controller.forgotCandidatePassword);
router.post('/candidate/reset-password', candidateRecoveryLimiter, validate(resetPasswordSchema), controller.resetCandidatePassword);
router.post('/candidate/change-password', authenticate, candidateRecoveryLimiter, validate(changePasswordSchema), controller.changeCandidatePassword);
router.post('/candidate/activate', candidateVerificationLimiter, validate(candidateActivateSchema), controller.activateCandidate);
router.get('/candidate/activate/inspect', candidateVerificationLimiter, validate(tokenQuerySchema), controller.inspectCandidateActivation);
router.post('/candidate/resend-activation', candidateRecoveryLimiter, validate(emailOnlySchema), controller.resendCandidateActivation);

// Profile
router.get('/me', authenticate, controller.getMe);

module.exports = router;
