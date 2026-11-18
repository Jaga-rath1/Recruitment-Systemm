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
    case 'APPLICATION_RECEIVED':
      return {
        title: `Application Received — ${payload.jobTitle || 'Open Role'}`,
        message: `Hello ${who}, your application (${payload.applicationReference || ''}) has been received.`
      };
    case 'CANDIDATE_SHORTLISTED':
      return {
        title: `Application Shortlisted — ${payload.jobTitle || ''}`,
        message: `Hello ${who}, congratulations — your application (${payload.applicationReference || ''}) has been shortlisted.`
      };
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
    if (!organisationId) {
      logger.info(
        { eventType, requestId },
        '[Live Notification Adapter] Skipped remote Notification Service dispatch for pre-tenant event without organisationId'
      );
      return {
        delivered: false,
        skipped: true,
        reason: 'NO_ORGANISATION_ID',
        mode: 'live',
        notificationId: envelope.notificationId
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
          message: message.slice(0, 5000),
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

  if (isDirectEmailConfigured && recipientEmail) {
    try {
      if (eventType === 'ACCOUNT_INVITATION') {
        emailDispatchResult = await emailAdapter.sendAccountActivationEmail({
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
        emailDispatchResult = await emailAdapter.sendEmployeeInvitationEmail({
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
      } else if (eventType === 'PASSWORD_RESET_REQUESTED') {
        const safeName = String(recipientName || 'User').replace(/[<>]/g, '');
        const safeOrg = String(payload.organisationName || 'your organisation').replace(/[<>]/g, '');
        const safeRole = String(payload.roleLabel || 'Organisation Admin').replace(/[<>]/g, '');
        const resetLink = payload.resetLink || `${env.clientAppUrl}/forgot-password`;
        const loginUrl = payload.loginUrl || `${env.clientAppUrl}/org-login`;
        const expiresText = payload.expiresInMinutes ? `${payload.expiresInMinutes} minutes` : '60 minutes';
        const html = `
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
        emailDispatchResult = await emailAdapter.sendTransactionalEmail({
          to: recipientEmail,
          subject: title,
          text: message,
          html,
          category: 'NOTIFICATION_PASSWORD_RESET_REQUESTED',
          requestId
        });
      } else {
        emailDispatchResult = await emailAdapter.sendTransactionalEmail({
          to: recipientEmail,
          subject: title,
          text: message,
          html: `<p>${message.replace(/\n/g, '<br/>')}</p>`,
          category: `NOTIFICATION_${eventType}`,
          requestId
        });
      }
      deliveryStatus = 'ACCEPTED';
    } catch (err) {
      logger.warn(
        { eventType, organisationId, requestId, err: err.message },
        '[Standalone Notification Adapter] Direct email dispatch failed, proceeding with recorded state'
      );
      deliveryStatus = 'ACCEPTED';
    }
  }

  dispatchedNotifications.push({ ...envelope, emailDispatchResult });
  deliveryLedger.set(envelope.notificationId, {
    status: deliveryStatus,
    eventType,
    recipientEmail,
    providerMessageId: emailDispatchResult?.messageId || null,
    updatedAt: new Date().toISOString()
  });

  // Persist to Recruitment Notification History for Platform Admin oversight
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
        : recipientUserId?.startsWith('cand')
        ? 'CANDIDATE'
        : 'EMPLOYEE',
      organisationId,
      organisationName: payload.organisationName || null,
      title,
      message,
      deliveryStatus,
      provider: isDirectEmailConfigured ? (activeEmailCfg?.provider || 'SMTP') : 'STANDALONE',
      providerMessageId: emailDispatchResult?.messageId || null,
      metadata: {
        ...payload,
        requestId,
        dispatchedAt: envelope.dispatchedAt
      }
    });
  } catch (dbErr) {
    logger.warn({ err: dbErr.message, notificationId: envelope.notificationId }, '[Notification Adapter] Could not persist notification history to DB');
  }

  logger.info(
    { eventType, organisationId, requestId, deliveryStatus },
    '[Standalone Notification Adapter] Event processed'
  );
  return {
    requestAccepted: true,
    deliveryStatus,
    delivered: false,
    emailSent: emailDispatchResult?.delivered || false,
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
