'use strict';

/**
 * Consolidated Email Provider for Auth Service.
 * Supports both Resend API and standard SMTP (Gmail/SES/etc.) dynamically.
 * Fallback to safe development skip if neither is configured.
 * Secrets come strictly from environment variables.
 */
let resendClient = null;
let smtpTransport = null;

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  if (!resendClient) {
    const { Resend } = require('resend');
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

function getSmtpTransport() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  if (!host || !user || !pass) return null;
  if (!smtpTransport) {
    const nodemailer = require('nodemailer');
    smtpTransport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }
  return smtpTransport;
}

function fromAddress() {
  const name = process.env.SMTP_FROM_NAME || 'NexNuv Orbit';
  const email = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || 'onboarding@resend.dev';
  return `"${name}" <${email}>`;
}

function isConfigured() {
  return Boolean(getResendClient() || getSmtpTransport());
}

async function sendMail({ to, subject, html, text }) {
  const resend = getResendClient();
  if (resend) {
    try {
      const { data, error } = await resend.emails.send({
        from: fromAddress(),
        to,
        subject,
        html,
        text,
      });
      if (error) throw new Error(error.message);
      return { sent: true, id: data.id, provider: 'resend' };
    } catch (err) {
      console.error('[auth-service] Resend email delivery failed:', err.message);
      // Fallback to SMTP if configured
      const transport = getSmtpTransport();
      if (!transport) throw err;
    }
  }

  const transport = getSmtpTransport();
  if (transport) {
    const info = await transport.sendMail({ from: fromAddress(), to, subject, html, text });
    return { sent: true, id: info.messageId, provider: 'smtp' };
  }

  console.warn('[auth-service] email skipped: Neither Resend nor SMTP is configured');
  return { sent: false, skipped: true };
}

async function verifyConnection() {
  const resend = getResendClient();
  if (resend) return { ok: true, configured: true, provider: 'resend' };

  const transport = getSmtpTransport();
  if (transport) {
    try {
      await transport.verify();
      return { ok: true, configured: true, provider: 'smtp' };
    } catch (err) {
      return { ok: false, configured: true, provider: 'smtp', error: err.message };
    }
  }

  return { ok: false, configured: false };
}

module.exports = { sendMail, isConfigured, verifyConnection };
