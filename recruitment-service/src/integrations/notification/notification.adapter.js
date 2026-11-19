const { v4: uuidv4 } = require('uuid');
const env = require('../../config/env');
const logger = require('../../config/logger');
const { requestJson } = require('../common/httpClient');

const NOTIFICATION_EVENTS = new Set([
  'SUBSCRIPTION_SUBMITTED',
  'TRIAL_ACTIVATED',
  'PAYMENT_APPROVED',
  'PAYMENT_REJECTED',
  'ACCOUNT_INVITATION',
  'EMPLOYEE_INVITATION',
  'CANDIDATE_ACCOUNT_ACTIVATION',
  'PASSWORD_RESET_REQUESTED',
  'APPLICATION_RECEIVED',
  'CANDIDATE_SHORTLISTED',
  'CANDIDATE_REJECTED',
  'INTERVIEW_SCHEDULED',
  'INTERVIEW_RESCHEDULED',
  'INTERVIEW_FEEDBACK_SUBMITTED',
  'FINAL_SELECTION',
  'OFFER_LETTER_SENT',
  'OFFER_ACCEPTED',
  'OFFER_REJECTED',
  'JOINING_LETTER_SENT',
  'JOINING_CONFIRMED'
]);

const dispatchedNotifications = [];
const deliveryLedger = new Map();

