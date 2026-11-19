const crypto = require('crypto');
const { Op, Sequelize } = require('sequelize');
const env = require('../../config/env');
const logger = require('../../config/logger');
const { getModels, withTransaction, isDatabaseInitialized } = require('../../config/database');
const emailAdapter = require('../../integrations/email/email.adapter');
const notificationAdapter = require('../../integrations/notification/notification.adapter');
const auditService = require('../audit/audit.service');
const { normalizeEmail } = require('../../utils/validationHelpers');
const {
  hashPassword,
  verifyPassword,
  getDummyPasswordHash,
  generateNumericOtp,
  generateResetToken,
  hashCandidateToken,
  timingSafeEqualHex,
  signCandidateToken,
  sanitizeCandidateAccount
} = require('../../utils/candidateSecurity');
const {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  ServiceUnavailableError,
  TooManyRequestsError,
  UnauthorizedError
} = require('../../utils/AppError');

const MAX_COOLDOWN_ENTRIES = 10000;
const resendCooldownByEmail = new Map();
const resetCooldownByEmail = new Map();

function pruneAndSetCooldown(map, key, timestampMs, ttlMs) {
  if (map.size >= MAX_COOLDOWN_ENTRIES) {
    const cutoff = Date.now() - ttlMs;
    for (const [entryKey, ts] of map.entries()) {
      if (ts < cutoff) map.delete(entryKey);
    }
    if (map.size >= MAX_COOLDOWN_ENTRIES) {
      map.clear();
    }
  }
  map.set(key, timestampMs);
}

function ensureDatabaseReady() {
  if (!isDatabaseInitialized()) {
    throw new ServiceUnavailableError(
      'Candidate identity database is unavailable',
      'CANDIDATE_AUTH_UNAVAILABLE'
    );
  }
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + Number(minutes) * 60 * 1000);
}

function addSeconds(date, seconds) {
  return new Date(date.getTime() + Number(seconds) * 1000);
}

async function findCandidateAccountByEmail(email, { transaction = null } = {}) {
  const { CandidateAccount } = getModels();
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  return CandidateAccount.findOne({
    where: {
      [Op.or]: [
        { email: normalized },
        Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('email')), normalized)
      ]
    },
    transaction
  });
}

async function writeCandidateAudit({
  accountId = null,
  action,
  context = {},
  beforeState = null,
  afterState = null,
  transaction = null
}) {
  try {
    await auditService.recordAudit(
      {
        organisationId: null,
        actorUserId: accountId,
        actorRole: 'CANDIDATE',
        entityType: 'CANDIDATE_ACCOUNT',
        entityId: accountId || 'anonymous',
        action,
        requestId: context.requestId || null,
        ipAddress: context.ipAddress || null,
        userAgent: context.userAgent || null,
        beforeState,
        afterState
      },
      transaction
    );
  } catch {
    // Audit persistence failure must not crash auth responses unless transaction itself aborts.
  }
}

async function registerCandidate({ fullName, email, password, requestId = null, ipAddress = null, userAgent = null }) {
  ensureDatabaseReady();
  const { CandidateAccount } = getModels();
  const normalizedEmail = normalizeEmail(email);
  const cleanedName = String(fullName || '').trim();
  const now = new Date();
  const otp = generateNumericOtp(6);
  const otpHash = hashCandidateToken(otp, 'EMAIL_VERIFY');
  const otpExpiresAt = addMinutes(now, env.candidateAuth.otpTtlMinutes);

  const createdAccount = await withTransaction(async (tx) => {
    const existing = await findCandidateAccountByEmail(normalizedEmail, { transaction: tx });
    if (existing) {
      const isAutoProvisionedPending = !existing.emailVerified &&
        typeof existing.passwordHash === 'string' &&
        existing.passwordHash.startsWith('!UNSET_ACTIVATION_PENDING$');

      if (!isAutoProvisionedPending) {
        throw new ConflictError(
          'An account with this email already exists. Please sign in, verify your email, or reset your password.',
          'EMAIL_ALREADY_REGISTERED'
        );
      }
    }

    let created;
    if (existing) {
      await existing.update(
        {
          fullName: cleanedName || existing.fullName,
          passwordHash: hashPassword(password),
          isActive: true,
          emailVerified: false,
          verificationTokenHash: otpHash,
          verificationExpiresAt: otpExpiresAt,
          verificationAttempts: 0,
          verificationLockedUntil: null,
          verificationSentAt: now,
          lastSecurityEventAt: now
        },
        { transaction: tx }
      );
      created = existing;
    } else {
      try {
        created = await CandidateAccount.create(
          {
            email: normalizedEmail,
            fullName: cleanedName,
            passwordHash: hashPassword(password),
            isActive: true,
            emailVerified: false,
            emailVerifiedAt: null,
            verificationTokenHash: otpHash,
            verificationExpiresAt: otpExpiresAt,
            verificationAttempts: 0,
            verificationLockedUntil: null,
            verificationSentAt: now,
            tokenVersion: 1,
            lastSecurityEventAt: now
          },
          { transaction: tx }
        );
      } catch (err) {
        if (err.name === 'SequelizeUniqueConstraintError') {
          throw new ConflictError(
            'An account with this email already exists. Please sign in, verify your email, or reset your password.',
            'EMAIL_ALREADY_REGISTERED'
          );
        }
        throw err;
      }
    }

    await writeCandidateAudit({
      accountId: created.id,
      action: 'CANDIDATE_REGISTERED_PENDING_VERIFICATION',
      context: { requestId, ipAddress, userAgent },
      afterState: { emailVerified: false, otpExpiresAt: otpExpiresAt.toISOString() },
      transaction: tx
    });

    // Delivery executes inside the registration transaction so a failed/unconfigured email provider
    // fails closed and never leaves a half-provisioned or silently verified candidate account.
    await emailAdapter.sendCandidateVerificationOtpEmail({
      to: normalizedEmail,
      fullName: cleanedName,
      otp,
      expiresInMinutes: env.candidateAuth.otpTtlMinutes,
      requestId
    });

    return created;
  });

  pruneAndSetCooldown(
    resendCooldownByEmail,
    normalizedEmail,
    now.getTime(),
    env.candidateAuth.resendCooldownSeconds * 1000
  );

  return {
    requiresEmailVerification: true,
    emailVerified: false,
    verificationExpiresInMinutes: env.candidateAuth.otpTtlMinutes,
    resendCooldownSeconds: env.candidateAuth.resendCooldownSeconds,
    user: sanitizeCandidateAccount(createdAccount)
  };
}

