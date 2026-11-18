const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const nodeEnv = process.env.NODE_ENV || 'development';
const integrationMode = (process.env.INTEGRATION_MODE || 'standalone').toLowerCase();

const ALLOWED_STORAGE_DRIVERS = ['LOCAL_SECURE', 'CLOUDINARY'];
const ALLOWED_SCANNER_MODES = ['DISABLED', 'CLAMAV'];
const ALLOWED_EMAIL_PROVIDERS = ['DISABLED', 'RESEND', 'BREVO', 'SMTP'];

function buildEmailConfig(rawEnv = process.env) {
  const provider = (rawEnv.EMAIL_PROVIDER || 'DISABLED').trim().toUpperCase();

  return {
    provider,
    fromAddress: (rawEnv.EMAIL_FROM || 'no-reply@nexnuv.local').trim(),
    fromName: (rawEnv.EMAIL_FROM_NAME || 'NEXNUV Recruitment').trim(),
    timeoutMs: Number(rawEnv.EMAIL_TIMEOUT_MS || 8000),
    allowUnconfiguredInProduction: rawEnv.ALLOW_UNCONFIGURED_EMAIL_IN_PRODUCTION === 'true',
    resend: {
      apiKey: (rawEnv.RESEND_API_KEY || '').trim(),
      baseUrl: (rawEnv.RESEND_BASE_URL || 'https://api.resend.com').trim().replace(/\/+$/, '')
    },
    brevo: {
      apiKey: (rawEnv.BREVO_API_KEY || '').trim(),
      baseUrl: (rawEnv.BREVO_BASE_URL || 'https://api.brevo.com').trim().replace(/\/+$/, '')
    },
    smtp: {
      host: (rawEnv.SMTP_HOST || '').trim(),
      port: Number(rawEnv.SMTP_PORT || 587),
      secure: rawEnv.SMTP_SECURE === 'true',
      requireTls: rawEnv.SMTP_REQUIRE_TLS !== 'false',
      user: (rawEnv.SMTP_USER || '').trim(),
      pass: (rawEnv.SMTP_PASS || '').trim()
    }
  };
}

function validateEmailConfiguration(emailCfg, targetEnv = 'development') {
  if (!ALLOWED_EMAIL_PROVIDERS.includes(emailCfg.provider)) {
    throw new Error(
      `FATAL: Unsupported EMAIL_PROVIDER "${emailCfg.provider}". Expected one of: ${ALLOWED_EMAIL_PROVIDERS.join(', ')}.`
    );
  }

  if (!Number.isFinite(emailCfg.timeoutMs) || emailCfg.timeoutMs <= 0 || emailCfg.timeoutMs > 60000) {
    throw new Error('FATAL: EMAIL_TIMEOUT_MS must be between 1 and 60000 ms.');
  }

  if (emailCfg.provider === 'RESEND') {
    if (!emailCfg.resend?.apiKey) {
      throw new Error('FATAL: EMAIL_PROVIDER=RESEND requires RESEND_API_KEY.');
    }
    if (!emailCfg.fromAddress || !emailCfg.fromAddress.includes('@')) {
      throw new Error('FATAL: EMAIL_PROVIDER=RESEND requires a valid EMAIL_FROM address.');
    }
    let parsed;
    try {
      parsed = new URL(emailCfg.resend.baseUrl);
    } catch (_err) {
      throw new Error('FATAL: Invalid RESEND_BASE_URL.');
    }
    if (targetEnv === 'production' && parsed.protocol !== 'https:') {
      throw new Error('FATAL: RESEND_BASE_URL must use HTTPS in production.');
    }
  }

  if (emailCfg.provider === 'BREVO') {
    if (!emailCfg.brevo?.apiKey) {
      throw new Error('FATAL: EMAIL_PROVIDER=BREVO requires BREVO_API_KEY.');
    }
    if (!emailCfg.fromAddress || !emailCfg.fromAddress.includes('@')) {
      throw new Error('FATAL: EMAIL_PROVIDER=BREVO requires a valid EMAIL_FROM address.');
    }
    let parsed;
    try {
      parsed = new URL(emailCfg.brevo.baseUrl);
    } catch (_err) {
      throw new Error('FATAL: Invalid BREVO_BASE_URL.');
    }
    if (targetEnv === 'production' && parsed.protocol !== 'https:') {
      throw new Error('FATAL: BREVO_BASE_URL must use HTTPS in production.');
    }
  }

  if (emailCfg.provider === 'SMTP') {
    const missing = [];
    if (!emailCfg.smtp?.host) missing.push('SMTP_HOST');
    if (!emailCfg.smtp?.user) missing.push('SMTP_USER');
    if (!emailCfg.smtp?.pass) missing.push('SMTP_PASS');
    if (missing.length > 0) {
      throw new Error(`FATAL: EMAIL_PROVIDER=SMTP requires configuration: ${missing.join(', ')}.`);
    }
    if (!Number.isInteger(emailCfg.smtp.port) || emailCfg.smtp.port < 1 || emailCfg.smtp.port > 65535) {
      throw new Error('FATAL: SMTP_PORT must be an integer between 1 and 65535.');
    }
    if (!emailCfg.fromAddress || !emailCfg.fromAddress.includes('@')) {
      throw new Error('FATAL: EMAIL_PROVIDER=SMTP requires a valid EMAIL_FROM address.');
    }
    if (targetEnv === 'production' && !emailCfg.smtp.secure && !emailCfg.smtp.requireTls) {
      throw new Error('FATAL: SMTP in production requires TLS (SMTP_SECURE=true or SMTP_REQUIRE_TLS=true).');
    }
  }

  if (targetEnv === 'production' && emailCfg.provider === 'DISABLED' && !emailCfg.allowUnconfiguredInProduction) {
    throw new Error(
      'FATAL: EMAIL_PROVIDER must be configured (RESEND, BREVO, or SMTP) in production unless ALLOW_UNCONFIGURED_EMAIL_IN_PRODUCTION=true.'
    );
  }
}

