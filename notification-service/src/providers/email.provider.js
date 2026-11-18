'use strict';

const nodemailer = require('nodemailer');
const env = require('../config/env');

let cachedTransport = null;
let testAccount = null;
let transportMode = 'uninitialized'; // 'resend-api' | 'brevo-api' | 'smtp' | 'ethereal' | 'mock'

/**
 * Checks if Resend API key is configured.
 */
function hasValidResendConfig() {
  const { RESEND_API_KEY } = env;
  if (!RESEND_API_KEY || typeof RESEND_API_KEY !== 'string') return false;
  const clean = RESEND_API_KEY.trim();
  if (!clean || clean.includes('replace_with_')) return false;
  return true;
}

/**
 * Checks if Brevo API key is configured.
 */
function hasValidBrevoConfig() {
  const { BREVO_API_KEY } = env;
  if (!BREVO_API_KEY || typeof BREVO_API_KEY !== 'string') return false;
  const clean = BREVO_API_KEY.trim();
  if (!clean || clean.includes('replace_with_')) return false;
  return true;
}

/**
 * Checks if the configured SMTP credentials appear to be real credentials.
 */
function hasValidSmtpConfig() {
  const { SMTP_HOST, SMTP_USER, SMTP_PASSWORD } = env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) return false;
  if (SMTP_USER.includes('your_email@example.com') || SMTP_USER.includes('example.com')) return false;
  if (SMTP_PASSWORD.includes('replace_with_')) return false;
  return true;
}

/**
 * Dispatches an email via Resend REST API (HTTPS port 443 - bypasses cloud SMTP port blocks).
 */
async function sendViaResend({ to, subject, html, text, cc, bcc }) {
  const apiKey = env.RESEND_API_KEY.trim();
  const name = env.SMTP_FROM_NAME || 'NexNuv Orbit Support';
  const fromEmail = env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
  const from = `"${name}" <${fromEmail}>`;

  const toList = Array.isArray(to) ? to : [to];
  const payload = {
    from,
    to: toList,
    subject,
    html: html || undefined,
    text: text || undefined,
    ...(cc ? { cc: Array.isArray(cc) ? cc : [cc] } : {}),
    ...(bcc ? { bcc: Array.isArray(bcc) ? bcc : [bcc] } : {}),
  };

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    const errorMsg = data.message || data.error?.message || response.statusText || 'Resend API error';
    throw new Error(`Resend HTTPS API error (${response.status}): ${errorMsg}`);
  }

  console.log(`[notification-service] Email delivered via Resend HTTPS API to ${toList.join(', ')} (ID: ${data.id})`);
  return {
    sent: true,
    messageId: data.id,
    previewUrl: null,
    mode: 'resend-api',
  };
}

/**
 * Dispatches an email via Brevo REST API (HTTPS port 443 - bypasses cloud SMTP port blocks).
 */
async function sendViaBrevo({ to, subject, html, text, cc, bcc }) {
  const apiKey = env.BREVO_API_KEY.trim();
  const name = env.SMTP_FROM_NAME || 'NexNuv Orbit Support';
  const fromEmail = env.SMTP_FROM_EMAIL || env.SMTP_USER || 'support@nexnuv.com';

  const toList = (Array.isArray(to) ? to : [to]).map((e) => ({ email: e }));
  const payload = {
    sender: { name, email: fromEmail },
    to: toList,
    subject,
    htmlContent: html || undefined,
    textContent: text || undefined,
    ...(cc ? { cc: (Array.isArray(cc) ? cc : [cc]).map((e) => ({ email: e })) } : {}),
    ...(bcc ? { bcc: (Array.isArray(bcc) ? bcc : [bcc]).map((e) => ({ email: e })) } : {}),
  };

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    const errorMsg = data.message || response.statusText || 'Brevo API error';
    throw new Error(`Brevo HTTPS API error (${response.status}): ${errorMsg}`);
  }

  console.log(`[notification-service] Email delivered via Brevo HTTPS API to ${toList.map((i) => i.email).join(', ')} (ID: ${data.messageId})`);
  return {
    sent: true,
    messageId: data.messageId,
    previewUrl: null,
    mode: 'brevo-api',
  };
}

/**
 * Builds or retrieves the active SMTP transporter (used when HTTPS API is not configured or as fallback).
 */
async function getTransport() {
  if (cachedTransport) return cachedTransport;

  // 1. Production / Real SMTP
  if (hasValidSmtpConfig()) {
    try {
      const transport = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465,
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASSWORD,
        },
        connectionTimeout: 4000,
        greetingTimeout: 4000,
        socketTimeout: 5000,
      });
      cachedTransport = transport;
      transportMode = 'smtp';
      console.log(`[notification-service] Configured real SMTP transport via ${env.SMTP_HOST}:${env.SMTP_PORT}`);
      return cachedTransport;
    } catch (err) {
      console.warn('[notification-service] Failed to initialize real SMTP transport, falling back to test mailer:', err.message);
    }
  }

  // 2. Development / Test Transporter via Ethereal or Mock
  try {
    testAccount = await nodemailer.createTestAccount();
    cachedTransport = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
      connectionTimeout: 4000,
      greetingTimeout: 4000,
      socketTimeout: 5000,
    });
    transportMode = 'ethereal';
    console.log(`[notification-service] Initialized Ethereal test email transport for dev (${testAccount.user})`);
    return cachedTransport;
  } catch (testErr) {
    // 3. In-memory fallback
    console.warn('[notification-service] Ethereal unavailable, using in-memory mock transport:', testErr.message);
    cachedTransport = nodemailer.createTransport({
      jsonTransport: true,
    });
    transportMode = 'mock';
    return cachedTransport;
  }
}