async function verifyCandidateEmail({ email, otp, requestId = null, ipAddress = null, userAgent = null }) {
  ensureDatabaseReady();
  const { CandidateAccount } = getModels();
  const normalizedEmail = normalizeEmail(email);
  const cleanOtp = String(otp || '').trim();
  const now = new Date();
  const account = await findCandidateAccountByEmail(normalizedEmail);

  if (!account || !account.isActive || account.emailVerified) {
    await writeCandidateAudit({
      accountId: account?.id || null,
      action: 'CANDIDATE_EMAIL_VERIFICATION_FAILED',
      context: { requestId, ipAddress, userAgent },
      afterState: { reason: !account ? 'NOT_FOUND' : account.emailVerified ? 'ALREADY_VERIFIED' : 'INACTIVE' }
    });
    throw new BadRequestError('Invalid or expired verification code', null, 'INVALID_VERIFICATION_CODE');
  }

  if (account.verificationLockedUntil && new Date(account.verificationLockedUntil) > now) {
    await writeCandidateAudit({
      accountId: account.id,
      action: 'CANDIDATE_EMAIL_VERIFICATION_LOCKED',
      context: { requestId, ipAddress, userAgent },
      afterState: { lockedUntil: new Date(account.verificationLockedUntil).toISOString() }
    });
    throw new TooManyRequestsError(
      'Too many invalid verification attempts. Please wait before trying again.',
      'VERIFICATION_LOCKED'
    );
  }

  if (
    !account.verificationTokenHash ||
    !account.verificationExpiresAt ||
    new Date(account.verificationExpiresAt) <= now
  ) {
    await writeCandidateAudit({
      accountId: account.id,
      action: 'CANDIDATE_EMAIL_VERIFICATION_FAILED',
      context: { requestId, ipAddress, userAgent },
      afterState: { reason: 'OTP_EXPIRED_OR_MISSING' }
    });
    throw new BadRequestError(
      'Verification code is invalid or has expired. Please request a new code.',
      null,
      'VERIFICATION_EXPIRED'
    );
  }

  const submittedHash = hashCandidateToken(cleanOtp, 'EMAIL_VERIFY');
  if (!timingSafeEqualHex(submittedHash, account.verificationTokenHash)) {
    const nextAttempts = Number(account.verificationAttempts || 0) + 1;
    const hitLimit = nextAttempts >= env.candidateAuth.maxVerificationAttempts;
    const lockUntil = hitLimit ? addMinutes(now, env.candidateAuth.verificationLockMinutes) : null;

    await CandidateAccount.update(
      {
        verificationAttempts: nextAttempts,
        ...(hitLimit
          ? {
              verificationLockedUntil: lockUntil,
              verificationTokenHash: null,
              verificationExpiresAt: null
            }
          : {}),
        lastSecurityEventAt: now
      },
      { where: { id: account.id, emailVerified: false } }
    );

    await writeCandidateAudit({
      accountId: account.id,
      action: hitLimit ? 'CANDIDATE_EMAIL_VERIFICATION_LOCKED' : 'CANDIDATE_EMAIL_VERIFICATION_FAILED',
      context: { requestId, ipAddress, userAgent },
      afterState: { attempts: nextAttempts, locked: hitLimit }
    });

    if (hitLimit) {
      throw new TooManyRequestsError(
        'Too many invalid verification attempts. Verification code has been invalidated; please wait before requesting a new code.',
        'VERIFICATION_LOCKED'
      );
    }

    throw new BadRequestError('Invalid or expired verification code', null, 'INVALID_VERIFICATION_CODE');
  }

  const [affectedRows, updatedRows] = await CandidateAccount.update(
    {
      emailVerified: true,
      emailVerifiedAt: now,
      verificationTokenHash: null,
      verificationExpiresAt: null,
      verificationAttempts: 0,
      verificationLockedUntil: null,
      lastSecurityEventAt: now
    },
    {
      where: {
        id: account.id,
        isActive: true,
        emailVerified: false,
        verificationTokenHash: submittedHash,
        verificationExpiresAt: { [Op.gt]: now }
      },
      returning: true
    }
  );

  if (affectedRows !== 1) {
    throw new BadRequestError('Invalid or expired verification code', null, 'INVALID_VERIFICATION_CODE');
  }

  const verifiedAccount = updatedRows[0];
  await writeCandidateAudit({
    accountId: verifiedAccount.id,
    action: 'CANDIDATE_EMAIL_VERIFIED',
    context: { requestId, ipAddress, userAgent },
    beforeState: { emailVerified: false },
    afterState: { emailVerified: true, emailVerifiedAt: now.toISOString() }
  });

  return {
    emailVerified: true,
    emailVerifiedAt: now.toISOString(),
    requiresLogin: true,
    user: sanitizeCandidateAccount(verifiedAccount)
  };
}