function buildNotificationCopy(eventType, recipientName, payload = {}) {
  const who = recipientName || 'there';
  switch (eventType) {
    case 'SUBSCRIPTION_SUBMITTED':
      return {
        title: `Subscription Request Recorded — ${payload.organisationName || 'Organisation'}`,
        message: `Hello ${who}, your Recruitment Premium subscription request has been recorded. Remit payment with memo ${payload.paymentInstructions?.paymentMemo || ''}.`
      };
    case 'TRIAL_ACTIVATED':
      return {
        title: `15-Day Free Trial Activated — ${payload.organisationName || 'NEXNUV Recruitment'}`,
        message: `Hello ${who}, your 15-day free trial has been activated. Welcome to NEXNUV Recruitment!`
      };
    case 'PAYMENT_APPROVED':
      return {
        title: `Payment Approved — ${payload.organisationName || 'NEXNUV Recruitment'}`,
        message: `Hello ${who}, your payment (${payload.paymentReference || ''}) has been verified and your organisation tenant is provisioned.`
      };
    case 'PAYMENT_REJECTED':
      return {
        title: 'Subscription Payment Verification Issue',
        message: `Hello ${who}, payment verification requires attention: ${payload.reason || 'Please check remittance proof'}.`
      };
    case 'ACCOUNT_INVITATION': {
      const org = payload.organisationName ? ` — ${payload.organisationName}` : '';
      const plan = payload.planName ? ` (${payload.planName})` : '';
      const link = payload.activationLink ? `\n\nActivation Link: ${payload.activationLink}` : '';
      const exp = payload.expiresInHours ? ` (expires in ${payload.expiresInHours} hours)` : '';
      const login = payload.loginUrl ? `\nLogin Portal: ${payload.loginUrl}` : '';
      const instructions = payload.instructions ? `\n\n${payload.instructions}` : '';
      return {
        title: `Activate Your NEXNUV Recruitment Workspace${org}`,
        message: `Hello ${who}, your organisation subscription${plan} has been approved and your administrator workspace is provisioned.${instructions}${link}${exp}${login}`
      };
    }
    case 'EMPLOYEE_INVITATION': {
      const org = payload.organisationName ? ` at ${payload.organisationName}` : '';
      const role = payload.roleName || payload.roleCode || 'team member';
      const link = payload.activationLink ? `\n\nActivation Link: ${payload.activationLink}` : '';
      const exp = payload.expiresInHours ? ` (expires in ${payload.expiresInHours} hours)` : '';
      const login = payload.loginUrl ? `\nLogin Portal: ${payload.loginUrl}` : '';
      return {
        title: `Invited to Join ${payload.organisationName || 'NEXNUV Recruitment Workspace'}`,
        message: `Hello ${who}, you have been assigned the ${role} role${org}.${link}${exp}${login}`
      };
    }
    case 'PASSWORD_RESET_REQUESTED': {
      const org = payload.organisationName ? ` — ${payload.organisationName}` : '';
      const roleLabel = payload.roleLabel || 'Organisation Admin';
      const link = payload.resetLink ? `\n\nReset Password Link: ${payload.resetLink}` : '';
      const exp = payload.expiresInMinutes ? ` (expires in ${payload.expiresInMinutes} minutes)` : '';
      const login = payload.loginUrl ? `\nLogin Portal: ${payload.loginUrl}` : '';
      const instructions = payload.instructions ? `\n\n${payload.instructions}` : '';
      return {
        title: `Reset Your NEXNUV ${roleLabel} Password${org}`,
        message: `Hello ${who},${instructions}${link}${exp}${login}`
      };
    }
    case 'CANDIDATE_ACCOUNT_ACTIVATION': {
      const loginUrl = payload.loginUrl || `${env.clientAppUrl}/login`;
      const activationUrl = payload.activationUrl || `${env.clientAppUrl}/activate-candidate`;
      const expiresInHours = payload.expiresInHours || 48;
      const username = payload.username || payload.email || '';
      return {
        title: `Activate Your Candidate Portal Account — NEXNUV Recruitment`,
        message: `Hello ${who}, your Candidate Portal account has been created for your application.\n\nUsername / Login Email: ${username}\nCandidate Portal Login: ${loginUrl}\nSet Your Password: ${activationUrl} (expires in ${expiresInHours} hours)\n\nOnce activated, sign in to track your application status, interview schedules, and job offers.`
      };
    }
    case 'APPLICATION_RECEIVED': {
      const loginUrl = payload.loginUrl || `${env.clientAppUrl}/login`;
      const username = payload.username || payload.email || payload.recipientEmail || '';
      const activationUrl = payload.activationUrl;
      const expiresInHours = payload.expiresInHours || 48;
      let identityBlock = '';
      if (activationUrl) {
        identityBlock = `\n\nCandidate Portal Login & Activation:\nUsername / Login Email: ${username}\nSet Password & Activate: ${activationUrl} (expires in ${expiresInHours} hours)\nCandidate Portal Login: ${loginUrl}\nOnce activated, sign in to track your application status, interview schedules, and job offers.`;
      } else if (username) {
        identityBlock = `\n\nCandidate Portal Login:\nUsername / Login Email: ${username}\nCandidate Portal Login: ${loginUrl}\nSign in to track your application progress and upcoming interview schedules.`;
      }
      return {
        title: `Application Received — ${payload.jobTitle || 'Open Role'}`,
        message: `Hello ${who}, your application (${payload.applicationReference || ''}) has been received.${identityBlock}`
      };
    }
    case 'CANDIDATE_SHORTLISTED': {
      const loginUrl = payload.loginUrl || `${env.clientAppUrl}/login`;
      const username = payload.username || payload.email || payload.recipientEmail || '';
      const loginInstructions = username
        ? `\n\nCandidate Portal Login: ${loginUrl} (Username: ${username})`
        : `\n\nCandidate Portal Login: ${loginUrl}`;
      return {
        title: `Application Shortlisted — ${payload.jobTitle || ''}`,
        message: `Hello ${who}, congratulations — your application (${payload.applicationReference || ''}) has been shortlisted.${loginInstructions}\nSign in to review job details and prepare for upcoming interview rounds.`
      };
    }
    case 'CANDIDATE_REJECTED':
      return {
        title: `Application Update — ${payload.jobTitle || ''}`,
        message: `Hello ${who}, thank you for applying (${payload.applicationReference || ''}). We will not be moving forward at this stage.`
      };
    case 'INTERVIEW_SCHEDULED':
      return {
        title: `${payload.roundType || ''} Interview Scheduled`,
        message: `An interview (${payload.roundType || 'Round'} #${payload.roundNumber || 1}) is scheduled for ${payload.scheduledAt || 'an upcoming slot'}.`
      };
    case 'INTERVIEW_RESCHEDULED':
      return {
        title: 'Interview Rescheduled',
        message: `Interview has been rescheduled to ${payload.scheduledAt || 'a new time'}${payload.reason ? `: ${payload.reason}` : '.'}`
      };
    case 'INTERVIEW_FEEDBACK_SUBMITTED':
      return {
        title: 'Interview Scorecard Submitted',
        message: `${payload.roundType || ''} evaluation submitted with recommendation: ${payload.recommendation || ''}.`
      };
    case 'FINAL_SELECTION':
      return {
        title: `Final Selection Update — ${payload.jobTitle || ''}`,
        message: `Application ${payload.applicationReference || ''} moved to final decision: ${payload.decision || ''}.`
      };
    case 'OFFER_LETTER_SENT':
      return {
        title: `Official Offer Letter — ${payload.designation || ''}`,
        message: `Hello ${who}, an official compensation offer has been extended for ${payload.designation || 'your role'}.`
      };
    case 'OFFER_ACCEPTED':
      return {
        title: 'Candidate Accepted Offer',
        message: `Candidate ${payload.candidateName || ''} accepted offer for application ${payload.applicationReference || ''}.`
      };
    case 'OFFER_REJECTED':
      return {
        title: 'Candidate Declined Offer',
        message: `Candidate ${payload.candidateName || ''} declined the offer for application ${payload.applicationReference || ''}.`
      };
    case 'JOINING_LETTER_SENT':
      return {
        title: 'Joining & Onboarding Initiated',
        message: `Hello ${who}, onboarding and joining details are ready for ${payload.joiningLocation || 'your role'}.`
      };
    case 'JOINING_CONFIRMED':
      return {
        title: 'Welcome Aboard — Joining Confirmed',
        message: `Hello ${who}, your joining status is confirmed as HIRED.`
      };
    default:
      return {
        title: `NEXNUV Recruitment — ${eventType}`,
        message: `Notification event ${eventType} triggered.`
      };
  }
}