function buildCandidateAuthConfig(rawEnv = process.env) {
  return {
    tokenHashSecret: (
      rawEnv.CANDIDATE_TOKEN_HASH_SECRET || 'dev-only-candidate-token-hash-secret-2026'
    ).trim(),
    otpTtlMinutes: Number(rawEnv.CANDIDATE_OTP_TTL_MINUTES || 10),
    maxVerificationAttempts: Number(rawEnv.CANDIDATE_OTP_MAX_ATTEMPTS || 5),
    verificationLockMinutes: Number(rawEnv.CANDIDATE_OTP_LOCK_MINUTES || 15),
    resendCooldownSeconds: Number(rawEnv.CANDIDATE_VERIFICATION_RESEND_COOLDOWN_SECONDS || 60),
    resetTtlMinutes: Number(rawEnv.CANDIDATE_RESET_TTL_MINUTES || 15),
    resetMaxAttempts: Number(rawEnv.CANDIDATE_RESET_MAX_ATTEMPTS || 5),
    resetCooldownSeconds: Number(rawEnv.CANDIDATE_RESET_COOLDOWN_SECONDS || 60),
    maxFailedLoginAttempts: Number(rawEnv.CANDIDATE_LOGIN_MAX_ATTEMPTS || 5),
    loginLockMinutes: Number(rawEnv.CANDIDATE_LOGIN_LOCK_MINUTES || 15)
  };
}

