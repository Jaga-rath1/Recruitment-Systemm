'use strict';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildAccountActivationEmail({
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
  subscriptionStatus = 'Approved / Active'
}) {
  const safeName = escapeHtml(recipientName || 'Administrator');
  const safeOrg = escapeHtml(organisationName || 'Your Organisation');
  const safePlan = escapeHtml(planName || 'Recruitment Premium');
  const safeStatus = escapeHtml(subscriptionStatus || 'Approved / Active');
  const safeLink = escapeHtml(activationLink);
  const safeLogin = escapeHtml(loginUrl || 'https://recruitment.nexnuv.com/org-login');
  const ttlHours = Number(expiresInHours || 48);

  const formattedStartsAt = startsAt
    ? new Date(startsAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : 'Immediate upon activation';
  const formattedExpiresAt = expiresAt
    ? new Date(expiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : '1 Year from activation';

  const textLines = [
    `Hello ${recipientName || 'Administrator'},`,
    '',
    `Welcome to NEXNUV Recruitment! Your subscription for ${organisationName} (${planName || 'Recruitment Premium'}) has been verified and approved by Platform Administration. Your dedicated workspace is now provisioned and awaiting activation.`,
    '',
    `Payment Status: VERIFIED & APPROVED`,
    `Organisation: ${organisationName}`,
    `Subscription Plan: ${planName || 'Recruitment Premium'}`,
    `Subscription Status: ${subscriptionStatus || 'Approved / Active'}`,
    `Plan Start Date: ${formattedStartsAt}`,
    `Plan End Date: ${formattedExpiresAt}`,
    `Registered Email: ${to}`,
    `Login Username: ${to}`,
    `Invitation Expiry: ${ttlHours} hours`,
    '',
    `Step 1: Set Your Administrator Password`,
    `Click or paste the secure single-use activation link below:`,
    `${activationLink}`,
    '',
    `Password Setup Instructions:`,
    `1. Password must be at least 8 characters long.`,
    `2. Must contain uppercase, lowercase, numbers, and at least one special character.`,
    `3. This activation link can only be used once and expires in ${ttlHours} hours.`,
    '',
    `Step 2: Sign In to Your Organisation Workspace`,
    `Once your password is set, log in to your recruitment dashboard at:`,
    `${loginUrl || 'https://recruitment.nexnuv.com/org-login'}`,
    `Username: ${to}`,
    '',
    instructions || 'Please set your secure Organisation Admin password to access your recruitment workspace.',
    '',
    `Support & Help:`,
    `Need assistance? Contact our platform support team at support@nexnuv.com.`,
    '',
    'Best regards,',
    'NEXNUV Recruitment Team'
  ];

  const html = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 28px; color: #1e293b; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="color: #4f46e5; margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">NEXNUV Recruitment</h1>
      <p style="color: #64748b; font-size: 13px; margin-top: 4px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Enterprise SaaS Recruitment Platform</p>
    </div>
    
    <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
      <span style="color: #15803d; font-weight: 700; font-size: 13px;">✔ Payment Verified &amp; Organisation Provisioned</span>
    </div>

    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 22px; margin-bottom: 24px;">
      <h2 style="font-size: 18px; margin-top: 0; color: #0f172a; font-weight: 700;">Activate Your Administrator Account</h2>
      <p style="font-size: 14px; line-height: 1.6; color: #334155;">
        Hello <strong>${safeName}</strong>,
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #334155;">
        Your paid subscription for <strong>${safeOrg}</strong> has been approved. Your isolated organisation tenant is fully provisioned and ready for your team.
      </p>
      <div style="background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; margin: 18px 0;">
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <tr>
            <td style="padding: 6px 0; color: #64748b; width: 40%;"><strong>Organisation:</strong></td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${safeOrg}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Subscription Plan:</strong></td>
            <td style="padding: 6px 0; color: #4f46e5; font-weight: 700;">${safePlan}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Subscription Status:</strong></td>
            <td style="padding: 6px 0; color: #15803d; font-weight: 600;">${safeStatus}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Plan Start Date:</strong></td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${formattedStartsAt}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Plan End Date:</strong></td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${formattedExpiresAt}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Registered Email:</strong></td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${escapeHtml(to)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Login Username:</strong></td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${escapeHtml(to)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Invitation Expiry:</strong></td>
            <td style="padding: 6px 0; color: #b45309; font-weight: 600;">Valid for ${ttlHours} hours</td>
          </tr>
        </table>
      </div>
      <div style="text-align: center; margin: 26px 0;">
        <a href="${safeLink}" style="background-color: #4f46e5; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 15px; display: inline-block; box-shadow: 0 2px 4px rgba(79, 70, 229, 0.3);">
          Set Administrator Password &rarr;
        </a>
      </div>
      <p style="font-size: 12px; color: #64748b; margin-bottom: 0; line-height: 1.5;">
        If the button does not work, copy and paste this URL into your browser:<br/>
        <a href="${safeLink}" style="color: #4f46e5; word-break: break-all; font-weight: 500;">${safeLink}</a>
      </p>
    </div>

    <div style="border-top: 1px solid #e2e8f0; padding-top: 20px; font-size: 13px; color: #475569; line-height: 1.6;">
      <h3 style="font-size: 14px; color: #0f172a; margin-top: 0; font-weight: 700;">Next Steps to Sign In:</h3>
      <ol style="padding-left: 20px; margin: 8px 0;">
        <li style="margin-bottom: 6px;">Click the activation link above to create your permanent Organisation Admin password.</li>
        <li style="margin-bottom: 6px;">After setting your password, navigate to the Organisation Admin Login portal: <a href="${safeLogin}" style="color: #4f46e5; font-weight: 600;">${safeLogin}</a>.</li>
        <li style="margin-bottom: 6px;">Sign in using your registered email: <strong>${escapeHtml(to)}</strong>.</li>
        <li>Access your full recruitment dashboard, post jobs, configure hiring stages, and invite recruiters.</li>
      </ol>
      <div style="background-color: #f8fafc; border-radius: 6px; padding: 10px 14px; margin-top: 16px;">
        <p style="font-size: 12px; color: #64748b; margin: 0;">
          <strong>Need assistance?</strong> Contact our support team at <a href="mailto:support@nexnuv.com" style="color: #4f46e5;">support@nexnuv.com</a>.
        </p>
      </div>
      <p style="font-size: 11px; color: #94a3b8; margin-top: 14px; margin-bottom: 0;">
        Security Notice: Zero plaintext passwords are ever transmitted or stored. This single-use link expires in ${ttlHours} hours.
      </p>
    </div>
  </div>`;

  return {
    subject: `Activate Your NEXNUV Recruitment Workspace — ${organisationName}`,
    text: textLines.join('\n'),
    html
  };
}

module.exports = {
  buildAccountActivationEmail
};