function renderNotificationHtml({ eventType, recipientName, payload = {}, title, message }) {
  if (eventType === 'PASSWORD_RESET_REQUESTED') {
    const safeName = String(recipientName || 'User').replace(/[<>]/g, '');
    const safeOrg = String(payload.organisationName || 'your organisation').replace(/[<>]/g, '');
    const safeRole = String(payload.roleLabel || 'Organisation Admin').replace(/[<>]/g, '');
    const resetLink = payload.resetLink || `${env.clientAppUrl}/forgot-password`;
    const loginUrl = payload.loginUrl || `${env.clientAppUrl}/org-login`;
    const expiresText = payload.expiresInMinutes ? `${payload.expiresInMinutes} minutes` : '60 minutes';
    return `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#0f172a;border:1px solid #e2e8f0;border-radius:12px;">
        <h2 style="margin:0 0 12px;color:#1e1b4b;">Reset Your ${safeRole} Password</h2>
        <p style="font-size:14px;line-height:1.6;">Hello <strong>${safeName}</strong>,</p>
        <p style="font-size:14px;line-height:1.6;">A password reset was requested for your <strong>${safeOrg}</strong> (${safeRole}) account on NEXNUV Recruitment.</p>
        <p style="margin:24px 0;">
          <a href="${resetLink}" style="display:inline-block;background:#4f46e5;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;">Set New Password</a>
        </p>
        <p style="font-size:13px;color:#475569;line-height:1.5;">Or copy and open this single-use link in your browser (valid for ${expiresText}):<br/>
          <a href="${resetLink}" style="color:#4f46e5;word-break:break-all;">${resetLink}</a>
        </p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;"/>
        <p style="font-size:12px;color:#64748b;">After resetting your password, sign in at: <a href="${loginUrl}" style="color:#4f46e5;">${loginUrl}</a></p>
      </div>
    `;
  }
  if (eventType === 'CANDIDATE_ACCOUNT_ACTIVATION') {
    const safeName = String(recipientName || 'Candidate').replace(/[<>]/g, '');
    const username = String(payload.username || payload.email || '').replace(/[<>]/g, '');
    const activationUrl = payload.activationUrl || `${env.clientAppUrl}/activate-candidate`;
    const loginUrl = payload.loginUrl || `${env.clientAppUrl}/login`;
    const expiresInHours = payload.expiresInHours || 48;
    const safeJobTitle = payload.jobTitle ? String(payload.jobTitle).replace(/[<>]/g, '') : null;
    return `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#0f172a;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
        <div style="background:#4f46e5;color:#ffffff;padding:20px;border-radius:8px 8px 0 0;text-align:center;margin:-24px -24px 24px -24px;">
          <h2 style="margin:0;font-size:20px;font-weight:700;">NEXNUV Recruitment</h2>
          <p style="margin:6px 0 0;font-size:14px;opacity:0.9;">Candidate Portal Account Activation</p>
        </div>
        <p style="font-size:15px;line-height:1.6;margin-top:0;">Hello <strong>${safeName}</strong>,</p>
        <p style="font-size:14px;line-height:1.6;color:#334155;">
          Thank you for applying${safeJobTitle ? ` for <strong>${safeJobTitle}</strong>` : ''}.
          Your NEXNUV Candidate Portal account has been created so you can securely track your application progress, view interview schedules, and respond to offers.
        </p>
        <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:16px;margin:20px 0;">
          <h4 style="margin:0 0 10px;font-size:13px;text-transform:uppercase;color:#64748b;letter-spacing:0.5px;">Your Login Identity</h4>
          <p style="margin:4px 0;font-size:14px;"><strong>Username / Email:</strong> <code style="background:#e2e8f0;padding:2px 6px;border-radius:4px;font-size:13px;color:#0f172a;">${username}</code></p>
          <p style="margin:4px 0;font-size:14px;"><strong>Account Status:</strong> <span style="color:#d97706;font-weight:600;">Pending Password Setup</span></p>
          <p style="margin:4px 0;font-size:14px;"><strong>Link Expiration:</strong> Valid for ${expiresInHours} hours</p>
        </div>
        <p style="text-align:center;margin:28px 0;">
          <a href="${activationUrl}" style="display:inline-block;background:#4f46e5;color:#ffffff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;box-shadow:0 4px 6px -1px rgba(79,70,229,0.3);">Set Password & Activate Account</a>
        </p>
        <p style="font-size:13px;color:#64748b;line-height:1.5;">
          Or copy and paste this secure activation URL into your browser:<br/>
          <a href="${activationUrl}" style="color:#4f46e5;word-break:break-all;">${activationUrl}</a>
        </p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;"/>
        <h4 style="margin:0 0 8px;font-size:13px;color:#334155;">How to Access Candidate Portal</h4>
        <ol style="margin:0;padding-left:20px;font-size:13px;line-height:1.6;color:#475569;">
          <li>Click the activation button above and choose your secure password.</li>
          <li>After activation, visit the Candidate Portal login: <a href="${loginUrl}" style="color:#4f46e5;">${loginUrl}</a></li>
          <li>Sign in using your email (<strong>${username}</strong>) and your new password.</li>
        </ol>
        <p style="font-size:12px;color:#94a3b8;margin-top:24px;border-top:1px solid #f1f5f9;padding-top:12px;">
          This activation link is single-use and will expire in ${expiresInHours} hours. If you did not apply for a job on NEXNUV, please ignore this email.
        </p>
      </div>
    `;
  }
  if (eventType === 'APPLICATION_RECEIVED') {
    const safeName = String(recipientName || 'Candidate').replace(/[<>]/g, '');
    const username = String(payload.username || payload.email || '').replace(/[<>]/g, '');
    const safeJobTitle = payload.jobTitle ? String(payload.jobTitle).replace(/[<>]/g, '') : 'Open Role';
    const appRef = payload.applicationReference ? String(payload.applicationReference).replace(/[<>]/g, '') : '';
    const activationUrl = payload.activationUrl || null;
    const loginUrl = payload.loginUrl || `${env.clientAppUrl}/login`;
    const expiresInHours = payload.expiresInHours || 48;

    return `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#0f172a;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
        <div style="background:#4f46e5;color:#ffffff;padding:20px;border-radius:8px 8px 0 0;text-align:center;margin:-24px -24px 24px -24px;">
          <h2 style="margin:0;font-size:20px;font-weight:700;">NEXNUV Recruitment</h2>
          <p style="margin:6px 0 0;font-size:14px;opacity:0.9;">Application Confirmation &amp; Candidate Portal Access</p>
        </div>
        <p style="font-size:15px;line-height:1.6;margin-top:0;">Hello <strong>${safeName}</strong>,</p>
        <p style="font-size:14px;line-height:1.6;color:#334155;">
          Thank you for applying for <strong>${safeJobTitle}</strong>. Your application has been successfully received and recorded in our hiring pipeline.
        </p>
        <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:16px;margin:20px 0;">
          <h4 style="margin:0 0 10px;font-size:13px;text-transform:uppercase;color:#64748b;letter-spacing:0.5px;">Application &amp; Login Details</h4>
          ${appRef ? `<p style="margin:4px 0;font-size:14px;"><strong>Application Reference:</strong> <code style="background:#e2e8f0;padding:2px 6px;border-radius:4px;font-size:13px;color:#0f172a;">${appRef}</code></p>` : ''}
          ${username ? `<p style="margin:4px 0;font-size:14px;"><strong>Username / Login Email:</strong> <code style="background:#e2e8f0;padding:2px 6px;border-radius:4px;font-size:13px;color:#0f172a;">${username}</code></p>` : ''}
          <p style="margin:4px 0;font-size:14px;"><strong>Candidate Portal:</strong> <a href="${loginUrl}" style="color:#4f46e5;font-weight:600;">${loginUrl}</a></p>
        </div>
        ${
          activationUrl
            ? `
        <div style="text-align:center;margin:24px 0;">
          <p style="font-size:14px;color:#334155;margin-bottom:12px;">To track your application, interview rounds, and offers, please activate your Candidate Portal account:</p>
          <a href="${activationUrl}" style="display:inline-block;background:#4f46e5;color:#ffffff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;box-shadow:0 4px 6px -1px rgba(79,70,229,0.3);">Set Password &amp; Activate Account</a>
          <p style="font-size:12px;color:#64748b;margin-top:10px;">Link valid for ${expiresInHours} hours. Or copy this URL:<br/><a href="${activationUrl}" style="color:#4f46e5;word-break:break-all;">${activationUrl}</a></p>
        </div>
        `
            : `
        <div style="text-align:center;margin:24px 0;">
          <a href="${loginUrl}" style="display:inline-block;background:#4f46e5;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;">Sign In to Candidate Portal</a>
        </div>
        `
        }
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;"/>
        <h4 style="margin:0 0 8px;font-size:13px;color:#334155;">Next Steps</h4>
        <ol style="margin:0;padding-left:20px;font-size:13px;line-height:1.6;color:#475569;">
          <li>Our talent team will review your qualifications and experience.</li>
          <li>You will receive updates directly via email and inside your Candidate Portal.</li>
          <li>You can update your profile and review scheduled interviews anytime by logging into the Candidate Portal.</li>
        </ol>
      </div>
    `;
  }
  if (eventType === 'CANDIDATE_SHORTLISTED') {
    const safeName = String(recipientName || 'Candidate').replace(/[<>]/g, '');
    const username = String(payload.username || payload.email || '').replace(/[<>]/g, '');
    const safeJobTitle = payload.jobTitle ? String(payload.jobTitle).replace(/[<>]/g, '') : 'the position';
    const appRef = payload.applicationReference ? String(payload.applicationReference).replace(/[<>]/g, '') : '';
    const loginUrl = payload.loginUrl || `${env.clientAppUrl}/login`;

    return `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#0f172a;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
        <div style="background:#059669;color:#ffffff;padding:20px;border-radius:8px 8px 0 0;text-align:center;margin:-24px -24px 24px -24px;">
          <h2 style="margin:0;font-size:20px;font-weight:700;">NEXNUV Recruitment</h2>
          <p style="margin:6px 0 0;font-size:14px;opacity:0.9;">Application Shortlisted — Congratulations!</p>
        </div>
        <p style="font-size:15px;line-height:1.6;margin-top:0;">Hello <strong>${safeName}</strong>,</p>
        <p style="font-size:14px;line-height:1.6;color:#334155;">
          Great news! Your application for <strong>${safeJobTitle}</strong>${appRef ? ` (Ref: <code>${appRef}</code>)` : ''} has been shortlisted by our hiring team.
        </p>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:20px 0;">
          <h4 style="margin:0 0 10px;font-size:13px;text-transform:uppercase;color:#166534;letter-spacing:0.5px;">Candidate Portal Details</h4>
          ${username ? `<p style="margin:4px 0;font-size:14px;"><strong>Username / Email:</strong> <code style="background:#dcfce7;padding:2px 6px;border-radius:4px;font-size:13px;color:#14532d;">${username}</code></p>` : ''}
          <p style="margin:4px 0;font-size:14px;"><strong>Portal Login:</strong> <a href="${loginUrl}" style="color:#059669;font-weight:600;">${loginUrl}</a></p>
        </div>
        <div style="text-align:center;margin:24px 0;">
          <a href="${loginUrl}" style="display:inline-block;background:#059669;color:#ffffff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;">Sign In to Candidate Portal</a>
        </div>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;"/>
        <h4 style="margin:0 0 8px;font-size:13px;color:#334155;">What's Next?</h4>
        <p style="font-size:13px;line-height:1.6;color:#475569;margin:0;">
          Our recruitment team will be scheduling your initial interview round shortly. Please keep your candidate profile updated and monitor your Candidate Portal for upcoming calendar slots and meeting links.
        </p>
      </div>
    `;
  }
  return `<p>${(message || '').replace(/\n/g, '<br/>')}</p>`;
}