async function resendCandidateVerification({ email, requestId = null, ipAddress = null, userAgent = null }) {
  ensureDatabaseReady();
  const { CandidateAccount } = getModels();
  const normalizedEmail = normalizeEmail(email);
  const now = new Date();
  const cooldownMs = env.candidateAuth.resendCooldownSeconds * 1000;

  const lastMemSent = resendCooldownByEmail.get(normalizedEmail);
  if (lastMemSent && now.getTime() - lastMemSent < cooldownMs) {
    throw new TooManyRequestsError(
      `Please wait ${env.candidateAuth.resendCooldownSeconds} seconds before requesting another verification code.`,
      'VERIFICATION_RESEND_COOLDOWN'
    );
  }

  const account = await findCandidateAccountByEmail(normalizedEmail);
  if (account && !account.emailVerified && account.isActive) {
    if (account.verificationLockedUntil && new Date(account.verificationLockedUntil) > now) {
      throw new TooManyRequestsError(
        'Verification is temporarily locked due to failed attempts. Please wait before requesting a new code.',
        'VERIFICATION_LOCKED'
      );
    }

    if (account.verificationSentAt && addSeconds(new Date(account.verificationSentAt), env.candidateAuth.resendCooldownSeconds) > now) {
      pruneAndSetCooldown(resendCooldownByEmail, normalizedEmail, new Date(account.verificationSentAt).getTime(), cooldownMs);
      throw new TooManyRequestsError(
        `Please wait ${env.candidateAuth.resendCooldownSeconds} seconds before requesting another verification code.`,
        'VERIFICATION_RESEND_COOLDOWN'
      );
    }

    const newOtp = generateNumericOtp(6);
    const newHash = hashCandidateToken(newOtp, 'EMAIL_VERIFY');
    const newExpires = addMinutes(now, env.candidateAuth.otpTtlMinutes);

    await CandidateAccount.update(
      {
        verificationTokenHash: newHash,
        verificationExpiresAt: newExpires,
        verificationAttempts: 0,
        verificationSentAt: now,
        lastSecurityEventAt: now
      },
      { where: { id: account.id, emailVerified: false } }
    );

    try {
      await emailAdapter.sendCandidateVerificationOtpEmail({
        to: account.email,
        fullName: account.fullName,
        otp: newOtp,
        expiresInMinutes: env.candidateAuth.otpTtlMinutes,
        requestId
      });
    } catch (err) {
      await CandidateAccount.update(
        {
          verificationTokenHash: null,
          verificationExpiresAt: null
        },
        { where: { id: account.id, emailVerified: false } }
      );
      throw err;
    }

    await writeCandidateAudit({
      accountId: account.id,
      action: 'CANDIDATE_VERIFICATION_RESENT',
      context: { requestId, ipAddress, userAgent },
      afterState: { otpExpiresAt: newExpires.toISOString() }
    });
  } else {
    // Also fail-closed if email delivery provider is missing/disabled to avoid silently faking delivery
    if (process.env.NODE_ENV !== 'test') {
      const cfg = env.buildEmailConfig(process.env);
      if (cfg.provider === 'DISABLED') {
        throw new ServiceUnavailableError(
          'Transactional email delivery is not configured. Please set EMAIL_PROVIDER to RESEND, BREVO, or SMTP.',
          'EMAIL_DELIVERY_UNAVAILABLE'
        );
      }
    }
  }

  pruneAndSetCooldown(resendCooldownByEmail, normalizedEmail, now.getTime(), cooldownMs);

  return {
    accepted: true,
    cooldownSeconds: env.candidateAuth.resendCooldownSeconds,
    message:
      'If an eligible unverified candidate account exists for this email, a fresh verification code has been sent.'
  };
}

