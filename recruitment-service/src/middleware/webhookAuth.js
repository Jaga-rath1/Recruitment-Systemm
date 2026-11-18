'use strict';

const crypto = require('crypto');
const env = require('../config/env');
const logger = require('../config/logger');

// In-memory replay & deduplication cache: eventId -> processedTimestampMs
const processedEventCache = new Map();
const CACHE_CLEANUP_INTERVAL_MS = 60000;

setInterval(() => {
  const cutoff = Date.now() - (env.webhook?.toleranceSeconds || 300) * 2000;
  for (const [id, ts] of processedEventCache.entries()) {
    if (ts < cutoff) {
      processedEventCache.delete(id);
    }
  }
}, CACHE_CLEANUP_INTERVAL_MS).unref();

function safeTimingSafeEqual(bufA, bufB) {
  if (!Buffer.isBuffer(bufA) || !Buffer.isBuffer(bufB)) return false;
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Extracts and prepares raw body string for cryptographic HMAC calculation.
 */
function getRawBodyString(req) {
  if (req.rawBody && Buffer.isBuffer(req.rawBody)) {
    return req.rawBody.toString('utf8');
  }
  if (typeof req.body === 'string') {
    return req.body;
  }
  if (req.body && typeof req.body === 'object') {
    return JSON.stringify(req.body);
  }
  return '';
}

/**
 * Verifies Svix webhook signatures (official for Resend).
 */
function verifySvixSignature({ svixId, svixTimestamp, svixSignature, rawBody, secret, toleranceSeconds }) {
  if (!svixId || !svixTimestamp || !svixSignature) {
    return { valid: false, reason: 'MISSING_SVIX_HEADERS' };
  }

  const ts = parseInt(svixTimestamp, 10);
  if (isNaN(ts)) {
    return { valid: false, reason: 'INVALID_TIMESTAMP_FORMAT' };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (ts > nowSeconds + 60) {
    return { valid: false, reason: 'TIMESTAMP_IN_FUTURE' };
  }
  if (nowSeconds - ts > toleranceSeconds) {
    return { valid: false, reason: 'TIMESTAMP_EXPIRED' };
  }

  let secretBytes;
  try {
    const rawSecret = secret.startsWith('whsec_') ? secret.slice(6) : secret;
    secretBytes = Buffer.from(rawSecret, 'base64');
    if (secretBytes.length === 0) {
      secretBytes = Buffer.from(secret, 'utf8');
    }
  } catch (_e) {
    secretBytes = Buffer.from(secret, 'utf8');
  }

  const payloadToSign = `${svixId}.${svixTimestamp}.${rawBody}`;
  const computedHash = crypto.createHmac('sha256', secretBytes).update(payloadToSign).digest('base64');
  const expectedSig = `v1,${computedHash}`;

  const candidates = svixSignature.split(' ').map((s) => s.trim()).filter(Boolean);
  const expectedBuf = Buffer.from(expectedSig, 'utf8');

  for (const candidate of candidates) {
    const candidateBuf = Buffer.from(candidate, 'utf8');
    if (safeTimingSafeEqual(candidateBuf, expectedBuf)) {
      return { valid: true };
    }
  }

  return { valid: false, reason: 'SIGNATURE_MISMATCH' };
}

/**
 * Verifies standard HMAC-SHA256 signature (for generic / SMTP / test webhooks).
 */
function verifyStandardHmacSignature({ signatureHeader, timestampHeader, rawBody, secret, toleranceSeconds }) {
  if (!signatureHeader) {
    return { valid: false, reason: 'MISSING_SIGNATURE_HEADER' };
  }

  let ts = null;
  if (timestampHeader) {
    ts = parseInt(timestampHeader, 10);
    if (isNaN(ts)) return { valid: false, reason: 'INVALID_TIMESTAMP_FORMAT' };
    const now = Math.floor(Date.now() / 1000);
    if (ts > now + 60) return { valid: false, reason: 'TIMESTAMP_IN_FUTURE' };
    if (now - ts > toleranceSeconds) return { valid: false, reason: 'TIMESTAMP_EXPIRED' };
  }

  const payloadToSign = ts ? `${ts}.${rawBody}` : rawBody;
  const computedHex = crypto.createHmac('sha256', secret).update(payloadToSign).digest('hex');
  const computedBase64 = crypto.createHmac('sha256', secret).update(payloadToSign).digest('base64');

  const cleanHeader = signatureHeader.replace(/^sha256=|^v1=/, '').trim();
  const headerBuf = Buffer.from(cleanHeader, 'utf8');

  if (
    safeTimingSafeEqual(headerBuf, Buffer.from(computedHex, 'utf8')) ||
    safeTimingSafeEqual(headerBuf, Buffer.from(computedBase64, 'utf8'))
  ) {
    return { valid: true };
  }

  return { valid: false, reason: 'SIGNATURE_MISMATCH' };
}

/**
 * Express middleware to authenticate delivery webhooks cryptographically.
 */
function verifyNotificationWebhookSignature(req, res, next) {
  const webhookConfig = env.webhook || {};
  const activeSecret =
    webhookConfig.resendSecret ||
    webhookConfig.brevoSecret ||
    webhookConfig.genericSecret ||
    process.env.RESEND_WEBHOOK_SECRET ||
    process.env.NOTIFICATION_WEBHOOK_SECRET ||
    '';

  if (!activeSecret) {
    logger.warn({ path: req.originalUrl }, '[Webhook Security] Webhook rejected: no webhook signing secret configured');
    return res.status(503).json({
      success: false,
      error: {
        code: 'WEBHOOK_CONFIG_MISSING',
        message: 'Delivery webhook signature verification is unconfigured on this service.'
      }
    });
  }

  const tolerance = webhookConfig.toleranceSeconds || 300;
  const rawBody = getRawBodyString(req);

  // 1. Check for Svix (Resend official) headers
  const svixId = req.headers['svix-id'];
  const svixTimestamp = req.headers['svix-timestamp'];
  const svixSignature = req.headers['svix-signature'];

  // 2. Check for Standard HMAC headers
  const stdSig = req.headers['x-webhook-signature'] || req.headers['x-signature'] || req.headers['x-hub-signature-256'];
  const stdTimestamp = req.headers['x-webhook-timestamp'];

  if (!svixSignature && !stdSig) {
    logger.warn({ path: req.originalUrl, ip: req.ip }, '[Webhook Security] Missing webhook signature headers');
    return res.status(401).json({
      success: false,
      error: {
        code: 'WEBHOOK_SIGNATURE_MISSING',
        message: 'Missing cryptographic webhook signature headers.'
      }
    });
  }

  let verificationResult;
  if (svixSignature) {
    const svixSecret =
      webhookConfig.resendSecret ||
      process.env.RESEND_WEBHOOK_SECRET ||
      activeSecret;

    verificationResult = verifySvixSignature({
      svixId,
      svixTimestamp,
      svixSignature,
      rawBody,
      secret: svixSecret,
      toleranceSeconds: tolerance
    });
  } else {
    const hmacSecret =
      webhookConfig.genericSecret ||
      process.env.NOTIFICATION_WEBHOOK_SECRET ||
      webhookConfig.brevoSecret ||
      process.env.BREVO_WEBHOOK_SECRET ||
      activeSecret;

    verificationResult = verifyStandardHmacSignature({
      signatureHeader: stdSig,
      timestampHeader: stdTimestamp,
      rawBody,
      secret: hmacSecret,
      toleranceSeconds: tolerance
    });
  }

  if (!verificationResult.valid) {
    const isExpired = verificationResult.reason === 'TIMESTAMP_EXPIRED' || verificationResult.reason === 'TIMESTAMP_IN_FUTURE';
    logger.warn(
      { path: req.originalUrl, reason: verificationResult.reason },
      `[Webhook Security] Webhook signature verification rejected (${verificationResult.reason})`
    );
    return res.status(401).json({
      success: false,
      error: {
        code: isExpired ? 'WEBHOOK_TIMESTAMP_EXPIRED' : 'WEBHOOK_SIGNATURE_INVALID',
        message: isExpired
          ? 'Webhook timestamp has expired or is outside tolerance window.'
          : 'Invalid cryptographic webhook signature.'
      }
    });
  }

  // 3. Deduplication & Replay Protection
  const eventId =
    svixId ||
    req.headers['x-event-id'] ||
    req.body?.id ||
    req.body?.eventId ||
    req.body?.notificationId;

  if (eventId) {
    if (processedEventCache.has(eventId)) {
      logger.info({ eventId }, '[Webhook Security] Duplicate webhook event detected; safely ignoring duplicate execution');
      return res.status(200).json({
        success: true,
        message: 'Duplicate webhook event ignored',
        duplicate: true
      });
    }
    processedEventCache.set(eventId, Date.now());
  }

  next();
}

function clearProcessedEventCache() {
  processedEventCache.clear();
}

module.exports = {
  verifyNotificationWebhookSignature,
  verifySvixSignature,
  verifyStandardHmacSignature,
  clearProcessedEventCache
};