function fromAddress() {
  const name = env.SMTP_FROM_NAME || 'NexNuv Orbit Support';
  const email = hasValidSmtpConfig() ? env.SMTP_FROM_EMAIL : (testAccount ? testAccount.user : 'no-reply@nexnuv.local');
  return `"${name}" <${email}>`;
}

/**
 * Dispatches an email message. Supports HTTPS API (Resend, Brevo) with automatic SMTP fallback.
 * @param {Object} options - { to, subject, html, text, cc, bcc }
 * @returns {Promise<{ sent: boolean, messageId: string, previewUrl: string|null, mode: string }>}
 */
async function sendMail({ to, subject, html, text, cc, bcc }) {
  if (!to) {
    throw new Error('Recipient address "to" is required for email delivery');
  }

  let lastError = null;

  // 1. Try Resend HTTPS REST API (Port 443 - works on all cloud providers including Render Free)
  if (hasValidResendConfig()) {
    try {
      return await sendViaResend({ to, subject, html, text, cc, bcc });
    } catch (apiErr) {
      lastError = apiErr;
      console.warn('[notification-service] Resend HTTPS dispatch failed, attempting fallback:', apiErr.message);
    }
  }

  // 2. Try Brevo HTTPS REST API (Port 443)
  if (hasValidBrevoConfig()) {
    try {
      return await sendViaBrevo({ to, subject, html, text, cc, bcc });
    } catch (apiErr) {
      lastError = apiErr;
      console.warn('[notification-service] Brevo HTTPS dispatch failed, attempting SMTP fallback:', apiErr.message);
    }
  }

  // 3. SMTP Transport (Gmail SMTP, local dev, or paid host)
  try {
    const transport = await getTransport();
    const mailOptions = {
      from: fromAddress(),
      to,
      subject,
      html: html || undefined,
      text: text || undefined,
      ...(cc ? { cc } : {}),
      ...(bcc ? { bcc } : {}),
    };

    const info = await transport.sendMail(mailOptions);
    let previewUrl = null;
    if (transportMode === 'ethereal') {
      previewUrl = nodemailer.getTestMessageUrl(info);
      console.log(`[notification-service] Email delivered (Ethereal Preview): ${previewUrl}`);
    } else {
      console.log(`[notification-service] Email delivered to ${to} (Message ID: ${info.messageId})`);
    }

    return {
      sent: true,
      messageId: info.messageId,
      previewUrl,
      mode: transportMode,
    };
  } catch (smtpErr) {
    const finalErr = lastError ? `${lastError.message} (Fallback SMTP error: ${smtpErr.message})` : smtpErr.message;
    throw new Error(`Email delivery failed: ${finalErr}`);
  }
}

/**
 * Verifies email transport connectivity.
 */
async function verifyConnection() {
  if (hasValidResendConfig()) {
    try {
      const res = await fetch('https://api.resend.com/api-keys', {
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY.trim()}` },
      });
      if (res.ok) {
        return { ok: true, mode: 'resend-api', message: 'Resend HTTPS API authenticated successfully (Port 443)' };
      }
      return { ok: false, mode: 'resend-api', error: `Resend API authentication failed (${res.status})` };
    } catch (err) {
      return { ok: false, mode: 'resend-api', error: err.message };
    }
  }

  if (hasValidBrevoConfig()) {
    try {
      const res = await fetch('https://api.brevo.com/v3/account', {
        headers: { 'api-key': env.BREVO_API_KEY.trim() },
      });
      if (res.ok) {
        return { ok: true, mode: 'brevo-api', message: 'Brevo HTTPS API authenticated successfully (Port 443)' };
      }
      return { ok: false, mode: 'brevo-api', error: `Brevo API authentication failed (${res.status})` };
    } catch (err) {
      return { ok: false, mode: 'brevo-api', error: err.message };
    }
  }

  try {
    const transport = await getTransport();
    if (transportMode === 'mock') {
      return { ok: true, mode: 'mock', message: 'In-memory mock transporter ready' };
    }
    await transport.verify();
    return { ok: true, mode: transportMode, message: 'Email transport verified successfully' };
  } catch (err) {
    return { ok: false, mode: transportMode, error: err.message };
  }
}

function isConfigured() {
  return Boolean(hasValidResendConfig() || hasValidBrevoConfig() || hasValidSmtpConfig());
}

function getActiveMode() {
  if (hasValidResendConfig()) return 'resend-api';
  if (hasValidBrevoConfig()) return 'brevo-api';
  return transportMode;
}

module.exports = {
  sendMail,
  verifyConnection,
  isConfigured,
  getMode: getActiveMode,
};
