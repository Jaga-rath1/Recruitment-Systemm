'use strict';

const { Op } = require('sequelize');
const env = require('../../config/env');
const logger = require('../../config/logger');
const { getModels } = require('../../config/database');
const {
  BadRequestError,
  ConflictError,
  NotFoundError
} = require('../../utils/AppError');
const { generateSecureToken, sha256 } = require('../../utils/crypto');
const auditService = require('../audit/audit.service');
const { seedOrganisationRoles } = require('../../db/seed');
const activationService = require('./activation.service');
const organisationProvisioningService = require('./organisationProvisioning.service');
const employeeAdapter = require('../../integrations/employee/employee.adapter');
const authAdapter = require('../../integrations/auth/auth.adapter');
const notificationAdapter = require('../../integrations/notification/notification.adapter');
const { findSubscriptionByOrgOrSubId } = require('./platformAdminOrganisation.helpers');

async function resendPlatformOrgAdminActivation(id, context = {}) {
  const sub = await findSubscriptionByOrgOrSubId(id);
  if (!sub) {
    throw new NotFoundError('Organisation subscription record not found');
  }

  if (sub.status === 'ACTIVE' && sub.activatedAt) {
    throw new ConflictError(
      'Organisation Admin account has already been activated. Password reset flow can be used instead.',
      'ADMIN_ALREADY_ACTIVATED'
    );
  }

  const result = await activationService.resendActivationInvitation(sub.id, {
    actorUserId: context.actorUserId,
    requestId: context.requestId
  });

  await auditService.recordAudit({
    organisationId: sub.organisationId || null,
    actorUserId: context.actorUserId || null,
    actorRole: 'PLATFORM_ADMIN',
    entityType: 'ORGANISATION_ADMIN_ACCOUNT',
    entityId: sub.id,
    action: 'ORGANISATION_ADMIN_INVITATION_RESENT',
    requestId: context.requestId,
    afterState: {
      adminEmail: sub.adminEmail,
      invitationResendCount: result.subscription.invitationResendCount,
      expiresAt: result.subscription.activationExpiresAt
    }
  });

  return {
    success: true,
    message: `Activation invitation email successfully dispatched to ${sub.adminEmail}`,
    data: {
      adminEmail: sub.adminEmail,
      invitationSentAt: result.subscription.invitationSentAt,
      invitationExpiresAt: result.subscription.activationExpiresAt,
      invitationResendCount: result.subscription.invitationResendCount
    }
  };
}

async function recoverPlatformOrgAdminAccount(id, context = {}) {
  const { EmployeeRoleAssignment } = getModels();
  const sub = await findSubscriptionByOrgOrSubId(id);
  if (!sub) {
    throw new NotFoundError('Organisation subscription record not found');
  }

  const adminActorId = context.actorUserId || 'svc-platform-admin';

  // Case 1: Provisioning failed or tenant organisationId not generated
  if (sub.provisioningStatus === 'FAILED' || !sub.organisationId) {
    const provisionedOrgId = await organisationProvisioningService.provisionTenantOrganisation(sub, context);
    await sub.update({
      organisationId: provisionedOrgId,
      provisioningStatus: 'PROVISIONED',
      provisioningError: null
    });

    const resendRes = await activationService.resendActivationInvitation(sub.id, context);

    await auditService.recordAudit({
      organisationId: provisionedOrgId,
      actorUserId: adminActorId,
      actorRole: 'PLATFORM_ADMIN',
      entityType: 'ORGANISATION',
      entityId: sub.id,
      action: 'ORGANISATION_PROVISIONING_RECOVERED',
      requestId: context.requestId,
      afterState: { organisationId: provisionedOrgId, provisioningStatus: 'PROVISIONED' }
    });

    return {
      success: true,
      message: `Organisation tenant provisioned and activation invitation dispatched to ${sub.adminEmail}`,
      recoveredStatus: 'PROVISIONED',
      adminAccountStatus: 'INVITED',
      data: resendRes.subscription
    };
  }

  // Case 2: Organisation is provisioned, but has missing EmployeeRoleAssignment
  const existingAssignment = await EmployeeRoleAssignment.findOne({
    where: {
      organisationId: sub.organisationId
    }
  });

  if (!existingAssignment) {
    const roles = await seedOrganisationRoles(sub.organisationId);
    const orgAdminRole = roles.ORGANISATION_ADMIN;

    const adminEmployee = await employeeAdapter.createEmployee(
      sub.organisationId,
      {
        fullName: sub.adminName,
        email: sub.adminEmail,
        department: 'Executive & Talent',
        designation: 'Organisation Administrator',
        status: 'ACTIVE'
      },
      { actorUserId: adminActorId, requestId: context.requestId }
    );

    const authUser = await authAdapter.provisionOrgAdminAccount({
      organisationId: sub.organisationId,
      employeeId: adminEmployee.employeeId,
      email: sub.adminEmail,
      fullName: sub.adminName,
      password: `Recovery#${sub.id.slice(0, 8)}!2026`,
      requestId: context.requestId
    });

    employeeAdapter.updateStandaloneEmployeeAuthId(sub.organisationId, adminEmployee.employeeId, authUser.userId, 'ACTIVE');

    await EmployeeRoleAssignment.create({
      organisationId: sub.organisationId,
      employeeId: adminEmployee.employeeId,
      authUserId: authUser.userId,
      roleId: orgAdminRole.id,
      isActive: true,
      invitationStatus: 'ACCOUNT_ACTIVATED',
      accountActivatedAt: new Date(),
      assignedBy: adminActorId
    });

    await auditService.recordAudit({
      organisationId: sub.organisationId,
      actorUserId: adminActorId,
      actorRole: 'PLATFORM_ADMIN',
      entityType: 'ORGANISATION_ADMIN_ACCOUNT',
      entityId: sub.organisationId,
      action: 'ORGANISATION_ADMIN_ACCOUNT_RECOVERED',
      requestId: context.requestId,
      afterState: {
        adminEmail: sub.adminEmail,
        employeeId: adminEmployee.employeeId,
        authUserId: authUser.userId
      }
    });

    return {
      success: true,
      message: `Organisation Admin account assignment recovered for ${sub.adminEmail}`,
      recoveredStatus: 'ACCOUNT_LINKED',
      adminAccountStatus: 'ACTIVATED'
    };
  }

  // Case 3: Already provisioned and assignment exists; if not active, re-dispatch invitation
  if (sub.status !== 'ACTIVE' && sub.status !== 'TRIAL') {
    const resendRes = await activationService.resendActivationInvitation(sub.id, context);
    return {
      success: true,
      message: `Activation invitation refreshed and dispatched to ${sub.adminEmail}`,
      recoveredStatus: 'INVITATION_REFRESHED',
      adminAccountStatus: 'INVITED',
      data: resendRes.subscription
    };
  }

  return {
    success: true,
    message: `Organisation Admin account is already provisioned and active`,
    recoveredStatus: 'ALREADY_ACTIVE',
    adminAccountStatus: 'ACTIVATED'
  };
}