async function recordNotificationHistoryEntry({
  envelope,
  eventType,
  organisationId,
  recipientEmail,
  recipientName,
  recipientUserId,
  title,
  message,
  payload,
  requestId,
  deliveryStatus,
  provider,
  providerMessageId
}) {
  try {
    const notifRepo = require('../../modules/notificationHistory/notificationHistory.repository');
    await notifRepo.createNotificationEntry({
      notificationId: envelope.notificationId,
      eventType,
      category: 'RECRUITMENT',
      recipientEmail: recipientEmail || 'candidate-portal@nexnuv.internal',
      recipientName: recipientName || null,
      recipientType: eventType.startsWith('ACCOUNT_INVITATION')
        ? 'ORGANISATION_ADMIN'
        : (eventType.startsWith('CANDIDATE') || eventType.startsWith('APPLICATION') || recipientUserId?.startsWith('cand'))
        ? 'CANDIDATE'
        : 'EMPLOYEE',
      organisationId,
      organisationName: payload?.organisationName || null,
      title,
      message,
      deliveryStatus,
      provider: provider || 'STANDALONE',
      providerMessageId: providerMessageId || null,
      metadata: {
        ...payload,
        requestId,
        dispatchedAt: envelope.dispatchedAt
      }
    });
  } catch (dbErr) {
    logger.warn({ err: dbErr.message, notificationId: envelope.notificationId }, '[Notification Adapter] Could not persist notification history to DB');
  }
}