async function authenticateCandidate({ email, password, requestId = null, ipAddress = null, userAgent = null }) {
  ensureDatabaseReady();
  const { CandidateAccount } = getModels();
  const normalizedEmail = normalizeEmail(email);
  const now = new Date();

  const account = await findCandidateAccountByEmail(normalizedEmail);
  const targetHash = account ? account.passwordHash : getDummyPasswordHash();
  const passwordValid = verifyPassword(password, targetHash);

  if (account && account.lockedUntil && new Date(account.lockedUntil) > now) {
    await writeCandidateAudit({
      accountId: account.id,
      action: 'CANDIDATE_LOGIN_LOCKED',
      context: { requestId, ipAddress, userAgent },
      afterState: { lockedUntil: new Date(account.lockedUntil).toISOString() }
    });
    throw new TooManyRequestsError(
      'Too many failed sign-in attempts. Please wait and try again later.',
      'ACCOUNT_LOCKED'
    );
  }

  if (!account || !account.isActive || !passwordValid) {
    if (account && account.isActive) {
      const nextFailed = Number(account.failedLoginAttempts || 0) + 1;
      const shouldLock = nextFailed >= env.candidateAuth.maxFailedLoginAttempts;
      const lockUntil = shouldLock ? addMinutes(now, env.candidateAuth.loginLockMinutes) : null;

      await CandidateAccount.update(
        {
          failedLoginAttempts: nextFailed,
          lockedUntil: lockUntil,
          lastSecurityEventAt: now
        },
        { where: { id: account.id } }
      );

      await writeCandidateAudit({
        accountId: account.id,
        action: shouldLock ? 'CANDIDATE_LOGIN_LOCKED' : 'CANDIDATE_LOGIN_FAILED',
        context: { requestId, ipAddress, userAgent },
        afterState: { failedLoginAttempts: nextFailed, locked: shouldLock }
      });

      if (shouldLock) {
        throw new TooManyRequestsError(
          'Too many failed sign-in attempts. Account temporarily locked.',
          'ACCOUNT_LOCKED'
        );
      }
    } else {
      await writeCandidateAudit({
        accountId: account?.id || null,
        action: 'CANDIDATE_LOGIN_FAILED',
        context: { requestId, ipAddress, userAgent },
        afterState: { reason: !account ? 'NOT_FOUND' : 'INACTIVE' }
      });
    }
    throw new UnauthorizedError('Invalid email or password');
  }

  if (!account.emailVerified) {
    await writeCandidateAudit({
      accountId: account.id,
      action: 'CANDIDATE_LOGIN_BLOCKED_UNVERIFIED',
      context: { requestId, ipAddress, userAgent }
    });
    throw new ForbiddenError(
      'Please verify your email address before signing in to the Candidate Portal.',
      'EMAIL_NOT_VERIFIED'
    );
  }

  await CandidateAccount.update(
    {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: now
    },
    { where: { id: account.id } }
  );

  const refreshed = await CandidateAccount.findByPk(account.id);
  await writeCandidateAudit({
    accountId: refreshed.id,
    action: 'CANDIDATE_LOGIN_SUCCEEDED',
    context: { requestId, ipAddress, userAgent }
  });

  return {
    token: signCandidateToken(refreshed),
    user: sanitizeCandidateAccount(refreshed)
  };
}

async function requestPasswordReset({ email, requestId = null, ipAddress = null, userAgent = null }) {
  ensureDatabaseReady();
  const { CandidateAccount } = getModels();
  const normalizedEmail = normalizeEmail(email);
  const now = new Date();
  const cooldownMs = env.candidateAuth.resetCooldownSeconds * 1000;

  if (process.env.NODE_ENV !== 'test') {
    const cfg = env.buildEmailConfig(process.env);
    if (cfg.provider === 'DISABLED') {
      throw new ServiceUnavailableError(
        'Transactional email delivery is not configured. Password reset emails cannot be sent.',
        'EMAIL_DELIVERY_UNAVAILABLE'
      );
    }
  }

  const lastMemReset = resetCooldownByEmail.get(normalizedEmail);
  if (lastMemReset && now.getTime() - lastMemReset < cooldownMs) {
    return {
      accepted: true,
      message: 'If a verified candidate account exists for this email, password reset instructions have been sent.'
    };
  }

  const account = await findCandidateAccountByEmail(normalizedEmail);
  if (account && account.isActive && account.emailVerified) {
    if (account.resetSentAt && addSeconds(new Date(account.resetSentAt), env.candidateAuth.resetCooldownSeconds) > now) {
      pruneAndSetCooldown(resetCooldownByEmail, normalizedEmail, new Date(account.resetSentAt).getTime(), cooldownMs);
      return {
        accepted: true,
        message: 'If a verified candidate account exists for this email, password reset instructions have been sent.'
      };
    }

    const rawResetToken = generateResetToken(32);
    const resetHash = hashCandidateToken(rawResetToken, 'PASSWORD_RESET');
    const expiresAt = addMinutes(now, env.candidateAuth.resetTtlMinutes);
    const resetUrl = `${env.clientAppUrl}/reset-password?token=${encodeURIComponent(rawResetToken)}`;

    await CandidateAccount.update(
      {
        resetTokenHash: resetHash,
        resetExpiresAt: expiresAt,
        resetAttempts: 0,
        resetSentAt: now,
        lastSecurityEventAt: now
      },
      { where: { id: account.id, isActive: true, emailVerified: true } }
    );

    try {
      await emailAdapter.sendCandidatePasswordResetEmail({
        to: account.email,
        fullName: account.fullName,
        resetUrl,
        resetToken: rawResetToken,
        expiresInMinutes: env.candidateAuth.resetTtlMinutes,
        requestId
      });
    } catch (err) {
      await CandidateAccount.update(
        {
          resetTokenHash: null,
          resetExpiresAt: null
        },
        { where: { id: account.id } }
      );
      throw err;
    }

    await writeCandidateAudit({
      accountId: account.id,
      action: 'CANDIDATE_PASSWORD_RESET_REQUESTED',
      context: { requestId, ipAddress, userAgent },
      afterState: { resetExpiresAt: expiresAt.toISOString() }
    });
  }

  pruneAndSetCooldown(resetCooldownByEmail, normalizedEmail, now.getTime(), cooldownMs);

  return {
    accepted: true,
    message: 'If a verified candidate account exists for this email, password reset instructions have been sent.'
  };
}

