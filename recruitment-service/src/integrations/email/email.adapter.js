const nodemailer = require('nodemailer');
const env = require('../../config/env');
const logger = require('../../config/logger');
const { ServiceUnavailableError } = require('../../utils/AppError');
const { buildAccountActivationEmail } = require('./templates/accountActivationTemplate');
const { buildEmployeeInvitationEmail } = require('./templates/employeeInvitationTemplate');

let testEmailTransport = null;

function setTestEmailTransport(handler) {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('FORBIDDEN: setTestEmailTransport is strictly restricted to NODE_ENV=test');
  }
  testEmailTransport = handler;
}

function clearTestEmailTransport() {
  testEmailTransport = null;
}

function hasTestEmailTransport() {
  return typeof testEmailTransport === 'function';
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getSafeRecipientDomain(email) {
  const parts = String(email || '').split('@');
  return parts.length === 2 ? parts[1].toLowerCase() : 'unknown';
}

function formatFromHeader(emailCfg) {
  const safeName = String(emailCfg.fromName || 'NEXNUV Recruitment').replace(/[\r\n<>"]/g, '');
  return `${safeName} <${emailCfg.fromAddress}>`;
}

async function sendViaResend(emailCfg, payload) {
  let response;
  try {
    response = await fetch(`${emailCfg.resend.baseUrl}/emails`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${emailCfg.resend.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: formatFromHeader(emailCfg),
        to: [payload.to],
        subject: payload.subject,
        html: payload.html,
        text: payload.text
      }),
      signal: AbortSignal.timeout(emailCfg.timeoutMs)
    });
  } catch (err) {
    throw new ServiceUnavailableError(
      `Transactional email provider Resend unreachable: ${err.message}`,
      'EMAIL_DELIVERY_UNAVAILABLE'
    );
  }

  let parsed = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    throw new ServiceUnavailableError(
      `Resend rejected transactional email (HTTP ${response.status})`,
      'EMAIL_DELIVERY_UNAVAILABLE'
    );
  }

  return {
    delivered: true,
    provider: 'RESEND',
    messageId: parsed?.id || null
  };
}

async function sendViaBrevo(emailCfg, payload) {
  let response;
  try {
    response = await fetch(`${emailCfg.brevo.baseUrl}/v3/smtp/email`, {
      method: 'POST',
      headers: {
        'api-key': emailCfg.brevo.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        sender: {
          name: emailCfg.fromName,
          email: emailCfg.fromAddress
        },
        to: [{ email: payload.to }],
        subject: payload.subject,
        htmlContent: payload.html,
        textContent: payload.text
      }),
      signal: AbortSignal.timeout(emailCfg.timeoutMs)
    });
  } catch (err) {
    throw new ServiceUnavailableError(
      `Transactional email provider Brevo unreachable: ${err.message}`,
      'EMAIL_DELIVERY_UNAVAILABLE'
    );
  }

  let parsed = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    throw new ServiceUnavailableError(
      `Brevo rejected transactional email (HTTP ${response.status})`,
      'EMAIL_DELIVERY_UNAVAILABLE'
    );
  }

  return {
    delivered: true,
    provider: 'BREVO',
    messageId: parsed?.messageId || null
  };
}

async function sendViaSmtp(emailCfg, payload) {
  const transporter = nodemailer.createTransport({
    host: emailCfg.smtp.host,
    port: emailCfg.smtp.port,
    secure: emailCfg.smtp.secure,
    requireTLS: !emailCfg.smtp.secure && emailCfg.smtp.requireTls,
    auth: {
      user: emailCfg.smtp.user,
      pass: emailCfg.smtp.pass
    },
    connectionTimeout: emailCfg.timeoutMs,
    greetingTimeout: emailCfg.timeoutMs,
    socketTimeout: emailCfg.timeoutMs,
    tls: {
      minVersion: 'TLSv1.2'
    }
  });

  try {
    const info = await transporter.sendMail({
      from: formatFromHeader(emailCfg),
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html
    });
    return {
      delivered: true,
      provider: 'SMTP',
      messageId: info?.messageId || null
    };
  } catch (_err) {
    logger.error(
      {
        err: _err.message,
        code: _err.code,
        command: _err.command,
        response: _err.response,
        host: emailCfg.smtp.host
      },
      '[Email Adapter] SMTP sendMail failed'
    );
    throw new ServiceUnavailableError(
      `SMTP transactional email delivery failed: ${_err.message}`,
      'EMAIL_DELIVERY_UNAVAILABLE'
    );
  }
}

/**
 * Dispatch transactional candidate identity emails through an explicitly
 * configured provider (RESEND, BREVO, or SMTP). Never fakes delivery when disabled.
 */
async function sendTransactionalEmail({ to, subject, text, html, category = 'CANDIDATE_SECURITY', requestId = null }) {
  const recipientDomain = getSafeRecipientDomain(to);

  if (process.env.NODE_ENV === 'test' && typeof testEmailTransport === 'function') {
    const testResult = await testEmailTransport({
      to,
      subject,
      text,
      html,
      category,
      requestId
    });
    if (!testResult || testResult.delivered === false) {
      throw new ServiceUnavailableError(
        'Transactional email delivery failed',
        'EMAIL_DELIVERY_UNAVAILABLE'
      );
    }
    return {
      delivered: true,
      provider: testResult.provider || 'TEST_TRANSPORT',
      messageId: testResult.messageId || null
    };
  }

  const emailCfg = env.buildEmailConfig(process.env);
  try {
    env.validateEmailConfiguration(emailCfg, process.env.NODE_ENV || env.nodeEnv);
  } catch (err) {
    throw new ServiceUnavailableError(err.message, 'EMAIL_DELIVERY_UNAVAILABLE');
  }

  if (emailCfg.provider === 'DISABLED') {
    logger.warn(
      { category, recipientDomain, requestId },
      'Transactional email delivery aborted because EMAIL_PROVIDER is DISABLED'
    );
    throw new ServiceUnavailableError(
      'Transactional email delivery is not configured. Please set EMAIL_PROVIDER to RESEND, BREVO, or SMTP.',
      'EMAIL_DELIVERY_UNAVAILABLE'
    );
  }

  const payload = { to, subject, text, html };
  let result;
  if (emailCfg.provider === 'RESEND') {
    result = await sendViaResend(emailCfg, payload);
  } else if (emailCfg.provider === 'BREVO') {
    result = await sendViaBrevo(emailCfg, payload);
  } else {
    result = await sendViaSmtp(emailCfg, payload);
  }

  logger.info(
    { category, provider: result.provider, recipientDomain, requestId },
    'Transactional candidate security email dispatched'
  );
  return result;
}

