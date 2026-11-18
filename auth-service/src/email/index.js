'use strict';

/**
 * emailService — the ONLY email entry point business code should use.
 * High-level, intent-named functions. Provider details live in provider.js,
 * copy in templates.js. Swapping SMTP providers never touches this API.
 */
const { sendMail, isConfigured, verifyConnection } = require('./provider');
const templates = require('./templates');

const { APP_URL } = require('../config/env');
const LOGIN_URL = `${APP_URL}/login`;

async function sendAccountCreated({ to, name, tempPassword, roleLabel }) {
  const t = templates.accountCreated({ name, email: to, tempPassword, loginUrl: LOGIN_URL, roleLabel });
  return sendMail({ to, subject: t.subject, html: t.html, text: t.text });
}

async function sendTemporaryPassword({ to, name, tempPassword }) {
  const t = templates.temporaryPassword({ name, tempPassword, loginUrl: LOGIN_URL });
  return sendMail({ to, subject: t.subject, html: t.html, text: t.text });
}

async function sendPasswordReset({ to, name, token }) {
  const resetUrl = `${APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  const t = templates.passwordReset({ name, resetUrl });
  return sendMail({ to, subject: t.subject, html: t.html, text: t.text });
}

module.exports = {
  sendAccountCreated,
  sendTemporaryPassword,
  sendPasswordReset,
  isConfigured,
  verifyConnection,
};
