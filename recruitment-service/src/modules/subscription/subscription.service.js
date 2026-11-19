const { withTransaction, getModels } = require('../../config/database');
const env = require('../../config/env');
const logger = require('../../config/logger');
const {
  BadRequestError,
  ConflictError,
  NotFoundError
} = require('../../utils/AppError');
const { generateSecureToken, sha256 } = require('../../utils/crypto');
const { parsePagination, buildPaginationMeta } = require('../../utils/pagination');
const subscriptionRepo = require('./subscription.repository');
const auditService = require('../audit/audit.service');
const notificationAdapter = require('../../integrations/notification/notification.adapter');
const platformAdapter = require('../../integrations/platform/platform.adapter');
const authAdapter = require('../../integrations/auth/auth.adapter');
const employeeAdapter = require('../../integrations/employee/employee.adapter');
const organisationAdapter = require('../../integrations/organisation/organisation.adapter');
const storageAdapter = require('../../integrations/storage/storage.adapter');
const { seedOrganisationRoles } = require('../../db/seed');

// Modular responsibility imports
const {
  RECRUITMENT_PLANS,
  PLAN_PRICING,
  ACTIVATION_LIFECYCLE_STATUS
} = require('./subscription.constants');

const {
  resolvePlan,
  computeActivationStatus,
  sanitizeSubscription
} = require('./subscription.helpers');

const organisationProvisioningService = require('./organisationProvisioning.service');
const activationService = require('./activation.service');
const paymentManagementService = require('./paymentManagement.service');

const verificationInFlight = new Set();

function getTreasuryConfig() {
  if (typeof env.buildTreasuryConfig === 'function') {
    return env.buildTreasuryConfig(process.env);
  }
  return env.treasury || {};
}

function isTreasuryConfigured(treasury) {
  if (typeof env.isTreasuryConfigured === 'function') {
    return env.isTreasuryConfigured(treasury);
  }
  return Boolean(
    treasury &&
    treasury.bankName &&
    treasury.accountNumber &&
    treasury.accountNumber.length >= 4 &&
    treasury.ifscCode &&
    treasury.beneficiaryName
  );
}