async function resetCandidatePassword({
  token,
  newPassword,
  confirmPassword,
  requestId = null,
  ipAddress = null,
  userAgent = null
}) {
  ensureDatabaseReady();
  const { CandidateAccount } = getModels();
  const rawToken = String(token || '').trim();
  if (!rawToken) {
    throw new BadRequestError('Invalid or expired password reset token', null, 'INVALID_RESET_TOKEN');
  }
  if (confirmPassword !== undefined && confirmPassword !== newPassword) {
    throw new BadRequestError('Password confirmation does not match new password', null, 'PASSWORD_MISMATCH');
  }

  const submittedHash = hashCandidateToken(rawToken, 'PASSWORD_RESET');
  const now = new Date();
  let account = await CandidateAccount.findOne({
    where: { resetTokenHash: submittedHash }
  });

  if (!account) {
    const activationHash = hashCandidateToken(rawToken, 'CANDIDATE_ACTIVATION');
    const activationAccount = await CandidateAccount.findOne({
      where: { verificationTokenHash: activationHash }
    });
    if (activationAccount) {
      const actRes = await activateCandidateAccount({
        token: rawToken,
        password: newPassword,
        confirmPassword,
        requestId,
        ipAddress,
        userAgent
      });
      return {
        resetCompleted: true,
        sessionsRevoked: true,
        requiresLogin: true,
        loginPath: '/login',
        email: actRes.email,
        message: 'Candidate account activated successfully. You may now sign in with your password.'
      };
    }
  }

  if (
    !account ||
    !account.isActive ||
    !account.emailVerified ||
    !account.resetExpiresAt ||
    new Date(account.resetExpiresAt) <= now ||
    !timingSafeEqualHex(submittedHash, account.resetTokenHash)
  ) {
    await writeCandidateAudit({
      accountId: account?.id || null,
      action: 'CANDIDATE_PASSWORD_RESET_FAILED',
      context: { requestId, ipAddress, userAgent },
      afterState: { reason: !account ? 'TOKEN_NOT_FOUND' : 'TOKEN_EXPIRED_OR_INVALID' }
    });
    throw new BadRequestError('Invalid or expired password reset token', null, 'INVALID_RESET_TOKEN');
  }

  const newHash = hashPassword(newPassword);
  const [affectedRows] = await CandidateAccount.update(
    {
      passwordHash: newHash,
      passwordChangedAt: now,
      tokenVersion: Number(account.tokenVersion || 1) + 1,
      resetTokenHash: null,
      resetExpiresAt: null,
      resetAttempts: 0,
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastSecurityEventAt: now
    },
    {
      where: {
        id: account.id,
        isActive: true,
        emailVerified: true,
        resetTokenHash: submittedHash,
        resetExpiresAt: { [Op.gt]: now },
        tokenVersion: Number(account.tokenVersion || 1)
      }
    }
  );

  if (affectedRows !== 1) {
    throw new BadRequestError('Invalid or expired password reset token', null, 'INVALID_RESET_TOKEN');
  }

  await writeCandidateAudit({
    accountId: account.id,
    action: 'CANDIDATE_PASSWORD_RESET_COMPLETED',
    context: { requestId, ipAddress, userAgent },
    afterState: { sessionsRevoked: true }
  });

  return {
    resetCompleted: true,
    sessionsRevoked: true,
    requiresLogin: true,
    message: 'Password has been reset. Please sign in with your new password.'
  };
}

