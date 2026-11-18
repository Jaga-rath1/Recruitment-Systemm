'use strict';

const { Op } = require('sequelize');
const env = require('../../config/env');
const { getModels } = require('../../config/database');
const { BadRequestError, ForbiddenError } = require('../../utils/AppError');
const { generateSecureToken, sha256 } = require('../../utils/crypto');
const auditService = require('../audit/audit.service');
const authAdapter = require('../../integrations/auth/auth.adapter');
const employeeAdapter = require('../../integrations/employee/employee.adapter');
const organisationAdapter = require('../../integrations/organisation/organisation.adapter');
const notificationAdapter = require('../../integrations/notification/notification.adapter');

const EMP_PASSWORD_RESET_PREFIX = 'EMP_PASSWORD_RESET:';
const EMP_PASSWORD_RESET_TTL_MINUTES = 60;

async function findActiveEmployeeTargetByEmail(normalizedEmail) {
  const { EmployeeRoleAssignment, RecruitmentRole, RecruitmentNotificationHistory, RecruitmentAuditLog } = getModels();

  // 1. Check standalone auth store first (fast path for provisioned/activated employees)
  const standaloneUser = authAdapter.findStandaloneUserByEmail(normalizedEmail);
  if (standaloneUser && standaloneUser.userType === 'ORG_USER' && standaloneUser.organisationId) {
    const orConds = [];
    if (standaloneUser.userId) orConds.push({ authUserId: standaloneUser.userId });
    if (standaloneUser.employeeId) orConds.push({ employeeId: standaloneUser.employeeId });

    if (orConds.length > 0) {
      const assignment = await EmployeeRoleAssignment.findOne({
        where: {
          organisationId: standaloneUser.organisationId,
          isActive: true,
          [Op.or]: orConds
        },
        include: [{ model: RecruitmentRole, as: 'role' }],
        order: [['updatedAt', 'DESC']]
      });

      if (assignment && assignment.role?.code !== 'ORGANISATION_ADMIN') {
        return {
          assignment,
          email: normalizedEmail,
          fullName: standaloneUser.name || 'Team Member',
          roleCode: assignment.role?.code || standaloneUser.roles?.[0] || 'RECRUITER',
          roleName: assignment.role?.name || 'Recruiter'
        };
      }
    }
  }

  // 2. Fallback: look up most recent EMPLOYEE_INVITATION notification for this email
  const inviteNotif = await RecruitmentNotificationHistory.findOne({
    where: {
      eventType: 'EMPLOYEE_INVITATION',
      recipientEmail: { [Op.iLike]: normalizedEmail }
    },
    order: [['createdAt', 'DESC']],
    raw: true
  });

  if (inviteNotif?.organisationId) {
    const meta = inviteNotif.metadata || {};
    const whereClause = {
      organisationId: inviteNotif.organisationId,
      isActive: true
    };
    if (meta.employeeId) {
      whereClause.employeeId = meta.employeeId;
    }

    const assignment = await EmployeeRoleAssignment.findOne({
      where: whereClause,
      include: [{ model: RecruitmentRole, as: 'role' }],
      order: [['updatedAt', 'DESC']]
    });

    if (assignment && assignment.role?.code !== 'ORGANISATION_ADMIN') {
      return {
        assignment,
        email: normalizedEmail,
        fullName: inviteNotif.recipientName || 'Team Member',
        roleCode: assignment.role?.code || meta.roleCode || 'RECRUITER',
        roleName: assignment.role?.name || meta.roleName || 'Recruiter'
      };
    }
  }

  return null;
}

async function requestEmployeePasswordResetByEmail(email, context = {}) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return { found: false };

  const target = await findActiveEmployeeTargetByEmail(normalizedEmail);
  if (!target) {
    return { found: false };
  }

  const { assignment, fullName, roleCode, roleName } = target;
  const clientUrl = env.clientAppUrl || 'http://localhost:5173';
  const rawToken = generateSecureToken(32);
  const resetHash = sha256(`${EMP_PASSWORD_RESET_PREFIX}${rawToken}`);
  const expiresAt = new Date(Date.now() + EMP_PASSWORD_RESET_TTL_MINUTES * 60 * 1000);

  await assignment.update({
    invitationTokenHash: resetHash,
    invitationExpiresAt: expiresAt
  });

  const orgProfile = await organisationAdapter
    .getOrganisation(assignment.organisationId, context)
    .catch(() => ({ name: 'Your Organisation' }));

  const resetLink = `${clientUrl}/reset-password?token=${encodeURIComponent(rawToken)}&portal=recruiter`;
  const loginUrl = `${clientUrl}/recruiter-login`;

  const dispatchResult = await notificationAdapter.dispatchNotification({
    eventType: 'PASSWORD_RESET_REQUESTED',
    organisationId: assignment.organisationId,
    recipientEmail: normalizedEmail,
    recipientName: fullName,
    requestId: context.requestId,
    payload: {
      employeeId: assignment.employeeId,
      adminName: fullName,
      organisationName: orgProfile?.name || 'Your Organisation',
      roleLabel: roleName || 'Recruiter',
      resetLink,
      loginUrl,
      expiresInMinutes: EMP_PASSWORD_RESET_TTL_MINUTES,
      instructions:
        'You requested a password reset for your Recruiter / Hiring Team account. Use the secure single-use link below to set a new password.'
    }
  });

  await auditService.recordAudit({
    organisationId: assignment.organisationId,
    actorUserId: assignment.authUserId || null,
    actorEmployeeId: assignment.employeeId,
    actorRole: roleCode,
    entityType: 'EMPLOYEE_ACCESS',
    entityId: assignment.employeeId,
    action: 'EMPLOYEE_PASSWORD_RESET_DISPATCHED',
    requestId: context.requestId,
    afterState: {
      email: normalizedEmail,
      roleCode,
      expiresAt: expiresAt.toISOString(),
      emailSent: Boolean(dispatchResult?.emailSent)
    }
  });

  return {
    found: true,
    email: normalizedEmail,
    emailSent: Boolean(dispatchResult?.emailSent),
    expiresAt: expiresAt.toISOString()
  };
}

