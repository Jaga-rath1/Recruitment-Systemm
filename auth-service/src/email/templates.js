'use strict';

/**
 * HTML/text email templates. Pure functions — no secrets, no side effects.
 * Keep copy product-specific and concise.
 */

const BRAND = 'NexNuv Orbit';

// Names and addresses come from people typing into forms; they must never be read as markup.
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function shell(title, bodyHtml) {
  return `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:Inter,Arial,sans-serif;color:#111827">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px">
    <div style="font-size:18px;font-weight:700;color:#149EFF;margin-bottom:24px">${BRAND}</div>
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:28px">
      <h1 style="font-size:20px;margin:0 0 12px">${esc(title)}</h1>
      ${bodyHtml}
    </div>
    <p style="font-size:12px;color:#64748b;margin-top:20px">This is an automated message from ${BRAND}. Please do not reply.</p>
  </div></body></html>`;
}

function button(href, label) {
  return `<a href="${esc(href)}" style="display:inline-block;margin-top:16px;background:#149EFF;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px">${esc(label)}</a>`;
}

const templates = {
  accountCreated({ name, email, tempPassword, loginUrl, roleLabel }) {
    const who = name ? `Hi ${name},` : 'Hello,';
    const intro = roleLabel
      ? `An account has been created for you on ${BRAND} with the role: ${roleLabel}.`
      : `An account has been created for you on ${BRAND}.`;
    return {
      subject: `Your ${BRAND} account is ready`,
      text: `${who}\n\n${intro}\nEmail: ${email}\nTemporary password: ${tempPassword}\n\nSign in and change your password: ${loginUrl}`,
      html: shell(
        'Your account is ready',
        `<p style="font-size:14px;line-height:1.6;color:#475569">${esc(who)}</p>
         <p style="font-size:14px;line-height:1.6;color:#475569">${esc(intro)}</p>
         <p style="font-size:14px;line-height:1.6;color:#111827"><strong>Email:</strong> ${esc(email)}<br/>
         <strong>Temporary password:</strong> <code>${esc(tempPassword)}</code></p>
         <p style="font-size:14px;line-height:1.6;color:#475569">Please sign in and change your password right away.</p>
         ${button(loginUrl, 'Sign in')}`
      ),
    };
  },

  temporaryPassword({ name, tempPassword, loginUrl }) {
    const who = name ? `Hi ${name},` : 'Hello,';
    return {
      subject: `Your temporary ${BRAND} password`,
      text: `${who}\n\nYour temporary password is: ${tempPassword}\nSign in and change it: ${loginUrl}`,
      html: shell(
        'Temporary password',
        `<p style="font-size:14px;line-height:1.6;color:#475569">${esc(who)}</p>
         <p style="font-size:14px;line-height:1.6;color:#111827"><strong>Temporary password:</strong> <code>${esc(tempPassword)}</code></p>
         ${button(loginUrl, 'Sign in')}`
      ),
    };
  },

  passwordReset({ name, resetUrl }) {
    const who = name ? `Hi ${name},` : 'Hello,';
    return {
      subject: `Reset your ${BRAND} password`,
      text: `${who}\n\nWe received a request to reset your password.\nReset it here (link expires in 1 hour): ${resetUrl}\n\nIf you didn't request this, you can ignore this email.`,
      html: shell(
        'Reset your password',
        `<p style="font-size:14px;line-height:1.6;color:#475569">${esc(who)}</p>
         <p style="font-size:14px;line-height:1.6;color:#475569">We received a request to reset your password. This link expires in 1 hour.</p>
         ${button(resetUrl, 'Reset password')}
         <p style="font-size:13px;line-height:1.6;color:#64748b;margin-top:16px">If you didn't request this, you can safely ignore this email.</p>`
      ),
    };
  },
};

module.exports = templates;