function buildStorageConfig(rawEnv = process.env) {
  const driver = (rawEnv.STORAGE_DRIVER || 'LOCAL_SECURE').trim().toUpperCase();
  const localRoot = path.resolve(process.cwd(), rawEnv.STORAGE_LOCAL_ROOT || './storage');
  const quarantineRoot = path.resolve(
    process.cwd(),
    rawEnv.STORAGE_QUARANTINE_ROOT || path.join(localRoot, '_quarantine')
  );
  const scannerMode = (rawEnv.MALWARE_SCANNER_MODE || 'DISABLED').trim().toUpperCase();

  return {
    driver,
    localRoot,
    quarantineRoot,
    signedUrlSecret: rawEnv.STORAGE_SIGNED_URL_SECRET || 'dev-only-storage-signing-secret-2026',
    signedUrlTtlSeconds: Number(rawEnv.STORAGE_SIGNED_URL_TTL_SECONDS || 900),
    maxUploadSizeMb: Number(rawEnv.MAX_UPLOAD_SIZE_MB || 10),
    allowLocalInProduction: rawEnv.ALLOW_LOCAL_STORAGE_IN_PRODUCTION === 'true',
    cloudinary: {
      cloudName: (rawEnv.CLOUDINARY_CLOUD_NAME || '').trim(),
      apiKey: (rawEnv.CLOUDINARY_API_KEY || '').trim(),
      apiSecret: (rawEnv.CLOUDINARY_API_SECRET || '').trim(),
      folderPrefix: (rawEnv.CLOUDINARY_FOLDER_PREFIX || 'nexnuv-recruitment').replace(/^\/+|\/+$/g, ''),
      uploadPrefix: (rawEnv.CLOUDINARY_UPLOAD_PREFIX || '').trim(),
      uploadTimeoutMs: Number(rawEnv.CLOUDINARY_TIMEOUT_MS || 15000),
      downloadUrlTtlSeconds: Number(rawEnv.CLOUDINARY_DOWNLOAD_TTL_SECONDS || 120)
    },
    malware: {
      mode: scannerMode,
      required: rawEnv.MALWARE_SCAN_REQUIRED === 'true',
      quarantineOnThreat: rawEnv.QUARANTINE_INFECTED_FILES !== 'false',
      clamavHost: (rawEnv.CLAMAV_HOST || '127.0.0.1').trim(),
      clamavPort: Number(rawEnv.CLAMAV_PORT || 3310),
      timeoutMs: Number(rawEnv.MALWARE_SCAN_TIMEOUT_MS || 5000),
      maxStreamBytes: Number(rawEnv.MALWARE_SCAN_MAX_BYTES || 15 * 1024 * 1024)
    }
  };
}

function validateStorageConfiguration(storageCfg, targetEnv = 'development') {
  if (!ALLOWED_STORAGE_DRIVERS.includes(storageCfg.driver)) {
    throw new Error(
      `FATAL: Unsupported STORAGE_DRIVER "${storageCfg.driver}". Expected one of: ${ALLOWED_STORAGE_DRIVERS.join(', ')}.`
    );
  }

  if (!ALLOWED_SCANNER_MODES.includes(storageCfg.malware.mode)) {
    throw new Error(
      `FATAL: Unsupported MALWARE_SCANNER_MODE "${storageCfg.malware.mode}". Expected one of: ${ALLOWED_SCANNER_MODES.join(', ')}.`
    );
  }

  if (!Number.isFinite(storageCfg.maxUploadSizeMb) || storageCfg.maxUploadSizeMb <= 0 || storageCfg.maxUploadSizeMb > 50) {
    throw new Error('FATAL: MAX_UPLOAD_SIZE_MB must be a positive number <= 50.');
  }

  if (!Number.isFinite(storageCfg.signedUrlTtlSeconds) || storageCfg.signedUrlTtlSeconds <= 0 || storageCfg.signedUrlTtlSeconds > 86400) {
    throw new Error('FATAL: STORAGE_SIGNED_URL_TTL_SECONDS must be between 1 and 86400 seconds.');
  }

  if (storageCfg.driver === 'CLOUDINARY') {
    const missing = [];
    if (!storageCfg.cloudinary?.cloudName) missing.push('CLOUDINARY_CLOUD_NAME');
    if (!storageCfg.cloudinary?.apiKey) missing.push('CLOUDINARY_API_KEY');
    if (!storageCfg.cloudinary?.apiSecret) missing.push('CLOUDINARY_API_SECRET');
    if (missing.length > 0) {
      throw new Error(
        `FATAL: STORAGE_DRIVER=CLOUDINARY requires configuration: ${missing.join(', ')}.`
      );
    }
    if (
      !Number.isFinite(storageCfg.cloudinary.downloadUrlTtlSeconds) ||
      storageCfg.cloudinary.downloadUrlTtlSeconds <= 0 ||
      storageCfg.cloudinary.downloadUrlTtlSeconds > 3600
    ) {
      throw new Error('FATAL: CLOUDINARY_DOWNLOAD_TTL_SECONDS must be between 1 and 3600 seconds.');
    }
    if (!Number.isFinite(storageCfg.cloudinary.uploadTimeoutMs) || storageCfg.cloudinary.uploadTimeoutMs <= 0) {
      throw new Error('FATAL: CLOUDINARY_TIMEOUT_MS must be a positive number.');
    }
    if (storageCfg.cloudinary.uploadPrefix) {
      let parsed;
      try {
        parsed = new URL(storageCfg.cloudinary.uploadPrefix);
      } catch (_err) {
        throw new Error('FATAL: Invalid CLOUDINARY_UPLOAD_PREFIX URL.');
      }
      if (targetEnv === 'production' && parsed.protocol !== 'https:') {
        throw new Error('FATAL: CLOUDINARY_UPLOAD_PREFIX must use HTTPS in production.');
      }
    }
  }

  if (targetEnv === 'production') {
    if (storageCfg.driver === 'LOCAL_SECURE' && !storageCfg.allowLocalInProduction) {
      throw new Error(
        'FATAL: STORAGE_DRIVER=LOCAL_SECURE requires ALLOW_LOCAL_STORAGE_IN_PRODUCTION=true (persisted single-volume acknowledgment) or STORAGE_DRIVER=CLOUDINARY in production.'
      );
    }
    if (storageCfg.malware.required && storageCfg.malware.mode === 'DISABLED') {
      throw new Error('FATAL: MALWARE_SCAN_REQUIRED=true cannot start when MALWARE_SCANNER_MODE=DISABLED in production.');
    }
  }
}