const ORG_PASSWORD_RESET_PREFIX = 'ORG_PASSWORD_RESET:';
const ORG_PASSWORD_RESET_TTL_MINUTES = 60;

async function dispatchOrgAdminPasswordReset(sub, context = {}) {
  const clientUrl = env.clientAppUrl || 'http://localhost:5173';
  const rawToken = generateSecureToken(32);
  const resetHash = sha256(`${ORG_PASSWORD_RESET_PREFIX}${rawToken}`);
  const expiresAt = new Date(Date.now() + ORG_PASSWORD_RESET_TTL_MINUTES * 60 * 1000);

  await sub.update({
    activationTokenHash: resetHash,
    activationExpiresAt: expiresAt
  });

  const resetLink = `${clientUrl}/reset-password?token=${encodeURIComponent(rawToken)}&portal=org`;
  const loginUrl = `${clientUrl}/org-login`;

  const dispatchResult = await notificationAdapter.dispatchNotification({
    eventType: 'PASSWORD_RESET_REQUESTED',
    organisationId: sub.organisationId,
    recipientEmail: sub.adminEmail,
    recipientName: sub.adminName,
    requestId: context.requestId,
    payload: {
      adminName: sub.adminName,
      organisationName: sub.organisationName,
      resetLink,
      loginUrl,
      expiresInMinutes: ORG_PASSWORD_RESET_TTL_MINUTES,
      instructions:
        context.requestedBy === 'SELF'
          ? 'You requested a password reset for your Organisation Admin account. Use the secure link below to set a new password.'
          : 'A password reset was requested by the Platform Administrator. Use the secure link below to set a new password for your Organisation Admin account.'
    }
  });

  await auditService.recordAudit({
    organisationId: sub.organisationId || null,
    actorUserId: context.actorUserId || null,
    actorRole: context.requestedBy === 'SELF' ? 'ORGANISATION_ADMIN' : 'PLATFORM_ADMIN',
    entityType: 'ORGANISATION_ADMIN_ACCOUNT',
    entityId: sub.id,
    action: 'ORGANISATION_ADMIN_PASSWORD_RESET_DISPATCHED',
    requestId: context.requestId,
    afterState: {
      adminEmail: sub.adminEmail,
      expiresAt: expiresAt.toISOString(),
      emailSent: Boolean(dispatchResult?.emailSent)
    }
  });

  return {
    adminEmail: sub.adminEmail,
    resetPortalUrl: `${clientUrl}/reset-password`,
    emailSent: Boolean(dispatchResult?.emailSent),
    expiresAt: expiresAt.toISOString()
  };
}

async function triggerPlatformOrgAdminPasswordReset(id, context = {}) {
  const sub = await findSubscriptionByOrgOrSubId(id);
  if (!sub) {
    throw new NotFoundError('Organisation subscription record not found');
  }

  if (sub.status !== 'ACTIVE' && sub.status !== 'TRIAL' && !sub.activatedAt) {
    throw new BadRequestError(
      'Organisation Admin account is not yet activated. Please use Resend Activation Invitation instead.',
      'ACCOUNT_NOT_ACTIVATED'
    );
  }

  const dispatched = await dispatchOrgAdminPasswordReset(sub, {
    ...context,
    requestedBy: 'PLATFORM_ADMIN'
  });

  return {
    success: true,
    message: `Password reset email dispatched to ${sub.adminEmail}`,
    data: dispatched
  };
}