async function changeCandidatePassword({
  auth,
  currentPassword,
  newPassword,
  confirmPassword,
  requestId = null,
  ipAddress = null,
  userAgent = null
}) {
  ensureDatabaseReady();
  const { CandidateAccount } = getModels();
  if (!auth || auth.userType !== 'CANDIDATE' || !auth.userId) {
    throw new ForbiddenError('Only authenticated candidate accounts can change candidate passwords');
  }
  if (confirmPassword !== undefined && confirmPassword !== newPassword) {
    throw new BadRequestError('Password confirmation does not match new password', null, 'PASSWORD_MISMATCH');
  }
  if (currentPassword === newPassword) {
    throw new BadRequestError('New password must be different from your current password', null, 'PASSWORD_REUSE_REJECTED');
  }

  const now = new Date();
  const updated = await withTransaction(async (tx) => {
    const account = await CandidateAccount.findByPk(auth.userId, { transaction: tx });
    if (!account || !account.isActive || !account.emailVerified) {
      throw new UnauthorizedError('Candidate account is inactive or unverified');
    }

    if (!verifyPassword(currentPassword, account.passwordHash)) {
      await writeCandidateAudit({
        accountId: account.id,
        action: 'CANDIDATE_PASSWORD_CHANGE_FAILED',
        context: { requestId, ipAddress, userAgent },
        afterState: { reason: 'INVALID_CURRENT_PASSWORD' },
        transaction: tx
      });
      throw new BadRequestError('Current password is incorrect', null, 'INVALID_CURRENT_PASSWORD');
    }

    const nextTokenVersion = Number(account.tokenVersion || 1) + 1;
    await account.update(
      {
        passwordHash: hashPassword(newPassword),
        passwordChangedAt: now,
        tokenVersion: nextTokenVersion,
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastSecurityEventAt: now
      },
      { transaction: tx }
    );

    await writeCandidateAudit({
      accountId: account.id,
      action: 'CANDIDATE_PASSWORD_CHANGED',
      context: { requestId, ipAddress, userAgent },
      afterState: { tokenVersionIncremented: true, sessionsRevoked: true },
      transaction: tx
    });

    return account;
  });

  return {
    passwordChanged: true,
    sessionsRevoked: true,
    requiresRelogin: true,
    user: sanitizeCandidateAccount(updated),
    message: 'Password updated and all active sessions revoked. Please sign in again.'
  };
}

async function deactivateCandidateAccount({
  candidateAccountId,
  actorUserId = null,
  requestId = null,
  ipAddress = null,
  userAgent = null
}) {
  ensureDatabaseReady();
  const { CandidateAccount } = getModels();
  const now = new Date();
  const account = await CandidateAccount.findByPk(candidateAccountId);
  if (!account) {
    return null;
  }

  await account.update({
    isActive: false,
    tokenVersion: Number(account.tokenVersion || 1) + 1,
    verificationTokenHash: null,
    resetTokenHash: null,
    lastSecurityEventAt: now
  });

  await writeCandidateAudit({
    accountId: actorUserId || account.id,
    action: 'CANDIDATE_ACCOUNT_DEACTIVATED',
    context: { requestId, ipAddress, userAgent },
    beforeState: { isActive: true },
    afterState: { isActive: false, sessionsRevoked: true }
  });

  return sanitizeCandidateAccount(account);
}

/**
 * Automatically provisions or retrieves a CandidateAccount when applying for a job.
 * - New candidate: creates CandidateAccount with pending activation, generates single-use activation token.
 * - Existing candidate (active): returns existing account, needsActivation: false (preserves password).
 * - Existing candidate (inactive): refreshes activation token, needsActivation: true.
 */
