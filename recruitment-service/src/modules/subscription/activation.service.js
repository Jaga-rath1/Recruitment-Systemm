const { withTransaction, getModels } = require('../../config/database');
const env = require('../../config/env');
const logger = require('../../config/logger');
const {
  BadRequestError,
  ConflictError,
  NotFoundError
} = require('../../utils/AppError');
const { generateSecureToken, sha256 } = require('../../utils/crypto');
const subscriptionRepo = require('./subscription.repository');
const auditService = require('../audit/audit.service');
const notificationAdapter = require('../../integrations/notification/notification.adapter');
const authAdapter = require('../../integrations/auth/auth.adapter');
const employeeAdapter = require('../../integrations/employee/employee.adapter');
const organisationAdapter = require('../../integrations/organisation/organisation.adapter');
const { seedOrganisationRoles } = require('../../db/seed');
const { PLAN_PRICING } = require('./subscription.constants');
const { resolvePlan } = require('./subscription.helpers');

const activationInFlight = new Set();

/**
 * Inspects an activation token safely (for the password setup UI) without consuming it.
 * Never leaks the token or token hash back to the client.
 */
async function inspectActivationToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') {
    throw new BadRequestError('Activation token is required');
  }
  const tokenHash = sha256(rawToken.trim());
  const sub = await subscriptionRepo.findSubscriptionByActivationHash(tokenHash);
  if (!sub) {
    throw new NotFoundError('Invalid or already used activation invitation');
  }
  const isExpired = sub.activationExpiresAt && new Date(sub.activationExpiresAt) < new Date();
  if (isExpired) {
    throw new BadRequestError('Activation invitation has expired. Please contact support or request a new invitation.');
  }
  const planInfo = resolvePlan(sub.planCode);
  return {
    valid: true,
    organisationName: sub.organisationName,
    adminEmail: sub.adminEmail,
    planName: planInfo.name,
    planCode: sub.planCode,
    expiresAt: sub.activationExpiresAt,
    expiresInHours: Math.max(0, Math.round((new Date(sub.activationExpiresAt) - new Date()) / (3600 * 1000)))
  };
}

async function resendActivationInvitation(subscriptionId, context = {}) {
  const { Subscription } = getModels();

  let targetSub;
  let newToken;
  let newExpiresAt;

  await withTransaction(async (tx) => {
    const sub = await Subscription.findByPk(subscriptionId, {
      transaction: tx,
      lock: tx.LOCK.UPDATE
    });

    if (!sub) {
      throw new NotFoundError('Subscription not found');
    }

    if (sub.status === 'ACTIVE' || sub.activatedAt) {
      throw new ConflictError(
        'Subscription is already active and the Organisation Admin account has been activated',
        'ADMIN_ALREADY_ACTIVATED'
      );
    }

    if (sub.status !== 'APPROVED') {
      throw new ConflictError(
        `Cannot resend invitation: subscription status is currently ${sub.status}`,
        'INVALID_SUBSCRIPTION_STATE_FOR_RESEND'
      );
    }

    if (!sub.organisationId || sub.provisioningStatus !== 'PROVISIONED') {
      throw new BadRequestError(
        'Cannot resend invitation: organisation tenant has not completed provisioning',
        'PROVISIONING_INCOMPLETE'
      );
    }

    const adminActorId = context.actorUserId || null;
    newToken = generateSecureToken(32);
    const newHash = sha256(newToken);
    newExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const newResendCount = (sub.invitationResendCount || 0) + 1;

    await sub.update(
      {
        activationTokenHash: newHash,
        activationExpiresAt: newExpiresAt,
        invitationSentAt: new Date(),
        invitationResendCount: newResendCount
      },
      { transaction: tx }
    );

    await auditService.recordAudit(
      {
        organisationId: sub.organisationId,
        actorUserId: adminActorId,
        actorRole: 'PLATFORM_ADMIN',
        entityType: 'SUBSCRIPTION',
        entityId: sub.id,
        action: 'ACTIVATION_INVITATION_RESENT',
        requestId: context.requestId,
        ipAddress: context.ipAddress,
        afterState: {
          recipientEmail: sub.adminEmail,
          expiresAt: newExpiresAt.toISOString(),
          resendCount: newResendCount
        }
      },
      tx
    );

    targetSub = sub.toJSON();
  });

  const invitation = await authAdapter.sendAccountActivationInvitation({
    organisationId: targetSub.organisationId,
    email: targetSub.adminEmail,
    fullName: targetSub.adminName,
    activationToken: newToken,
    expiresAt: newExpiresAt
  });

  const planInfo = resolvePlan(targetSub.planCode);

  try {
    await notificationAdapter.dispatchNotification({
      eventType: 'ACCOUNT_INVITATION',
      organisationId: targetSub.organisationId,
      recipientEmail: targetSub.adminEmail,
      recipientName: targetSub.adminName,
      requestId: context.requestId,
      payload: {
        subscriptionId: targetSub.id,
        organisationId: targetSub.organisationId,
        organisationName: targetSub.organisationName,
        planCode: targetSub.planCode,
        planName: planInfo.name,
        loginUrl: `${env.clientAppUrl}/org-login`,
        activationLink: invitation.activationLink,
        expiresAt: newExpiresAt.toISOString(),
        expiresInHours: 48,
        startsAt: targetSub.startsAt ? new Date(targetSub.startsAt).toISOString() : null,
        planExpiresAt: targetSub.expiresAt ? new Date(targetSub.expiresAt).toISOString() : null,
        subscriptionStatus: targetSub.status || 'APPROVED',
        instructions: 'Your Organisation Admin activation invitation has been refreshed. Please set your secure password.'
      }
    });
  } catch (notifErr) {
    logger.warn({ err: notifErr.message, subscriptionId: targetSub.id }, 'Notification dispatch error on resend ACTIVATION_INVITATION');
  }

  const { activationTokenHash: _hiddenResend, ...safeResentSub } = targetSub;
  return {
    subscription: safeResentSub,
    invitationPreview: process.env.NODE_ENV === 'production' ? undefined : { activationToken: newToken, activationLink: invitation.activationLink }
  };
}