const storageConfig = buildStorageConfig(process.env);
validateStorageConfiguration(storageConfig, nodeEnv);

function buildTreasuryConfig(rawEnv = process.env) {
  const bankName = (rawEnv.TREASURY_BANK_NAME || '').trim();
  const accountNumber = (rawEnv.TREASURY_ACCOUNT_NUMBER || '').trim().replace(/[\s-]/g, '');
  const ifscCode = (rawEnv.TREASURY_IFSC_CODE || '').trim().toUpperCase();
  const upiId = (rawEnv.TREASURY_UPI_ID || '').trim().toLowerCase();
  const beneficiaryName = (rawEnv.TREASURY_BENEFICIARY_NAME || '').trim();

  return {
    bankName: bankName || null,
    accountNumber: accountNumber || null,
    ifscCode: ifscCode || null,
    upiId: upiId || null,
    beneficiaryName: beneficiaryName || null
  };
}

function isTreasuryConfigured(treasuryCfg) {
  if (!treasuryCfg) return false;
  return Boolean(
    treasuryCfg.bankName &&
    treasuryCfg.accountNumber &&
    treasuryCfg.accountNumber.length >= 4 &&
    treasuryCfg.ifscCode &&
    treasuryCfg.beneficiaryName
  );
}

const env = {
  nodeEnv,
  port: Number(process.env.PORT || 4007),
  serviceName: process.env.SERVICE_NAME || 'nexnuv-recruitment-service',
  apiPrefix: process.env.API_PREFIX || '/api/v1',
  clientAppUrl: process.env.CLIENT_APP_URL || 'http://localhost:5173',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:3000,http://localhost:4000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  databaseUrl:
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/recruitment_service',
  pgPoolMax: Number(process.env.PG_POOL_MAX || 20),
  pgIdleTimeoutMs: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),
  integrationMode,
  jwt: {
    issuer: process.env.JWT_ISSUER || 'nexnuv-auth-service',
    audience: process.env.JWT_AUDIENCE || 'nexnuv-recruitment',
    publicKey: process.env.JWT_PUBLIC_KEY || '',
    secret: process.env.JWT_SECRET || 'dev-only-replace-in-production-nexnuv-jwt-secret-key-2026',
    candidateSecret:
      process.env.CANDIDATE_JWT_SECRET ||
      'dev-only-replace-in-production-nexnuv-candidate-jwt-key-2026',
    expiresIn: process.env.JWT_EXPIRES_IN || '8h'
  },
  services: {
    gatewayUrl: process.env.API_GATEWAY_URL || 'http://localhost:4000',
    authUrl: process.env.AUTH_SERVICE_URL || 'http://localhost:4001',
    platformUrl:
      process.env.PLATFORM_SERVICE_URL ||
      process.env.PLATFORM_ADMIN_SERVICE_URL ||
      'http://localhost:4002',
    organisationUrl:
      process.env.ORGANISATION_SERVICE_URL ||
      process.env.ORGANIZATION_SERVICE_URL ||
      'http://localhost:4003',
    employeeUrl: process.env.EMPLOYEE_SERVICE_URL || 'http://localhost:4004',
    notificationUrl: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:4006',
    hrmsUrl: process.env.HRMS_SERVICE_URL || '',
    internalToken:
      process.env.INTERNAL_SERVICE_TOKEN ||
      process.env.GATEWAY_SHARED_SECRET ||
      'nexnuv-internal-service-token-dev',
    requestTimeoutMs: Number(process.env.EXTERNAL_REQUEST_TIMEOUT_MS || 5000),
    getRetryAttempts: Number(process.env.EXTERNAL_GET_RETRY_ATTEMPTS || 2),
    platformRequireRecruitmentFeature: process.env.PLATFORM_REQUIRE_RECRUITMENT_FEATURE === 'true'
  },
  storage: storageConfig,
  treasury: buildTreasuryConfig(process.env),
  rateLimit: {
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 900000),
    maxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS || 300)
  },
  logLevel: process.env.LOG_LEVEL || (nodeEnv === 'test' ? 'silent' : 'info')
};