async function dispatchDirectEmail({
  eventType,
  organisationId = null,
  recipientEmail,
  recipientName = '',
  payload = {},
  title,
  message,
  requestId = null
}) {
  const emailAdapter = require('../email/email.adapter');
  const activeEmailCfg = typeof env.buildEmailConfig === 'function'
    ? env.buildEmailConfig(process.env)
    : env.email;
  const hasTestTransport = typeof emailAdapter.hasTestEmailTransport === 'function'
    ? emailAdapter.hasTestEmailTransport()
    : false;
  const isDirectEmailConfigured = hasTestTransport || (activeEmailCfg && activeEmailCfg.provider && activeEmailCfg.provider !== 'DISABLED');

  if (!isDirectEmailConfigured || !recipientEmail) {
    return null;
  }

  try {
    if (eventType === 'ACCOUNT_INVITATION') {
      return await emailAdapter.sendAccountActivationEmail({
        to: recipientEmail,
        recipientName,
        organisationName: payload.organisationName,
        planName: payload.planName,
        activationLink: payload.activationLink,
        expiresInHours: payload.expiresInHours,
        loginUrl: payload.loginUrl,
        instructions: payload.instructions,
        startsAt: payload.startsAt,
        expiresAt: payload.planExpiresAt || payload.expiresAt,
        subscriptionStatus: payload.subscriptionStatus,
        requestId
      });
    } else if (eventType === 'EMPLOYEE_INVITATION') {
      return await emailAdapter.sendEmployeeInvitationEmail({
        to: recipientEmail,
        recipientName,
        organisationName: payload.organisationName,
        roleName: payload.roleName,
        roleCode: payload.roleCode,
        activationLink: payload.activationLink,
        expiresInHours: payload.expiresInHours,
        loginUrl: payload.loginUrl,
        instructions: payload.instructions,
        requestId
      });
    } else {
      const html = renderNotificationHtml({ eventType, recipientName, payload, title, message });
      const category = eventType === 'PASSWORD_RESET_REQUESTED'
        ? 'NOTIFICATION_PASSWORD_RESET_REQUESTED'
        : eventType === 'CANDIDATE_ACCOUNT_ACTIVATION'
        ? 'CANDIDATE_ACCOUNT_ACTIVATION'
        : `NOTIFICATION_${eventType}`;
      return await emailAdapter.sendTransactionalEmail({
        to: recipientEmail,
        subject: title,
        text: message,
        html,
        category,
        requestId
      });
    }
  } catch (err) {
    logger.warn(
      { eventType, organisationId, requestId, err: err.message, stack: err.stack },
      '[Notification Adapter] Direct email dispatch failed, proceeding with recorded state'
    );
    return null;
  }
}