async function activateOrganisationAdmin({ activationToken, password }, context = {}) {
  const { EmployeeRoleAssignment, Subscription } = getModels();
  const tokenHash = sha256(activationToken);

  const sub = await subscriptionRepo.findSubscriptionByActivationHash(tokenHash);
  if (!sub) {
    throw new NotFoundError('Invalid or already used activation invitation');
  }
  if (sub.status !== 'APPROVED') {
    throw new ConflictError(`Subscription cannot be activated from status ${sub.status}`);
  }
  if (sub.activationExpiresAt && new Date(sub.activationExpiresAt) < new Date()) {
    throw new BadRequestError('Activation invitation has expired');
  }
  if (!sub.organisationId) {
    throw new BadRequestError('Organisation has not been provisioned yet');
  }
  if (activationInFlight.has(sub.id)) {
    throw new ConflictError('Activation invitation is already being processed or has been used');
  }

  activationInFlight.add(sub.id);
  try {
    const adminEmployee = await employeeAdapter.createEmployee(
      sub.organisationId,
      {
        fullName: sub.adminName,
        email: sub.adminEmail,
        department: 'Executive & Talent',
        designation: 'Organisation Administrator',
        status: 'ACTIVE'
      },
      { actorUserId: 'svc-recruitment', requestId: context.requestId }
    );

    const authUser = await authAdapter.provisionOrgAdminAccount({
      organisationId: sub.organisationId,
      employeeId: adminEmployee.employeeId,
      email: sub.adminEmail,
      fullName: sub.adminName,
      password,
      requestId: context.requestId
    });

    employeeAdapter.updateStandaloneEmployeeAuthId(sub.organisationId, adminEmployee.employeeId, authUser.userId, 'ACTIVE');
    organisationAdapter.seedOrganisationProfile(sub.organisationId, {
      name: sub.organisationName,
      domain: sub.organisationDomain,
      industry: sub.industry,
      companySize: sub.companySize,
      status: 'ACTIVE'
    });

    const durationDays = PLAN_PRICING[sub.planCode]?.[sub.billingCycle]?.durationDays || 365;
    const startsAt = sub.startsAt ? new Date(sub.startsAt) : new Date();
    const expiresAt = sub.expiresAt ? new Date(sub.expiresAt) : new Date(startsAt.getTime() + durationDays * 24 * 60 * 60 * 1000);

    const activatedSubscription = await withTransaction(async (tx) => {
      const rolesByCode = await seedOrganisationRoles(sub.organisationId, tx);
      const orgAdminRole = rolesByCode.ORGANISATION_ADMIN;

      const existingAssign = await EmployeeRoleAssignment.findOne({
        where: { organisationId: sub.organisationId, employeeId: adminEmployee.employeeId },
        transaction: tx
      });

      if (existingAssign) {
        await existingAssign.update(
          {
            authUserId: authUser.userId,
            roleId: orgAdminRole.id,
            isActive: true
          },
          { transaction: tx }
        );
      } else {
        await EmployeeRoleAssignment.create(
          {
            organisationId: sub.organisationId,
            employeeId: adminEmployee.employeeId,
            authUserId: authUser.userId,
            roleId: orgAdminRole.id,
            isActive: true,
            assignedBy: authUser.userId
          },
          { transaction: tx }
        );
      }

      const [affected] = await Subscription.update(
        {
          status: 'ACTIVE',
          activatedAt: new Date(),
          startsAt,
          expiresAt,
          activationTokenHash: null
        },
        {
          where: {
            id: sub.id,
            status: 'APPROVED',
            activationTokenHash: tokenHash
          },
          transaction: tx
        }
      );

      if (affected !== 1) {
        throw new ConflictError('Activation invitation has already been used');
      }

      const updatedSub = await subscriptionRepo.findSubscriptionById(sub.id, tx);

      await auditService.recordAudit(
        {
          organisationId: sub.organisationId,
          actorUserId: authUser.userId,
          actorRole: 'ORGANISATION_ADMIN',
          entityType: 'SUBSCRIPTION',
          entityId: sub.id,
          action: 'ORGANISATION_ADMIN_ACTIVATED',
          requestId: context.requestId,
          beforeState: { status: 'APPROVED' },
          afterState: { status: 'ACTIVE', activatedAt: startsAt.toISOString() }
        },
        tx
      );

      return updatedSub;
    });

    const token = authAdapter.signAccessToken({
      sub: authUser.userId,
      userId: authUser.userId,
      email: authUser.email,
      name: sub.adminName,
      organisationId: sub.organisationId,
      employeeId: adminEmployee.employeeId,
      roles: ['ORGANISATION_ADMIN'],
      userType: 'ORG_USER'
    });

    return {
      token,
      user: {
        userId: authUser.userId,
        id: authUser.userId,
        email: authUser.email,
        name: sub.adminName,
        roles: ['ORGANISATION_ADMIN'],
        organisationId: sub.organisationId,
        employeeId: adminEmployee.employeeId,
        userType: 'ORG_USER'
      },
      subscription: activatedSubscription
    };
  } finally {
    activationInFlight.delete(sub.id);
  }
}

module.exports = {
  inspectActivationToken,
  resendActivationInvitation,
  activateOrganisationAdmin
};