async function provisionCandidateAccountForApplication({
  fullName,
  email,
  requestId = null,
  ipAddress = null,
  userAgent = null
}) {
  ensureDatabaseReady();
  const { CandidateAccount } = getModels();
  const normalizedEmail = normalizeEmail(email);
  const cleanedName = String(fullName || '').trim();
  const now = new Date();
  const activationTtlHours = 48;
  const expiresAt = addMinutes(now, activationTtlHours * 60);

  const existing = await findCandidateAccountByEmail(normalizedEmail);
  if (existing) {
    if (existing.emailVerified && existing.isActive) {
      // Existing activated candidate: NEVER overwrite password or reset token
      return {
        isNew: false,
        account: existing,
        needsActivation: false,
        rawActivationToken: null,
        expiresInHours: activationTtlHours
      };
    }

    // Existing inactive candidate: refresh single-use activation token
    const rawActivationToken = generateResetToken(32);
    const activationHash = hashCandidateToken(rawActivationToken, 'CANDIDATE_ACTIVATION');

    await CandidateAccount.update(
      {
        fullName: cleanedName || existing.fullName,
        verificationTokenHash: activationHash,
        verificationExpiresAt: expiresAt,
        verificationAttempts: 0,
        verificationSentAt: now,
        lastSecurityEventAt: now
      },
      { where: { id: existing.id } }
    );

    await writeCandidateAudit({
      accountId: existing.id,
      action: 'CANDIDATE_ACTIVATION_TOKEN_REFRESHED',
      context: { requestId, ipAddress, userAgent },
      afterState: { verificationExpiresAt: expiresAt.toISOString(), emailVerified: false }
    });

    const refreshed = await CandidateAccount.findByPk(existing.id);
    return {
      isNew: false,
      account: refreshed,
      needsActivation: true,
      rawActivationToken,
      expiresInHours: activationTtlHours
    };
  }

  // New candidate: provision candidate account
  const rawActivationToken = generateResetToken(32);
  const activationHash = hashCandidateToken(rawActivationToken, 'CANDIDATE_ACTIVATION');
  // Secure unguessable placeholder password hash before candidate sets their own password
  const placeholderHash = '!UNSET_ACTIVATION_PENDING$' + crypto.randomBytes(16).toString('hex');

  let created;
  try {
    created = await CandidateAccount.create({
      email: normalizedEmail,
      fullName: cleanedName,
      passwordHash: placeholderHash,
      isActive: true,
      emailVerified: false,
      emailVerifiedAt: null,
      verificationTokenHash: activationHash,
      verificationExpiresAt: expiresAt,
      verificationAttempts: 0,
      verificationLockedUntil: null,
      verificationSentAt: now,
      tokenVersion: 1,
      lastSecurityEventAt: now
    });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      const raced = await findCandidateAccountByEmail(normalizedEmail);
      if (raced) {
        return provisionCandidateAccountForApplication({
          fullName,
          email,
          requestId,
          ipAddress,
          userAgent
        });
      }
    }
    throw err;
  }

  await writeCandidateAudit({
    accountId: created.id,
    action: 'CANDIDATE_ACCOUNT_PROVISIONED_FOR_APPLICATION',
    context: { requestId, ipAddress, userAgent },
    afterState: { emailVerified: false, verificationExpiresAt: expiresAt.toISOString() }
  });

  return {
    isNew: true,
    account: created,
    needsActivation: true,
    rawActivationToken,
    expiresInHours: activationTtlHours
  };
}

/**
 * Inspects a candidate activation token without invalidating it.
 */
async function inspectCandidateActivationToken(rawToken) {
  ensureDatabaseReady();
  const { CandidateAccount } = getModels();
  const token = String(rawToken || '').trim();
  if (!token || token.length < 16) {
    throw new BadRequestError('Invalid or missing activation token', null, 'INVALID_ACTIVATION_TOKEN');
  }

  const tokenHash = hashCandidateToken(token, 'CANDIDATE_ACTIVATION');
  const now = new Date();
  const account = await CandidateAccount.findOne({
    where: { verificationTokenHash: tokenHash }
  });

  if (
    !account ||
    !account.isActive ||
    !account.verificationExpiresAt ||
    new Date(account.verificationExpiresAt) <= now ||
    !timingSafeEqualHex(tokenHash, account.verificationTokenHash)
  ) {
    throw new BadRequestError('Activation link has expired or has already been used', null, 'INVALID_ACTIVATION_TOKEN');
  }

  return {
    valid: true,
    email: account.email,
    fullName: account.fullName,
    expiresAt: account.verificationExpiresAt
  };
}

/**
 * Completes candidate account activation and password setup.
 * Single-use token is immediately invalidated.
 * Password is scrypt-hashed and persisted.
 * Unlinked Candidate records for this email are bound to account.id.
 */
async function activateCandidateAccount({
  token,
  password,
  confirmPassword,
  requestId = null,
  ipAddress = null,
  userAgent = null
}) {
  ensureDatabaseReady();
  const { CandidateAccount, Candidate } = getModels();
  const rawToken = String(token || '').trim();
  if (!rawToken || rawToken.length < 16) {
    throw new BadRequestError('Invalid or expired activation token', null, 'INVALID_ACTIVATION_TOKEN');
  }
  if (confirmPassword !== undefined && confirmPassword !== password) {
    throw new BadRequestError('Password confirmation does not match password', null, 'PASSWORD_MISMATCH');
  }

  const tokenHash = hashCandidateToken(rawToken, 'CANDIDATE_ACTIVATION');
  const now = new Date();

  const account = await CandidateAccount.findOne({
    where: { verificationTokenHash: tokenHash }
  });

  if (
    !account ||
    !account.isActive ||
    !account.verificationExpiresAt ||
    new Date(account.verificationExpiresAt) <= now ||
    !timingSafeEqualHex(tokenHash, account.verificationTokenHash)
  ) {
    await writeCandidateAudit({
      accountId: account?.id || null,
      action: 'CANDIDATE_ACTIVATION_FAILED',
      context: { requestId, ipAddress, userAgent },
      afterState: { reason: !account ? 'TOKEN_NOT_FOUND' : 'TOKEN_EXPIRED_OR_INVALID' }
    });
    throw new BadRequestError('Invalid or expired activation token', null, 'INVALID_ACTIVATION_TOKEN');
  }

  const newHash = hashPassword(password);

  // Single-use token invalidation: atomically clear verificationTokenHash
  const [affectedRows] = await CandidateAccount.update(
    {
      passwordHash: newHash,
      emailVerified: true,
      emailVerifiedAt: now,
      passwordChangedAt: now,
      verificationTokenHash: null,
      verificationExpiresAt: null,
      verificationAttempts: 0,
      verificationLockedUntil: null,
      resetTokenHash: null,
      resetExpiresAt: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
      tokenVersion: Number(account.tokenVersion || 1) + 1,
      lastSecurityEventAt: now
    },
    {
      where: {
        id: account.id,
        isActive: true,
        verificationTokenHash: tokenHash,
        verificationExpiresAt: { [Op.gt]: now }
      }
    }
  );

  if (affectedRows !== 1) {
    throw new BadRequestError('Invalid or expired activation token', null, 'INVALID_ACTIVATION_TOKEN');
  }

  // Link any unlinked Candidate records in organisations for this email
  try {
    await Candidate.update(
      {
        authUserId: account.id,
        claimedAt: now
      },
      {
        where: {
          [Op.or]: [
            { email: account.email },
            Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('email')), account.email.toLowerCase())
          ],
          authUserId: null
        }
      }
    );
  } catch (linkErr) {
    logger.warn({ err: linkErr.message, accountId: account.id }, 'Could not back-fill unlinked candidate records');
  }

  await writeCandidateAudit({
    accountId: account.id,
    action: 'CANDIDATE_ACCOUNT_ACTIVATED',
    context: { requestId, ipAddress, userAgent },
    afterState: { emailVerified: true, passwordSetup: true }
  });

  return {
    activated: true,
    email: account.email,
    fullName: account.fullName,
    message: 'Candidate account activated successfully. You can now sign in with your email and password.',
    loginUrl: '/login'
  };
}