async function sendCandidateVerificationOtpEmail({ to, fullName, otp, expiresInMinutes, requestId = null }) {
  const safeName = escapeHtml(fullName || 'Candidate');
  const safeOtp = escapeHtml(otp);
  const ttl = Number(expiresInMinutes || 10);

  return sendTransactionalEmail({
    to,
    subject: 'Verify your NEXNUV Candidate Portal email address',
    text: [
      `Hello ${fullName || 'Candidate'},`,
      '',
      `Your NEXNUV Candidate Portal verification code is: ${otp}`,
      `This one-time code expires in ${ttl} minutes and can only be used once.`,
      '',
      'If you did not create a candidate account on NEXNUV Recruitment, you can safely ignore this email.'
    ].join('\n'),
    html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
      <h2>Verify your candidate email</h2>
      <p>Hello ${safeName},</p>
      <p>Use the one-time verification code below to activate your NEXNUV Candidate Portal account:</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:6px;padding:12px 16px;background:#f1f5f9;border-radius:8px;display:inline-block">${safeOtp}</p>
      <p>This code expires in <strong>${ttl} minutes</strong> and can only be used once.</p>
      <p style="font-size:12px;color:#475569">If you did not request this, no account action will take place.</p>
    </div>`,
    category: 'CANDIDATE_EMAIL_VERIFICATION',
    requestId
  });
}

async function sendCandidatePasswordResetEmail({ to, fullName, resetUrl, resetToken, expiresInMinutes, requestId = null }) {
  const safeName = escapeHtml(fullName || 'Candidate');
  const safeUrl = escapeHtml(resetUrl);
  const safeToken = escapeHtml(resetToken);
  const ttl = Number(expiresInMinutes || 15);

  return sendTransactionalEmail({
    to,
    subject: 'Reset your NEXNUV Candidate Portal password',
    text: [
      `Hello ${fullName || 'Candidate'},`,
      '',
      'We received a request to reset your NEXNUV Candidate Portal password.',
      `Reset link: ${resetUrl}`,
      `Or paste this reset token on the Reset Password page: ${resetToken}`,
      `This reset link and token expire in ${ttl} minutes and can only be used once.`,
      '',
      'If you did not request a password reset, no changes have been made to your account.'
    ].join('\n'),
    html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
      <h2>Reset your candidate password</h2>
      <p>Hello ${safeName},</p>
      <p>Click the button below to choose a new password for your NEXNUV Candidate Portal account:</p>
      <p style="margin:20px 0">
        <a href="${safeUrl}" style="background:#0f172a;color:#ffffff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Reset Candidate Password</a>
      </p>
      <p style="font-size:13px;color:#334155">Or use this one-time reset token: <code>${safeToken}</code></p>
      <p>This link expires in <strong>${ttl} minutes</strong> and can only be used once.</p>
      <p style="font-size:12px;color:#475569">If you did not request this reset, you can safely ignore this message.</p>
    </div>`,
    category: 'CANDIDATE_PASSWORD_RESET',
    requestId
  });
}

async function sendAccountActivationEmail({
  to,
  recipientName,
  organisationName,
  planName,
  activationLink,
  expiresInHours = 48,
  loginUrl,
  instructions,
  startsAt = null,
  expiresAt = null,
  subscriptionStatus = 'Approved / Active',
  requestId = null
}) {
  const emailContent = buildAccountActivationEmail({
    to,
    recipientName,
    organisationName,
    planName,
    activationLink,
    expiresInHours,
    loginUrl,
    instructions,
    startsAt,
    expiresAt,
    subscriptionStatus
  });

  return sendTransactionalEmail({
    to,
    subject: emailContent.subject,
    text: emailContent.text,
    html: emailContent.html,
    category: 'ORGANISATION_ACTIVATION',
    requestId
  });
}

async function sendEmployeeInvitationEmail({
  to,
  recipientName,
  organisationName,
  roleName,
  roleCode,
  activationLink,
  expiresInHours = 48,
  loginUrl,
  instructions,
  requestId = null
}) {
  const emailContent = buildEmployeeInvitationEmail({
    to,
    recipientName,
    organisationName,
    roleName,
    roleCode,
    activationLink,
    expiresInHours,
    loginUrl,
    instructions
  });

  return sendTransactionalEmail({
    to,
    subject: emailContent.subject,
    text: emailContent.text,
    html: emailContent.html,
    category: 'EMPLOYEE_INVITATION',
    requestId
  });
}

module.exports = {
  setTestEmailTransport,
  clearTestEmailTransport,
  hasTestEmailTransport,
  sendTransactionalEmail,
  sendCandidateVerificationOtpEmail,
  sendCandidatePasswordResetEmail,
  sendAccountActivationEmail,
  sendEmployeeInvitationEmail
};