function resolveSafePaymentInstructions(storedInstructions, sub) {
  const treasury = getTreasuryConfig();
  const hasValidConfig = isTreasuryConfigured(treasury);

  const isINR = (sub.currency || 'INR') === 'INR';
  const resolved = resolvePlan(sub.planCode);
  const amountFormatted = isINR
    ? `₹${(sub.amountCents / 100).toLocaleString('en-IN')}`
    : `${sub.currency} ${(sub.amountCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  const paymentMemo = `NEXNUV-REC-${sub.id.slice(0, 8).toUpperCase()}`;

  if (!hasValidConfig) {
    return {
      planCode: resolved.code,
      planName: resolved.name,
      billingCycle: sub.billingCycle,
      amountFormatted,
      paymentMemo,
      beneficiaryReference: sub.organisationName,
      isAvailable: false,
      unavailableReason: 'Payment instructions are temporarily unavailable. Please contact the platform administrator.',
      instructions: [
        'Payment instructions are temporarily unavailable. Please contact the platform administrator to obtain official treasury remittance details.'
      ]
    };
  }

  const maskedAcc = '****' + treasury.accountNumber.slice(-4);
  return {
    planCode: resolved.code,
    planName: resolved.name,
    billingCycle: sub.billingCycle,
    amountFormatted,
    bankName: treasury.bankName,
    accountName: treasury.beneficiaryName,
    accountNumberMasked: maskedAcc,
    ifscCode: treasury.ifscCode,
    upiId: treasury.upiId || undefined,
    paymentMemo,
    beneficiaryReference: sub.organisationName,
    isAvailable: true,
    instructions: [
      'Transfer the exact subscription amount using UPI / IMPS / NEFT / RTGS with the Payment Memo included.',
      'Upload your transaction confirmation receipt and enter the unique Payment Reference below.',
      'Platform Admin verification activates your organisation tenant and dispatches a secure passwordless invitation link.'
    ]
  };
}

function buildPaymentInstructions({ organisationName, amountCents, currency, billingCycle, subscriptionId, planCode }) {
  return resolveSafePaymentInstructions(null, {
    id: subscriptionId,
    organisationName,
    amountCents,
    currency,
    billingCycle,
    planCode
  });
}

async function createSubscriptionRequest(input, context = {}) {
  const idempotencyKey = context.idempotencyKey || input.idempotencyKey || null;

  if (idempotencyKey) {
    const existing = await subscriptionRepo.findSubscriptionByIdempotencyKey(idempotencyKey);
    if (existing) {
      return { subscription: existing, idempotentReplay: true };
    }
  }

  const resolved = resolvePlan(input.planCode);
  const planTier = PLAN_PRICING[resolved.code];
  if (!planTier) {
    throw new BadRequestError('Unsupported subscription plan code');
  }
  const cycle = (input.billingCycle || 'ANNUAL').toUpperCase();
  const pricing = planTier[cycle];
  if (!pricing) {
    throw new BadRequestError('Unsupported billing cycle');
  }

  const subscription = await withTransaction(async (tx) => {
    const created = await subscriptionRepo.createSubscription(
      {
        organisationName: input.organisationName.trim(),
        organisationDomain: input.organisationDomain.trim().toLowerCase(),
        industry: input.industry.trim(),
        companySize: input.companySize.trim(),
        adminName: input.adminName.trim(),
        adminEmail: input.adminEmail.trim().toLowerCase(),
        planCode: resolved.code,
        billingCycle: cycle,
        amountCents: pricing.amountCents,
        currency: pricing.currency,
        status: 'PENDING_PAYMENT',
        paymentInstructions: {},
        idempotencyKey
      },
      tx
    );

    const instructions = buildPaymentInstructions({
      organisationName: created.organisationName,
      amountCents: pricing.amountCents,
      currency: pricing.currency,
      billingCycle: cycle,
      subscriptionId: created.id,
      planCode: resolved.code
    });

    const updated = await subscriptionRepo.updateSubscription(
      created.id,
      { paymentInstructions: instructions },
      tx
    );

    await auditService.recordAudit(
      {
        entityType: 'SUBSCRIPTION',
        entityId: updated.id,
        action: 'SUBSCRIPTION_REQUEST_CREATED',
        requestId: context.requestId,
        ipAddress: context.ipAddress,
        afterState: {
          organisationName: updated.organisationName,
          adminEmail: updated.adminEmail,
          status: updated.status
        }
      },
      tx
    );

    return updated;
  });

  await notificationAdapter.dispatchNotification({
    eventType: 'SUBSCRIPTION_SUBMITTED',
    recipientEmail: subscription.adminEmail,
    recipientName: subscription.adminName,
    requestId: context.requestId,
    payload: {
      subscriptionId: subscription.id,
      organisationName: subscription.organisationName,
      paymentInstructions: subscription.paymentInstructions
    }
  });

  return { subscription, idempotentReplay: false };
}

async function getSubscriptionStatus(subscriptionId) {
  const sub = await subscriptionRepo.findSubscriptionById(subscriptionId);
  if (!sub) {
    throw new NotFoundError('Subscription request not found');
  }
  return {
    id: sub.id,
    organisationId: sub.organisationId,
    organisationName: sub.organisationName,
    organisationDomain: sub.organisationDomain,
    adminName: sub.adminName,
    adminEmail: sub.adminEmail,
    planCode: sub.planCode,
    billingCycle: sub.billingCycle,
    amountCents: sub.amountCents,
    currency: sub.currency,
    status: sub.status,
    paymentInstructions: resolveSafePaymentInstructions(sub.paymentInstructions, sub),
    rejectedReason: sub.rejectedReason,
    startsAt: sub.startsAt,
    expiresAt: sub.expiresAt,
    activatedAt: sub.activatedAt,
    createdAt: sub.createdAt,
    payments: (sub.payments || []).map((p) => ({
      id: p.id,
      paymentReference: p.paymentReference,
      paymentMethod: p.paymentMethod,
      amountCents: p.amountCents,
      currency: p.currency,
      proofFileName: p.proofFileName,
      status: p.status,
      verifiedAt: p.verifiedAt,
      rejectionReason: p.rejectionReason,
      createdAt: p.createdAt
    }))
  };
}

async function listPlatformAdminQueue(query = {}) {
  const { page, limit, skip } = parsePagination(query);
  const { items, total } = await subscriptionRepo.listSubscriptions({
    search: query.search,
    status: query.status,
    archived: query.archived,
    skip,
    take: limit
  });
  const sanitized = items.map(({ activationTokenHash: _hidden, payments = [], ...safeSub }) => ({
    ...safeSub,
    activationStatus: computeActivationStatus(safeSub),
    payments: payments.map((payment) => ({
      ...payment,
      proofDownloadUrl: payment.proofFileKey
        ? storageAdapter.buildSignedDownloadUrl({
            storageKey: payment.proofFileKey,
            fileName: payment.proofFileName,
            mimeType: payment.proofMimeType,
            organisationId: null,
            docScope: 'SUBSCRIPTION_PROOF'
          })
        : null
    }))
  }));
  return buildPaginationMeta({ items: sanitized, limit, total, page });
}

async function verifySubscriptionPayment(subscriptionId, input, context = {}) {
  if (verificationInFlight.has(subscriptionId)) {
    throw new ConflictError(
      'Payment verification is already in progress for this subscription',
      'VERIFICATION_IN_FLIGHT'
    );
  }

  verificationInFlight.add(subscriptionId);
  try {
    const adminActorId = context.actorUserId || null;
    const { Subscription, SubscriptionPayment } = getModels();

    let lockedSub;
    let targetPayment;
    let rejectionReason = null;

    // Phase 1 (Transactional Validation & Atomic Claim):
    const claimResult = await withTransaction(async (tx) => {
      const sub = await Subscription.findByPk(subscriptionId, {
        transaction: tx,
        lock: tx.LOCK.UPDATE
      });

      if (!sub) {
        throw new NotFoundError('Subscription not found');
      }

      const isRetryableFailed = sub.status === 'APPROVED' && sub.provisioningStatus === 'FAILED';
      if (sub.status !== 'PENDING_VERIFICATION' && !isRetryableFailed) {
        throw new ConflictError(
          `Duplicate or invalid verification attempt: subscription is currently ${sub.status}`,
          'ALREADY_VERIFIED_OR_INVALID_STATE'
        );
      }

      const paymentWhere = input.paymentId
        ? { id: input.paymentId, subscriptionId }
        : { subscriptionId };

      const payment = await SubscriptionPayment.findOne({
        where: paymentWhere,
        order: [['createdAt', 'DESC']],
        transaction: tx,
        lock: tx.LOCK.UPDATE
      });

      if (!payment) {
        throw new BadRequestError('No payment proof record found for this subscription');
      }

      if (payment.status !== 'SUBMITTED' && !isRetryableFailed) {
        throw new ConflictError(
          `Payment ${payment.paymentReference} has already been ${payment.status}`,
          'DUPLICATE_PAYMENT_VERIFICATION'
        );
      }

      targetPayment = payment;

      if (input.decision === 'REJECT') {
        rejectionReason = input.reason || 'Payment proof could not be verified.';
        await subscriptionRepo.updatePayment(
          payment.id,
          {
            status: 'REJECTED',
            verifiedBy: adminActorId,
            verifiedAt: new Date(),
            rejectionReason
          },
          tx
        );

        const updatedSub = await subscriptionRepo.updateSubscription(
          sub.id,
          {
            status: 'REJECTED',
            rejectedReason: rejectionReason,
            provisioningStatus: 'FAILED',
            provisioningError: rejectionReason
          },
          tx
        );

        await auditService.recordAudit(
          {
            actorUserId: adminActorId,
            actorRole: 'PLATFORM_ADMIN',
            entityType: 'SUBSCRIPTION',
            entityId: sub.id,
            action: 'PAYMENT_REJECTED',
            requestId: context.requestId,
            beforeState: { status: sub.status },
            afterState: { status: 'REJECTED', rejectionReason }
          },
          tx
        );

        return { decision: 'REJECT', sub: updatedSub };
      }

      // Decision APPROVE:
      await subscriptionRepo.updatePayment(
        payment.id,
        {
          status: 'VERIFIED',
          verifiedBy: adminActorId,
          verifiedAt: new Date()
        },
        tx
      );

      const claimedSub = await subscriptionRepo.updateSubscription(
        sub.id,
        {
          status: 'APPROVED',
          provisioningStatus: 'PROVISIONING',
          provisioningError: null
        },
        tx
      );

      await auditService.recordAudit(
        {
          actorUserId: adminActorId,
          actorRole: 'PLATFORM_ADMIN',
          entityType: 'SUBSCRIPTION',
          entityId: sub.id,
          action: 'PAYMENT_VERIFIED_PROVISIONING_STARTED',
          requestId: context.requestId,
          beforeState: { status: sub.status },
          afterState: { status: 'APPROVED', provisioningStatus: 'PROVISIONING' }
        },
        tx
      );

      lockedSub = claimedSub;
      return { decision: 'APPROVE', sub: claimedSub };
    });

    if (claimResult.decision === 'REJECT') {
      try {
        await notificationAdapter.dispatchNotification({
          eventType: 'PAYMENT_REJECTED',
          recipientEmail: claimResult.sub.adminEmail,
          recipientName: claimResult.sub.adminName,
          requestId: context.requestId,
          payload: {
            subscriptionId: claimResult.sub.id,
            paymentReference: targetPayment.paymentReference,
            reason: rejectionReason
          }
        });
      } catch (notifErr) {
        logger.warn({ err: notifErr.message, subscriptionId: claimResult.sub.id }, 'Notification dispatch error on PAYMENT_REJECTED');
      }

      return { subscription: claimResult.sub };
    }

    // Phase 2 (Idempotent External Provisioning via Dedicated Service):
    const sub = lockedSub;
    const provisionedOrgId = await organisationProvisioningService.provisionTenantOrganisation(sub, context);

    const activationToken = generateSecureToken(32);
    const activationTokenHash = sha256(activationToken);
    const activationExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    // Calculate persisted subscription lifecycle dates
    const durationDays = PLAN_PRICING[sub.planCode]?.[sub.billingCycle]?.durationDays || (sub.billingCycle === 'MONTHLY' ? 30 : 365);
    const startsAt = sub.startsAt ? new Date(sub.startsAt) : new Date();
    const expiresAt = sub.expiresAt ? new Date(sub.expiresAt) : new Date(startsAt.getTime() + durationDays * 24 * 60 * 60 * 1000);

    // Phase 3 (Finalize Provisioned Subscription State):
    const updated = await withTransaction(async (tx) => {
      const updatedSub = await subscriptionRepo.updateSubscription(
        sub.id,
        {
          organisationId: provisionedOrgId,
          status: 'APPROVED',
          provisioningStatus: 'PROVISIONED',
          provisioningError: null,
          approvedBy: adminActorId,
          approvedAt: new Date(),
          startsAt,
          expiresAt,
          activationTokenHash,
          activationExpiresAt,
          invitationSentAt: new Date()
        },
        tx
      );

      await auditService.recordAudit(
        {
          organisationId: provisionedOrgId,
          actorUserId: adminActorId,
          actorRole: 'PLATFORM_ADMIN',
          entityType: 'SUBSCRIPTION',
          entityId: sub.id,
          action: 'PAYMENT_APPROVED_AND_ORG_PROVISIONED',
          requestId: context.requestId,
          beforeState: { status: 'PENDING_VERIFICATION' },
          afterState: {
            status: 'APPROVED',
            organisationId: provisionedOrgId,
            provisioningStatus: 'PROVISIONED',
            startsAt: startsAt.toISOString(),
            expiresAt: expiresAt.toISOString()
          }
        },
        tx
      );

      return updatedSub;
    });

    const invitation = await authAdapter.sendAccountActivationInvitation({
      organisationId: provisionedOrgId,
      email: sub.adminEmail,
      fullName: sub.adminName,
      activationToken,
      expiresAt: activationExpiresAt
    });

    const planInfo = resolvePlan(sub.planCode);

    // Fast parallel dispatch: both notifications are triggered concurrently to minimize approval latency
    await Promise.allSettled([
      notificationAdapter.dispatchNotification({
        eventType: 'PAYMENT_APPROVED',
        organisationId: provisionedOrgId,
        recipientEmail: sub.adminEmail,
        recipientName: sub.adminName,
        requestId: context.requestId,
        payload: {
          subscriptionId: sub.id,
          organisationName: sub.organisationName,
          paymentReference: targetPayment.paymentReference,
          planCode: sub.planCode,
          planName: planInfo.name,
          startsAt: startsAt.toISOString(),
          expiresAt: expiresAt.toISOString()
        }
      }).catch((notifErr) => {
        logger.warn({ err: notifErr.message, subscriptionId: sub.id }, 'Notification dispatch error on PAYMENT_APPROVED');
      }),
      notificationAdapter.dispatchNotification({
        eventType: 'ACCOUNT_INVITATION',
        organisationId: provisionedOrgId,
        recipientEmail: sub.adminEmail,
        recipientName: sub.adminName,
        requestId: context.requestId,
        payload: {
          subscriptionId: sub.id,
          organisationId: provisionedOrgId,
          organisationName: sub.organisationName,
          planCode: sub.planCode,
          planName: planInfo.name,
          loginUrl: `${env.clientAppUrl}/login`,
          activationLink: invitation.activationLink,
          expiresAt: activationExpiresAt.toISOString(),
          expiresInHours: 48,
          startsAt: startsAt.toISOString(),
          planExpiresAt: expiresAt.toISOString(),
          subscriptionStatus: 'Approved / Pending Activation',
          instructions: 'Please set your secure Organisation Admin password to access your recruitment workspace.'
        }
      }).catch((notifErr) => {
        logger.warn({ err: notifErr.message, subscriptionId: sub.id }, 'Notification dispatch error on ACCOUNT_INVITATION');
      })
    ]);

    const { activationTokenHash: _hiddenVerify, ...safeUpdated } = updated;
    return {
      subscription: {
        ...safeUpdated,
        activationStatus: computeActivationStatus(safeUpdated)
      },
      invitationPreview: process.env.NODE_ENV === 'production' ? undefined : { activationToken, activationLink: invitation.activationLink }
    };
  } finally {
    verificationInFlight.delete(subscriptionId);
  }
}

async function recordNotificationDeliveryWebhook(payload = {}, context = {}) {
  const { notificationId, event, messageId, timestamp } = payload;
  const targetId = notificationId || messageId;
  if (!targetId) {
    throw new BadRequestError('notificationId or messageId is required for delivery webhook');
  }

  const cleanEvent = String(event || '').toLowerCase().trim();
  let status = 'ACCEPTED';
  if (['delivered', 'email.delivered'].includes(cleanEvent)) {
    status = 'DELIVERED';
  } else if (['bounced', 'failed', 'dropped', 'complained', 'email.bounced'].includes(cleanEvent)) {
    status = 'FAILED';
  } else if (['sent', 'accepted', 'queued', 'email.sent'].includes(cleanEvent)) {
    status = 'SENT';
  } else {
    status = event || 'CONFIRMED';
  }

  const recorded = notificationAdapter.recordDeliveryConfirmation(targetId, {
    status,
    metadata: {
      event,
      timestamp,
      receivedAt: new Date().toISOString()
    }
  });

  if (!recorded) {
    throw new NotFoundError(
      `No notification record found matching identifier '${targetId}'. Webhook event cannot update an unrelated or unknown notification.`
    );
  }

  await auditService.recordAudit({
    entityType: 'NOTIFICATION',
    entityId: targetId,
    action: status === 'DELIVERED' ? 'NOTIFICATION_DELIVERY_CONFIRMED' : 'NOTIFICATION_DELIVERY_UPDATED',
    requestId: context.requestId,
    afterState: { status, event, timestamp }
  });

  return { recorded: true, status, notificationId: targetId };
}

async function activateFreeTrial(input, context = {}) {
  const { EmployeeRoleAssignment } = getModels();

  const organisationName = input.organisationName?.trim();
  const organisationDomain = input.organisationDomain?.trim().toLowerCase();
  const adminName = input.adminName?.trim();
  const adminEmail = input.adminEmail?.trim().toLowerCase();
  const industry = input.industry?.trim() || 'Technology';
  const companySize = input.companySize?.trim() || '11-50';
  const password = input.password?.trim() || null;

  if (!organisationName || !organisationDomain || !adminName || !adminEmail) {
    throw new BadRequestError('Organisation name, domain, admin name, and admin email are required');
  }

  const existingTrial = await subscriptionRepo.findActiveOrPastTrialByDomainOrEmail(organisationDomain, adminEmail);
  if (existingTrial) {
    throw new ConflictError(
      'A 15-day free trial has already been activated for this organisation domain or administrator email. Please select Basic, Advanced, or Enterprise to subscribe.',
      'TRIAL_ALREADY_USED'
    );
  }

  const startsAt = new Date();
  const trialDurationDays = 15;
  const expiresAt = new Date(startsAt.getTime() + trialDurationDays * 24 * 60 * 60 * 1000);

  const orgResult = await platformAdapter.provisionOrganisation({
    organisationName,
    organisationDomain,
    industry,
    companySize,
    adminEmail,
    adminName,
    planCode: 'RECRUITMENT_ADVANCED',
    billingCycle: 'MONTHLY',
    isTrial: true,
    startsAt,
    trialEndsAt: expiresAt,
    requestId: context.requestId
  });

  const organisationId = orgResult.organisationId;

  const adminEmployee = await employeeAdapter.createEmployee(
    organisationId,
    {
      fullName: adminName,
      email: adminEmail,
      department: 'Executive & Talent',
      designation: 'Organisation Administrator',
      status: 'ACTIVE'
    },
    { actorUserId: 'svc-recruitment', requestId: context.requestId }
  );

  const trialPassword = password || `NexnuvTrial_${generateSecureToken(6)}!`;
  const authUser = await authAdapter.provisionOrgAdminAccount({
    organisationId,
    employeeId: adminEmployee.employeeId,
    email: adminEmail,
    fullName: adminName,
    password: trialPassword,
    requestId: context.requestId
  });

  employeeAdapter.updateStandaloneEmployeeAuthId(organisationId, adminEmployee.employeeId, authUser.userId, 'ACTIVE');
  organisationAdapter.seedOrganisationProfile(organisationId, {
    name: organisationName,
    domain: organisationDomain,
    industry,
    companySize,
    status: 'ACTIVE'
  });

  const subscription = await withTransaction(async (tx) => {
    const rolesByCode = await seedOrganisationRoles(organisationId, tx);
    const orgAdminRole = rolesByCode.ORGANISATION_ADMIN;

    await EmployeeRoleAssignment.create(
      {
        organisationId,
        employeeId: adminEmployee.employeeId,
        authUserId: authUser.userId,
        roleId: orgAdminRole.id,
        isActive: true,
        assignedBy: authUser.userId
      },
      { transaction: tx }
    );

    const createdSub = await subscriptionRepo.createSubscription(
      {
        organisationId,
        organisationName,
        organisationDomain,
        industry,
        companySize,
        adminName,
        adminEmail,
        planCode: 'RECRUITMENT_ADVANCED',
        billingCycle: 'MONTHLY',
        amountCents: 0,
        currency: 'INR',
        status: 'TRIAL',
        startsAt,
        expiresAt,
        activatedAt: startsAt,
        paymentInstructions: {
          isTrial: true,
          trialDays: trialDurationDays,
          startsAt: startsAt.toISOString(),
          expiresAt: expiresAt.toISOString()
        }
      },
      tx
    );

    await auditService.recordAudit(
      {
        organisationId,
        actorUserId: authUser.userId,
        actorEmployeeId: adminEmployee.employeeId,
        actorRole: 'ORGANISATION_ADMIN',
        entityType: 'SUBSCRIPTION',
        entityId: createdSub.id,
        action: 'FREE_TRIAL_ACTIVATED',
        requestId: context.requestId,
        afterState: {
          organisationId,
          organisationName,
          status: 'TRIAL',
          startsAt,
          expiresAt
        }
      },
      tx
    );

    return createdSub;
  });

  await notificationAdapter.dispatchNotification({
    eventType: 'TRIAL_ACTIVATED',
    recipientEmail: adminEmail,
    recipientName: adminName,
    requestId: context.requestId,
    payload: {
      subscriptionId: subscription.id,
      organisationName,
      startsAt: startsAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      daysRemaining: trialDurationDays,
      loginUrl: process.env.CLIENT_ORIGIN ? `${process.env.CLIENT_ORIGIN}/login` : 'http://localhost:5173/login'
    }
  });

  const accessToken =
    authUser.token ||
    authAdapter.signAccessToken({
      sub: authUser.userId,
      email: adminEmail,
      name: adminName,
      organisationId,
      employeeId: adminEmployee.employeeId,
      userType: 'ORG_USER',
      roles: ['ORGANISATION_ADMIN']
    });

  return {
    subscription,
    token: accessToken,
    user: {
      userId: authUser.userId,
      email: adminEmail,
      name: adminName,
      organisationId,
      employeeId: adminEmployee.employeeId,
      userType: 'ORG_USER',
      roles: ['ORGANISATION_ADMIN']
    },
    trial: {
      startsAt,
      expiresAt,
      daysRemaining: trialDurationDays
    }
  };
}

async function getAvailablePlans(context = {}) {
  let platformPlans = [];
  try {
    platformPlans = await platformAdapter.listPlans({ requestId: context.requestId });
  } catch (_err) {
    platformPlans = [];
  }

  const tiers = [
    {
      code: 'RECRUITMENT_BASIC',
      name: 'Basic',
      description: 'Essential recruitment features for small businesses.',
      trialDays: 15,
      isTrialEligible: true,
      pricing: {
        monthly: { amountCents: 99900, amount: 999, currency: 'INR' },
        annual: { amountCents: 999900, amount: 9999, currency: 'INR', monthlyEquivalent: 833.25, savingsPercent: 17 }
      },
      features: RECRUITMENT_PLANS.RECRUITMENT_BASIC.features,
      limits: { jobPostings: 'Unlimited', applicants: 'Up to 500 active', teamMembers: '5 seats' },
      isPopular: false
    },
    {
      code: 'RECRUITMENT_ADVANCED',
      name: 'Advanced',
      description: 'Complete recruitment workflow for growing organisations.',
      trialDays: 15,
      isTrialEligible: true,
      pricing: {
        monthly: { amountCents: 199900, amount: 1999, currency: 'INR' },
        annual: { amountCents: 1999900, amount: 19999, currency: 'INR', monthlyEquivalent: 1666.58, savingsPercent: 17 }
      },
      features: RECRUITMENT_PLANS.RECRUITMENT_ADVANCED.features,
      limits: { jobPostings: 'Unlimited', applicants: 'Up to 2,500 active', teamMembers: '25 seats' },
      isPopular: true
    },
    {
      code: 'RECRUITMENT_ENTERPRISE',
      name: 'Enterprise',
      description: 'Advanced recruitment capabilities for large organisations.',
      trialDays: 15,
      isTrialEligible: true,
      pricing: {
        monthly: { amountCents: 499900, amount: 4999, currency: 'INR' },
        annual: { amountCents: 4999900, amount: 49999, currency: 'INR', monthlyEquivalent: 4166.58, savingsPercent: 17 }
      },
      features: RECRUITMENT_PLANS.RECRUITMENT_ENTERPRISE.features,
      limits: { jobPostings: 'Unlimited', applicants: 'Unlimited', teamMembers: 'Unlimited' },
      isPopular: false
    }
  ];

  return {
    plans: tiers,
    trial: {
      name: '15-Day Free Trial',
      durationDays: 15,
      price: 0,
      currency: 'INR',
      description: 'Full access to Advanced tier features for 15 days. No payment details or automatic charges.',
      features: [
        '15 days full evaluation of Advanced tier',
        'Applicant Tracking System (ATS) pipeline',
        'Candidate Self-Service portal',
        'Structured interview scorecards',
        'Offer letter generation & approvals',
        'Full tenant isolation & security controls'
      ]
    },
    platformPlans: platformPlans.filter((p) => String(p.code || '').startsWith('RECRUITMENT_'))
  };
}

async function getOrganisationSubscriptionStatus(organisationId, context = {}) {
  if (!organisationId) {
    throw new BadRequestError('organisationId is required');
  }

  const latestSub = await subscriptionRepo.findLatestSubscriptionByOrganisationId(organisationId);

  let platformEntitlement = null;
  try {
    platformEntitlement = await platformAdapter.getOrganisationEntitlements(organisationId, { requestId: context.requestId });
  } catch (_err) {
    // Ignore in fallback mode
  }

  const now = new Date();
  const startsAt = latestSub?.startsAt || null;
  const expiresAt = latestSub?.expiresAt || null;
  const isTrial = latestSub?.status === 'TRIAL';

  let daysRemaining = 0;
  let isExpired = false;

  if (expiresAt) {
    const diffMs = new Date(expiresAt).getTime() - now.getTime();
    daysRemaining = Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
    isExpired = diffMs <= 0;
  }

  return {
    organisationId,
    subscriptionId: latestSub?.id || null,
    planCode: latestSub?.planCode || 'RECRUITMENT_ADVANCED',
    planName: resolvePlan(latestSub?.planCode).name,
    billingCycle: latestSub?.billingCycle || 'MONTHLY',
    status: latestSub?.status || 'TRIAL',
    isTrial,
    startsAt,
    expiresAt,
    daysRemaining,
    isExpired,
    canAccess: latestSub ? ((latestSub.status === 'ACTIVE' || latestSub.status === 'TRIAL') && !isExpired) : true,
    platformEntitlement
  };
}

async function updateSubscriptionLifecycleStatus(subscriptionId, status, context = {}) {
  const allowed = new Set(['ACTIVE', 'EXPIRED', 'SUSPENDED', 'CANCELLED']);
  if (!allowed.has(status)) {
    throw new BadRequestError(`Unsupported target lifecycle status: ${status}`);
  }
  const existing = await subscriptionRepo.findSubscriptionById(subscriptionId);
  if (!existing) {
    throw new NotFoundError('Subscription not found');
  }

  const updated = await subscriptionRepo.updateSubscription(subscriptionId, { status });
  if (existing.organisationId) {
    await organisationAdapter.updateOrganisationStatus(
      existing.organisationId,
      status === 'ACTIVE' ? 'active' : 'inactive',
      { requestId: context.requestId }
    );
  }
  await auditService.recordAudit({
    organisationId: existing.organisationId,
    actorUserId: context.actorUserId,
    actorRole: 'PLATFORM_ADMIN',
    entityType: 'SUBSCRIPTION',
    entityId: subscriptionId,
    action: `SUBSCRIPTION_STATUS_${status}`,
    requestId: context.requestId,
    beforeState: { status: existing.status },
    afterState: { status }
  });
  return updated;
}

async function archiveSubscriptionBooking(subscriptionId, input = {}, context = {}) {
  const reason = input.reason?.trim();
  if (!reason || reason.length < 5) {
    throw new BadRequestError('Mandatory archive reason must be at least 5 characters long');
  }

  const adminActorId = context.actorUserId || null;
  const { Subscription } = getModels();

  return withTransaction(async (tx) => {
    const sub = await Subscription.findByPk(subscriptionId, {
      transaction: tx,
      lock: tx.LOCK.UPDATE
    });

    if (!sub) {
      throw new NotFoundError('Subscription booking not found');
    }

    if (sub.isArchived) {
      const plainSub = sub.get({ plain: true });
      const { activationTokenHash: _hidden, ...safeSub } = plainSub;
      return {
        subscription: {
          ...safeSub,
          activationStatus: computeActivationStatus(safeSub)
        },
        idempotentReplay: true
      };
    }

    const beforeState = {
      isArchived: sub.isArchived,
      archivedAt: sub.archivedAt,
      archivedBy: sub.archivedBy,
      archiveReason: sub.archiveReason,
      status: sub.status
    };

    const archivedAt = new Date();
    await sub.update(
      {
        isArchived: true,
        archivedAt,
        archivedBy: adminActorId,
        archiveReason: reason
      },
      { transaction: tx }
    );

    await auditService.recordAudit(
      {
        organisationId: sub.organisationId || null,
        actorUserId: adminActorId,
        actorRole: 'PLATFORM_ADMIN',
        entityType: 'SUBSCRIPTION',
        entityId: sub.id,
        action: 'SUBSCRIPTION_BOOKING_ARCHIVED',
        requestId: context.requestId,
        beforeState,
        afterState: {
          isArchived: true,
          archivedAt,
          archivedBy: adminActorId,
          archiveReason: reason,
          status: sub.status
        }
      },
      tx
    );

    const plainSub = sub.get({ plain: true });
    const { activationTokenHash: _hidden, ...safeSub } = plainSub;

    return {
      subscription: {
        ...safeSub,
        activationStatus: computeActivationStatus(safeSub)
      },
      idempotentReplay: false
    };
  });
}

// Module Re-Exports ensuring 100% backward compatibility
module.exports = {
  // Constants
  RECRUITMENT_PLANS,
  PLAN_PRICING,
  ACTIVATION_LIFECYCLE_STATUS,

  // Helpers
  resolvePlan,
  computeActivationStatus,
  sanitizeSubscription,

  // Core Subscription Lifecycle
  createSubscriptionRequest,
  getSubscriptionStatus,
  listPlatformAdminQueue,
  verifySubscriptionPayment,
  recordNotificationDeliveryWebhook,
  activateFreeTrial,
  getAvailablePlans,
  getOrganisationSubscriptionStatus,
  updateSubscriptionLifecycleStatus,
  archiveSubscriptionBooking,

  // Delegated Payment Management Service
  submitPaymentProof: paymentManagementService.submitPaymentProof,
  listPlatformAdminPayments: paymentManagementService.listPlatformAdminPayments,
  voidSubscriptionPayment: paymentManagementService.voidSubscriptionPayment,

  // Delegated Activation Service
  resendActivationInvitation: activationService.resendActivationInvitation,
  activateOrganisationAdmin: activationService.activateOrganisationAdmin,
  inspectActivationToken: activationService.inspectActivationToken,

  // Delegated Organisation Provisioning Service
  provisionTenantOrganisation: organisationProvisioningService.provisionTenantOrganisation
};