async function dispatchNotification({
  eventType,
  organisationId = null,
  recipientUserId = null,
  recipientEmail = null,
  recipientName = '',
  payload = {},
  requestId = null,
  idempotencyKey = null
}) {
  if (!NOTIFICATION_EVENTS.has(eventType)) {
    throw new Error(`Unsupported notification event type: ${eventType}`);
  }

  const { title, message } = buildNotificationCopy(eventType, recipientName, payload);
  const envelope = {
    notificationId: uuidv4(),
    eventType,
    organisationId,
    recipientEmail,
    recipientName,
    title,
    message,
    payload,
    requestId,
    dispatchedAt: new Date().toISOString()
  };

  if (env.integrationMode === 'live') {
    // Notification Service mandates x-organization-id UUID via requireOrgContext.
    // Pre-tenant or global identity events without an organisationId (e.g. SUBSCRIPTION_SUBMITTED,
    // PAYMENT_REJECTED, CANDIDATE_ACCOUNT_ACTIVATION) fall back to direct transactional email delivery.
    if (!organisationId) {
      logger.info(
        { eventType, requestId },
        '[Live Notification Adapter] Pre-tenant/global event without organisationId falling back to direct email'
      );
      const emailDispatchResult = await dispatchDirectEmail({
        eventType,
        organisationId,
        recipientEmail,
        recipientName,
        payload,
        title,
        message,
        requestId
      });
      dispatchedNotifications.push({ ...envelope, emailDispatchResult });
      await recordNotificationHistoryEntry({
        envelope,
        eventType,
        organisationId: null,
        recipientEmail,
        recipientName,
        recipientUserId,
        title,
        message,
        payload,
        requestId,
        deliveryStatus: 'ACCEPTED',
        provider: 'SMTP',
        providerMessageId: emailDispatchResult?.messageId || null
      });
      return {
        requestAccepted: true,
        deliveryStatus: 'ACCEPTED',
        delivered: emailDispatchResult?.delivered === true,
        fallbackChannel: 'DIRECT_EMAIL',
        emailSent: true,
        mode: 'live',
        notificationId: envelope.notificationId,
        messageId: emailDispatchResult?.messageId || null
      };
    }

    const targetUserId = String(recipientUserId || recipientEmail || 'candidate-portal').slice(0, 255);
    const safeEmail = recipientEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(recipientEmail).trim())
      ? String(recipientEmail).trim()
      : undefined;

    try {
      const res = await requestJson({
        serviceName: 'Notification Service',
        baseUrl: env.services.notificationUrl,
        method: 'POST',
        path: '/api/v1/notifications',
        organisationId,
        actor: {
          userId: 'svc-recruitment',
          role: 'super_admin',
          email: 'notifications@nexnuv.internal'
        },
        requestId,
        timeoutMs: env.services?.requestTimeoutMs || 5000,
        body: {
          userId: targetUserId,
          type: `recruitment_${eventType.toLowerCase()}`,
          title: title.slice(0, 255),
          subject: title.slice(0, 255),
          message: message.slice(0, 5000),
          html: renderNotificationHtml({ eventType, recipientName, payload, title, message }),
          recipientEmail: safeEmail,
          recipientName: recipientName || undefined,
          sendEmail: Boolean(safeEmail),
          idempotencyKey: idempotencyKey || `${eventType}:${organisationId}:${targetUserId}:${payload.applicationReference || payload.subscriptionId || envelope.notificationId}`,
          data: {
            ...payload,
            eventType,
            notificationId: envelope.notificationId,
            requestId
          }
        }
      });

      const emailDelivery = res.data?.data?.emailDelivery || res.data?.emailDelivery || null;
      let deliveryStatus = 'ACCEPTED';
      if (emailDelivery && emailDelivery.delivered === true) {
        deliveryStatus = 'DELIVERED';
      } else if (emailDelivery && emailDelivery.sent === true) {
        deliveryStatus = 'SENT';
      } else if (emailDelivery && emailDelivery.sent === false) {
        deliveryStatus = 'PARTIAL_FAILURE';
      } else if (!safeEmail) {
        deliveryStatus = 'ACCEPTED';
      }

      const notifId = res.data?.data?.id || envelope.notificationId;
      deliveryLedger.set(notifId, {
        status: deliveryStatus,
        eventType,
        recipientEmail: safeEmail,
        updatedAt: new Date().toISOString()
      });

      await recordNotificationHistoryEntry({
        envelope,
        eventType,
        organisationId,
        recipientEmail: safeEmail,
        recipientName,
        recipientUserId,
        title,
        message,
        payload,
        requestId,
        deliveryStatus,
        provider: 'NOTIFICATION_SERVICE',
        providerMessageId: notifId
      });

      return {
        requestAccepted: true,
        deliveryStatus,
        delivered: deliveryStatus === 'DELIVERED',
        emailSent: emailDelivery ? Boolean(emailDelivery.sent) : null,
        mode: 'live',
        notificationId: notifId
      };
    } catch (err) {
      // Phase 3.F & 6: Notification failures must NEVER mark successful Recruitment operations as failed
      // and must NEVER log sensitive tokens/credentials.
      const isTimeout = Boolean(err?.details?.timeout);
      const deliveryStatus = isTimeout ? 'UNKNOWN' : 'FAILED';
      logger.warn(
        {
          eventType,
          organisationId,
          requestId,
          deliveryStatus,
          statusCode: err.statusCode || 503,
          code: err.code || 'NOTIFICATION_FAILED'
        },
        `[Live Notification Adapter] Notification dispatch ${deliveryStatus.toLowerCase()}: ${err.message}`
      );
      return {
        requestAccepted: false,
        deliveryStatus,
        delivered: false,
        mode: 'live',
        error: err.message,
        notificationId: envelope.notificationId
      };
    }
  }

  const emailAdapter = require('../email/email.adapter');
  const activeEmailCfg = typeof env.buildEmailConfig === 'function'
    ? env.buildEmailConfig(process.env)
    : env.email;
  const hasTestTransport = typeof emailAdapter.hasTestEmailTransport === 'function'
    ? emailAdapter.hasTestEmailTransport()
    : false;
  const isDirectEmailConfigured = hasTestTransport || (activeEmailCfg && activeEmailCfg.provider && activeEmailCfg.provider !== 'DISABLED');

  let emailDispatchResult = null;
  let deliveryStatus = 'ACCEPTED';

  if (recipientEmail) {
    emailDispatchResult = await dispatchDirectEmail({
      eventType,
      organisationId,
      recipientEmail,
      recipientName,
      payload,
      title,
      message,
      requestId
    });
    deliveryStatus = 'ACCEPTED';
  }

  dispatchedNotifications.push({ ...envelope, emailDispatchResult });
  deliveryLedger.set(envelope.notificationId, {
    status: deliveryStatus,
    eventType,
    recipientEmail,
    providerMessageId: emailDispatchResult?.messageId || null,
    updatedAt: new Date().toISOString()
  });

  await recordNotificationHistoryEntry({
    envelope,
    eventType,
    organisationId,
    recipientEmail,
    recipientName,
    recipientUserId,
    title,
    message,
    payload,
    requestId,
    deliveryStatus,
    provider: isDirectEmailConfigured ? (activeEmailCfg?.provider || 'SMTP') : 'STANDALONE',
    providerMessageId: emailDispatchResult?.messageId || null
  });

  logger.info(
    { eventType, organisationId, requestId, deliveryStatus },
    '[Standalone Notification Adapter] Event processed'
  );
  return {
    requestAccepted: true,
    deliveryStatus,
    delivered: emailDispatchResult ? Boolean(emailDispatchResult.delivered) : false,
    emailSent: emailDispatchResult ? Boolean(emailDispatchResult.delivered) : false,
    mode: 'standalone',
    notificationId: envelope.notificationId,
    messageId: emailDispatchResult?.messageId || null
  };
}