async function completeEmployeePasswordReset({ token, newPassword }, context = {}) {
  const rawToken = String(token || '').trim();
  if (!rawToken) return null;

  const { EmployeeRoleAssignment, RecruitmentRole, RecruitmentNotificationHistory, RecruitmentAuditLog } = getModels();
  const expectedHash = sha256(`${EMP_PASSWORD_RESET_PREFIX}${rawToken}`);

  const assignment = await EmployeeRoleAssignment.findOne({
    where: { invitationTokenHash: expectedHash },
    include: [{ model: RecruitmentRole, as: 'role' }]
  });

  if (!assignment) {
    return null;
  }

  if (!assignment.isActive) {
    throw new ForbiddenError(
      'Your recruitment team access has been deactivated. Please contact your Organisation Administrator.',
      'EMPLOYEE_DEACTIVATED'
    );
  }

  if (assignment.invitationExpiresAt && new Date(assignment.invitationExpiresAt) < new Date()) {
    throw new BadRequestError(
      'Password reset link has expired. Please request a new password reset link.',
      null,
      'RESET_TOKEN_EXPIRED'
    );
  }

  // Resolve employee email & display name
  let employeeEmail = null;
  let employeeName = 'Team Member';

  const standaloneById = assignment.authUserId ? authAdapter.findStandaloneUserById(assignment.authUserId) : null;
  if (standaloneById?.email) {
    employeeEmail = standaloneById.email;
    employeeName = standaloneById.name || employeeName;
  }

  if (!employeeEmail) {
    const emp = await employeeAdapter
      .getEmployeeById(assignment.organisationId, assignment.employeeId, context)
      .catch(() => null);
    if (emp?.email) {
      employeeEmail = emp.email;
      employeeName = emp.fullName || employeeName;
    }
  }

  if (!employeeEmail) {
    const latestResetAudit = await RecruitmentAuditLog.findOne({
      where: {
        organisationId: assignment.organisationId,
        entityId: assignment.employeeId,
        action: 'EMPLOYEE_PASSWORD_RESET_DISPATCHED'
      },
      order: [['createdAt', 'DESC']],
      raw: true
    });
    if (latestResetAudit?.afterState?.email) {
      employeeEmail = latestResetAudit.afterState.email;
    }
  }

  if (!employeeEmail) {
    const latestResetNotif = await RecruitmentNotificationHistory.findOne({
      where: {
        organisationId: assignment.organisationId,
        eventType: { [Op.in]: ['PASSWORD_RESET_REQUESTED', 'EMPLOYEE_INVITATION'] }
      },
      order: [['createdAt', 'DESC']],
      raw: true
    });
    if (latestResetNotif?.recipientEmail) {
      employeeEmail = latestResetNotif.recipientEmail;
      employeeName = latestResetNotif.recipientName || employeeName;
    }
  }

  if (!employeeEmail) {
    throw new BadRequestError('Unable to locate registered email address for this employee account.');
  }

  const roleCode = assignment.role?.code || 'RECRUITER';

  const authUser = await authAdapter.updateOrgUserPassword({
    email: employeeEmail,
    organisationId: assignment.organisationId,
    employeeId: assignment.employeeId,
    authUserId: assignment.authUserId,
    fullName: employeeName,
    roles: [roleCode],
    password: newPassword,
    requestId: context.requestId
  });

  employeeAdapter.updateStandaloneEmployeeAuthId(
    assignment.organisationId,
    assignment.employeeId,
    authUser.userId,
    'ACTIVE'
  );

  // Consume single-use token
  await assignment.update({
    authUserId: authUser.userId,
    invitationTokenHash: null,
    invitationExpiresAt: null,
    invitationStatus: 'ACCOUNT_ACTIVATED',
    accountActivatedAt: assignment.accountActivatedAt || new Date(),
    isActive: true
  });

  await auditService.recordAudit({
    organisationId: assignment.organisationId,
    actorUserId: authUser.userId,
    actorEmployeeId: assignment.employeeId,
    actorRole: roleCode,
    entityType: 'EMPLOYEE_ACCESS',
    entityId: assignment.employeeId,
    action: 'EMPLOYEE_PASSWORD_RESET_COMPLETED',
    requestId: context.requestId,
    afterState: { email: employeeEmail, roleCode }
  });

  const loginPath = roleCode === 'ORGANISATION_ADMIN' ? '/org-login' : '/recruiter-login';

  return {
    reset: true,
    accountType: roleCode,
    loginPath,
    email: employeeEmail,
    message: 'Password updated successfully. You may now sign in to the Recruiter & Hiring Team portal.'
  };
}

module.exports = {
  requestEmployeePasswordResetByEmail,
  completeEmployeePasswordReset
};