function buildWebhookConfig(rawEnv = process.env) {
  return {
    resendSecret: (rawEnv.RESEND_WEBHOOK_SECRET || rawEnv.NOTIFICATION_WEBHOOK_SECRET || '').trim(),
    brevoSecret: (rawEnv.BREVO_WEBHOOK_SECRET || rawEnv.NOTIFICATION_WEBHOOK_SECRET || '').trim(),
    genericSecret: (rawEnv.NOTIFICATION_WEBHOOK_SECRET || '').trim(),
    toleranceSeconds: Number(rawEnv.WEBHOOK_TOLERANCE_SECONDS || 300)
  };
}

function validateWebhookConfiguration(webhookCfg, emailCfg, targetEnv = 'development') {
  if (!Number.isFinite(webhookCfg.toleranceSeconds) || webhookCfg.toleranceSeconds < 10 || webhookCfg.toleranceSeconds > 3600) {
    throw new Error('FATAL: WEBHOOK_TOLERANCE_SECONDS must be an integer between 10 and 3600 seconds.');
  }

  if (targetEnv === 'production') {
    if (emailCfg.provider === 'RESEND') {
      if (!webhookCfg.resendSecret || webhookCfg.resendSecret.startsWith('dev-only-')) {
        throw new Error('FATAL: RESEND_WEBHOOK_SECRET or NOTIFICATION_WEBHOOK_SECRET must be explicitly configured in production for EMAIL_PROVIDER=RESEND.');
      }
    } else if (emailCfg.provider === 'BREVO') {
      if (!webhookCfg.brevoSecret || webhookCfg.brevoSecret.startsWith('dev-only-')) {
        throw new Error('FATAL: BREVO_WEBHOOK_SECRET or NOTIFICATION_WEBHOOK_SECRET must be explicitly configured in production for EMAIL_PROVIDER=BREVO.');
      }
    } else if (emailCfg.provider === 'SMTP') {
      if (!webhookCfg.genericSecret || webhookCfg.genericSecret.startsWith('dev-only-')) {
        throw new Error('FATAL: NOTIFICATION_WEBHOOK_SECRET must be explicitly configured in production for EMAIL_PROVIDER=SMTP.');
      }
    }
  }
}

if (!['standalone', 'live'].includes(env.integrationMode)) {
  throw new Error(`FATAL: Unsupported INTEGRATION_MODE "${env.integrationMode}". Expected "standalone" or "live".`);
}

const emailConfig = buildEmailConfig();
const candidateAuthConfig = buildCandidateAuthConfig();
const webhookConfig = buildWebhookConfig();
validateEmailConfiguration(emailConfig, env.nodeEnv);
validateWebhookConfiguration(webhookConfig, emailConfig, env.nodeEnv);