/**
 * Resends activation instructions for an inactive candidate account without exposing account existence.
 */
async function resendCandidateActivation({ email, requestId = null, ipAddress = null, userAgent = null }) {
  ensureDatabaseReady();
  const { CandidateAccount } = getModels();
  const normalizedEmail = normalizeEmail(email);
  const now = new Date();
  const cooldownMs = env.candidateAuth.resendCooldownSeconds * 1000;

  const lastMemResend = resendCooldownByEmail.get(normalizedEmail);
  if (lastMemResend && now.getTime() - lastMemResend < cooldownMs) {
    return {
      accepted: true,
      message: 'If an unactivated candidate account exists for this email, activation instructions have been sent.'
    };
  }

  const account = await findCandidateAccountByEmail(normalizedEmail);
  if (account && account.isActive && !account.emailVerified) {
    const rawActivationToken = generateResetToken(32);
    const tokenHash = hashCandidateToken(rawActivationToken, 'CANDIDATE_ACTIVATION');
    const expiresInHours = 48;
    const expiresAt = addMinutes(now, expiresInHours * 60);
    const activationUrl = `${env.clientAppUrl}/activate-candidate?token=${encodeURIComponent(rawActivationToken)}`;
    const loginUrl = `${env.clientAppUrl}/login`;

    await CandidateAccount.update(
      {
        verificationTokenHash: tokenHash,
        verificationExpiresAt: expiresAt,
        verificationAttempts: 0,
        verificationSentAt: now,
        lastSecurityEventAt: now
      },
      { where: { id: account.id, isActive: true, emailVerified: false } }
    );

    try {
      await notificationAdapter.dispatchNotification({
        eventType: 'CANDIDATE_ACCOUNT_ACTIVATION',
        organisationId: null,
        recipientEmail: account.email,
        recipientName: account.fullName,
        requestId,
        payload: {
          username: account.email,
          email: account.email,
          fullName: account.fullName,
          activationToken: rawActivationToken,
          activationUrl,
          loginUrl,
          expiresInHours
        }
      });
    } catch (notifErr) {
      logger.warn({ err: notifErr.message, email: account.email }, 'Failed to resend candidate activation email');
    }

    await writeCandidateAudit({
      accountId: account.id,
      action: 'CANDIDATE_ACTIVATION_RESENT',
      context: { requestId, ipAddress, userAgent },
      afterState: { verificationExpiresAt: expiresAt.toISOString() }
    });
  }

  pruneAndSetCooldown(resendCooldownByEmail, normalizedEmail, now.getTime(), cooldownMs);

  return {
    accepted: true,
    message: 'If an unactivated candidate account exists for this email, activation instructions have been sent.'
  };
}

function clearCandidateCooldownsForTest() {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('clearCandidateCooldownsForTest is restricted to NODE_ENV=test');
  }
  resendCooldownByEmail.clear();
  resetCooldownByEmail.clear();
}

module.exports = {
  findCandidateAccountByEmail,
  registerCandidate,
  verifyCandidateEmail,
  resendCandidateVerification,
  authenticateCandidate,
  requestPasswordReset,
  resetCandidatePassword,
  changeCandidatePassword,
  deactivateCandidateAccount,
  provisionCandidateAccountForApplication,
  inspectCandidateActivationToken,
  activateCandidateAccount,
  resendCandidateActivation,
  clearCandidateCooldownsForTest
};