async function requestOrgAdminPasswordResetByEmail(email, context = {}) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return { found: false };

  const { Subscription } = getModels();
  const sub = await Subscription.findOne({
    where: {
      adminEmail: { [Op.iLike]: normalizedEmail },
      status: { [Op.in]: ['ACTIVE', 'TRIAL'] }
    },
    order: [['createdAt', 'DESC']]
  });

  if (!sub) {
    return { found: false };
  }

  const dispatched = await dispatchOrgAdminPasswordReset(sub, {
    ...context,
    requestedBy: 'SELF'
  });

  return { found: true, ...dispatched };
}

async function completeOrgAdminPasswordReset({ token, newPassword }, context = {}) {
  const rawToken = String(token || '').trim();
  if (!rawToken) return null;

  const { Subscription, EmployeeRoleAssignment, RecruitmentRole } = getModels();
  const expectedHash = sha256(`${ORG_PASSWORD_RESET_PREFIX}${rawToken}`);
  const sub = await Subscription.findOne({
    where: { activationTokenHash: expectedHash }
  });

  if (!sub) {
    return null;
  }

  if (sub.activationExpiresAt && new Date(sub.activationExpiresAt) < new Date()) {
    throw new BadRequestError(
      'Password reset link has expired. Please request a new password reset link.',
      null,
      'RESET_TOKEN_EXPIRED'
    );
  }

  // Locate existing Organisation Admin assignment to preserve employeeId / authUserId
  let assignment = null;
  if (sub.organisationId) {
    assignment = await EmployeeRoleAssignment.findOne({
      where: { organisationId: sub.organisationId },
      include: [
        {
          model: RecruitmentRole,
          as: 'role',
          where: { code: 'ORGANISATION_ADMIN' },
          required: false
        }
      ],
      order: [['createdAt', 'ASC']]
    });
  }

  const authUser = await authAdapter.updateOrgUserPassword({
    email: sub.adminEmail,
    organisationId: sub.organisationId,
    employeeId: assignment?.employeeId || null,
    authUserId: assignment?.authUserId || null,
    fullName: sub.adminName,
    roles: ['ORGANISATION_ADMIN'],
    password: newPassword,
    requestId: context.requestId
  });

  // Ensure RBAC role assignment exists & matches updated authUserId
  if (sub.organisationId) {
    const rolesByCode = await seedOrganisationRoles(sub.organisationId);
    const orgAdminRole = rolesByCode.ORGANISATION_ADMIN;

    if (assignment) {
      await assignment.update({
        authUserId: authUser.userId,
        roleId: orgAdminRole.id,
        isActive: true,
        invitationStatus: 'ACCOUNT_ACTIVATED',
        accountActivatedAt: assignment.accountActivatedAt || new Date()
      });
    } else {
      const adminEmployee = await employeeAdapter.createEmployee(
        sub.organisationId,
        {
          fullName: sub.adminName,
          email: sub.adminEmail,
          department: 'Executive & Talent',
          designation: 'Organisation Administrator',
          status: 'ACTIVE'
        },
        { actorUserId: authUser.userId, requestId: context.requestId }
      );
      employeeAdapter.updateStandaloneEmployeeAuthId(
        sub.organisationId,
        adminEmployee.employeeId,
        authUser.userId,
        'ACTIVE'
      );
      await EmployeeRoleAssignment.create({
        organisationId: sub.organisationId,
        employeeId: adminEmployee.employeeId,
        authUserId: authUser.userId,
        roleId: orgAdminRole.id,
        isActive: true,
        invitationStatus: 'ACCOUNT_ACTIVATED',
        accountActivatedAt: new Date(),
        assignedBy: authUser.userId
      });
    }
  }

  // Consume single-use token
  await sub.update({
    activationTokenHash: null,
    activationExpiresAt: null
  });

  await auditService.recordAudit({
    organisationId: sub.organisationId || null,
    actorUserId: authUser.userId,
    actorRole: 'ORGANISATION_ADMIN',
    entityType: 'ORGANISATION_ADMIN_ACCOUNT',
    entityId: sub.id,
    action: 'ORGANISATION_ADMIN_PASSWORD_RESET_COMPLETED',
    requestId: context.requestId,
    afterState: { adminEmail: sub.adminEmail }
  });

  return {
    reset: true,
    accountType: 'ORGANISATION_ADMIN',
    loginPath: '/org-login',
    email: sub.adminEmail,
    message: 'Organisation Admin password updated successfully. You may now sign in at the Organisation Admin portal.'
  };
}

module.exports = {
  resendPlatformOrgAdminActivation,
  recoverPlatformOrgAdminAccount,
  triggerPlatformOrgAdminPasswordReset,
  requestOrgAdminPasswordResetByEmail,
  completeOrgAdminPasswordReset
};
