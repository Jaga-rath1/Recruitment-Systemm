'use strict';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildEmployeeInvitationEmail({
  to,
  recipientName,
  organisationName,
  roleName,
  roleCode,
  activationLink,
  expiresInHours = 48,
  loginUrl,
  instructions
}) {
  const safeName = escapeHtml(recipientName || 'Team Member');
  const safeOrg = escapeHtml(organisationName || 'Your Organisation');
  const safeRole = escapeHtml(roleName || roleCode || 'Team Member');
  const safeLink = escapeHtml(activationLink);
  const safeLogin = escapeHtml(loginUrl || 'https://recruitment.nexnuv.com/login');
  const ttlHours = Number(expiresInHours || 48);

  const textLines = [
    `Hello ${recipientName || 'Team Member'},`,
    '',
    `You have been invited to join ${organisationName} on NEXNUV Recruitment as a ${roleName || roleCode || 'Team Member'}.`,
    '',
    `Invitation Details:`,
    `- Organisation: ${organisationName}`,
    `- Assigned Role: ${roleName || roleCode}`,
    `- Registered Email / Username: ${to}`,
    `- Invitation Expiry: ${ttlHours} hours`,
    '',
    `Step 1: Set Your Account Password`,
    `Click or paste the secure single-use activation link below to choose your password:`,
    `${activationLink}`,
    '',
    `Password Requirements:`,
    `- Minimum 8 characters`,
    `- Must include uppercase, lowercase, numbers, and special characters`,
    `- Single-use link expires in ${ttlHours} hours`,
    '',
    `Step 2: Sign In to Your Dedicated Portal`,
    `After activating your account, log in at your team portal:`,
    `${loginUrl}`,
    '',
    instructions || 'Please complete your activation promptly to start managing hiring pipelines and candidate reviews.',
    '',
    `Need help? Contact your administrator at ${organisationName} or email support@nexnuv.com.`,
    '',
    'Best regards,',
    'NEXNUV Recruitment Team'
  ];

  const html = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 28px; color: #1e293b; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="color: #4f46e5; margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">NEXNUV Recruitment</h1>
      <p style="color: #64748b; font-size: 13px; margin-top: 4px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Hiring &amp; Talent Acquisition Workspace</p>
    </div>
    
    <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
      <span style="color: #1d4ed8; font-weight: 700; font-size: 13px;">✉ Team Invitation &amp; Role Assignment</span>
    </div>

    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 22px; margin-bottom: 24px;">
      <h2 style="font-size: 18px; margin-top: 0; color: #0f172a; font-weight: 700;">Join ${safeOrg} on NEXNUV</h2>
      <p style="font-size: 14px; line-height: 1.6; color: #334155;">
        Hello <strong>${safeName}</strong>,
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #334155;">
        You have been added to the recruitment team at <strong>${safeOrg}</strong>. An account has been provisioned for you with the following role and permissions:
      </p>
      <div style="background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; margin: 18px 0;">
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <tr>
            <td style="padding: 6px 0; color: #64748b; width: 40%;"><strong>Organisation:</strong></td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${safeOrg}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Assigned Role:</strong></td>
            <td style="padding: 6px 0; color: #4f46e5; font-weight: 700;">${safeRole}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Username / Email:</strong></td>
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
          Activate Account &amp; Set Password &rarr;
        </a>
      </div>
      <p style="font-size: 12px; color: #64748b; margin-bottom: 0; line-height: 1.5;">
        If the button does not work, copy and paste this URL into your browser:<br/>
        <a href="${safeLink}" style="color: #4f46e5; word-break: break-all; font-weight: 500;">${safeLink}</a>
      </p>
    </div>

    <div style="border-top: 1px solid #e2e8f0; padding-top: 20px; font-size: 13px; color: #475569; line-height: 1.6;">
      <h3 style="font-size: 14px; color: #0f172a; margin-top: 0; font-weight: 700;">Signing In:</h3>
      <ol style="padding-left: 20px; margin: 8px 0;">
        <li style="margin-bottom: 6px;">Activate your account using the secure link above and choose your password.</li>
        <li style="margin-bottom: 6px;">Navigate to your team login portal: <a href="${safeLogin}" style="color: #4f46e5; font-weight: 600;">${safeLogin}</a>.</li>
        <li style="margin-bottom: 6px;">Sign in with your email (<strong>${escapeHtml(to)}</strong>) and new password.</li>
      </ol>
      <div style="background-color: #f8fafc; border-radius: 6px; padding: 10px 14px; margin-top: 16px;">
        <p style="font-size: 12px; color: #64748b; margin: 0;">
          <strong>Need assistance?</strong> Contact your organisation admin or reach out to <a href="mailto:support@nexnuv.com" style="color: #4f46e5;">support@nexnuv.com</a>.
        </p>
      </div>
      <p style="font-size: 11px; color: #94a3b8; margin-top: 14px; margin-bottom: 0;">
        Security Notice: Single-use activation token. No plaintext passwords are sent or logged.
      </p>
    </div>
  </div>`;

  return {
    subject: `You've Been Invited to Join ${organisationName} on NEXNUV Recruitment`,
    text: textLines.join('\n'),
    html
  };
}

module.exports = {
  buildEmployeeInvitationEmail
};