if (env.nodeEnv === 'production') {
  if (env.integrationMode !== 'live') {
    throw new Error('FATAL: INTEGRATION_MODE must be "live" in production; standalone mock adapters are prohibited.');
  }
  if (!process.env.INTERNAL_SERVICE_TOKEN) {
    throw new Error('FATAL: INTERNAL_SERVICE_TOKEN must be explicitly configured in production');
  }
  if (!process.env.CANDIDATE_JWT_SECRET || env.jwt.candidateSecret.startsWith('dev-only-')) {
    throw new Error('FATAL: CANDIDATE_JWT_SECRET must be explicitly configured in production');
  }
  if (env.jwt.candidateSecret === env.jwt.secret) {
    throw new Error('FATAL: CANDIDATE_JWT_SECRET must differ from JWT_SECRET in production');
  }
  if (env.jwt.candidateSecret === env.services.internalToken) {
    throw new Error('FATAL: CANDIDATE_JWT_SECRET must differ from INTERNAL_SERVICE_TOKEN in production');
  }
  if (!process.env.CANDIDATE_TOKEN_HASH_SECRET || candidateAuthConfig.tokenHashSecret.startsWith('dev-only-')) {
    throw new Error('FATAL: CANDIDATE_TOKEN_HASH_SECRET must be explicitly configured in production');
  }
  if (
    candidateAuthConfig.tokenHashSecret === env.jwt.secret ||
    candidateAuthConfig.tokenHashSecret === env.jwt.candidateSecret ||
    candidateAuthConfig.tokenHashSecret === env.services.internalToken
  ) {
    throw new Error('FATAL: CANDIDATE_TOKEN_HASH_SECRET must differ from JWT and internal service secrets in production');
  }
  if (!process.env.STORAGE_SIGNED_URL_SECRET || env.storage.signedUrlSecret.startsWith('dev-only-')) {
    throw new Error('FATAL: STORAGE_SIGNED_URL_SECRET must be explicitly configured in production');
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('FATAL: DATABASE_URL must be explicitly configured in production');
  }
  if (emailConfig.provider === 'DISABLED') {
    throw new Error('FATAL: EMAIL_PROVIDER must be configured (RESEND, BREVO, or SMTP) in production; cannot be DISABLED.');
  }
  let parsedClientUrl;
  try {
    parsedClientUrl = new URL(env.clientAppUrl);
  } catch {
    throw new Error('FATAL: CLIENT_APP_URL must be a valid URL in production.');
  }
  if (parsedClientUrl.protocol !== 'https:') {
    throw new Error('FATAL: CLIENT_APP_URL must use HTTPS protocol in production.');
  }
  if (['localhost', '127.0.0.1'].includes(parsedClientUrl.hostname)) {
    throw new Error('FATAL: CLIENT_APP_URL cannot be localhost or 127.0.0.1 in production.');
  }

  const serviceUrlConfigs = [
    { name: 'API_GATEWAY_URL', url: env.services.gatewayUrl },
    { name: 'AUTH_SERVICE_URL', url: env.services.authUrl },
    { name: 'PLATFORM_SERVICE_URL', url: env.services.platformUrl },
    { name: 'ORGANISATION_SERVICE_URL', url: env.services.organisationUrl },
    { name: 'EMPLOYEE_SERVICE_URL', url: env.services.employeeUrl },
    { name: 'NOTIFICATION_SERVICE_URL', url: env.services.notificationUrl }
  ];
  for (const s of serviceUrlConfigs) {
    if (s.url) {
      try {
        const u = new URL(s.url);
        if (['localhost', '127.0.0.1'].includes(u.hostname)) {
          throw new Error(`FATAL: ${s.name} cannot be localhost or 127.0.0.1 in production.`);
        }
      } catch (err) {
        if (err.message.startsWith('FATAL:')) throw err;
        throw new Error(`FATAL: ${s.name} must be a valid URL in production.`);
      }
    }
  }
}

env.email = emailConfig;
env.candidateAuth = candidateAuthConfig;
env.webhook = webhookConfig;
env.buildWebhookConfig = buildWebhookConfig;
env.validateWebhookConfiguration = validateWebhookConfiguration;
env.ALLOWED_EMAIL_PROVIDERS = ALLOWED_EMAIL_PROVIDERS;
env.buildEmailConfig = buildEmailConfig;
env.validateEmailConfiguration = validateEmailConfiguration;
env.buildCandidateAuthConfig = buildCandidateAuthConfig;
env.ALLOWED_STORAGE_DRIVERS = ALLOWED_STORAGE_DRIVERS;
env.ALLOWED_SCANNER_MODES = ALLOWED_SCANNER_MODES;
env.buildStorageConfig = buildStorageConfig;
env.validateStorageConfiguration = validateStorageConfiguration;
env.buildTreasuryConfig = buildTreasuryConfig;
env.isTreasuryConfigured = isTreasuryConfigured;

module.exports = env;