function getDispatchedNotifications(filter = {}) {
  return dispatchedNotifications.filter((item) => {
    if (filter.eventType && item.eventType !== filter.eventType) return false;
    if (filter.recipientEmail && item.recipientEmail !== filter.recipientEmail) return false;
    if (filter.organisationId && item.organisationId !== filter.organisationId) return false;
    return true;
  });
}

function clearDispatchedNotifications() {
  dispatchedNotifications.length = 0;
  deliveryLedger.clear();
}

function recordDeliveryConfirmation(notificationId, { status = 'DELIVERED', metadata = {} } = {}) {
  const existing = deliveryLedger.get(notificationId);
  if (!existing) {
    logger.warn({ notificationId, status }, '[Notification Adapter] Rejecting delivery confirmation for unknown/unrelated notification');
    return null;
  }
  const updated = {
    ...existing,
    status,
    confirmedAt: new Date().toISOString(),
    metadata: { ...(existing.metadata || {}), ...metadata }
  };
  deliveryLedger.set(notificationId, updated);
  logger.info({ notificationId, status }, '[Notification Adapter] Recorded verified provider delivery confirmation');

  try {
    const notifRepo = require('../../modules/notificationHistory/notificationHistory.repository');
    notifRepo.updateDeliveryStatus(notificationId, {
      deliveryStatus: status,
      metadata: updated.metadata
    }).catch((dbErr) => {
      logger.warn({ err: dbErr.message, notificationId }, '[Notification Adapter] Async DB delivery update failed');
    });
  } catch (_e) {}

  return updated;
}

function getDeliveryStatus(notificationId) {
  return deliveryLedger.get(notificationId) || null;
}

module.exports = {
  NOTIFICATION_EVENTS,
  buildNotificationCopy,
  dispatchNotification,
  getDispatchedNotifications,
  clearDispatchedNotifications,
  recordDeliveryConfirmation,
  getDeliveryStatus
};
