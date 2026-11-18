'use strict';

const crypto = require('crypto');
const env = require('../../config/env');
const logger = require('../../config/logger');
const { withTransaction, getModels } = require('../../config/database');
const { BadRequestError, NotFoundError, ConflictError } = require('../../utils/AppError');
const organisationRepo = require('./organisation.repository');
const roleRepo = require('../role/role.repository');
const auditService = require('../audit/audit.service');
const employeeAdapter = require('../../integrations/employee/employee.adapter');
const organisationAdapter = require('../../integrations/organisation/organisation.adapter');
const authAdapter = require('../../integrations/auth/auth.adapter');
const notificationAdapter = require('../../integrations/notification/notification.adapter');
const { seedOrganisationRoles } = require('../../db/seed');

function computeEffectivePermissions(assignment) {
  if (!assignment || !assignment.role) return [];
  const set = new Set((assignment.role.rolePermissions || []).map((rp) => rp.permission.code));
  if (Array.isArray(assignment.customPermissions)) {
    for (const p of assignment.customPermissions) set.add(p);
  }
  if (Array.isArray(assignment.revokedPermissions)) {
    for (const p of assignment.revokedPermissions) set.delete(p);
  }
  return Array.from(set);
}

function resolveLoginPortalUrl(roleCode) {
  const code = String(roleCode || '').toUpperCase();
  if (code === 'ORGANISATION_ADMIN') {
    return `${env.clientAppUrl}/org-login`;
  }
  return `${env.clientAppUrl}/recruiter-login`;
}

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken).trim()).digest('hex');
}

async function resolveTargetRole(organisationId, { roleId, roleCode }, tx = null) {
  const roles = await roleRepo.listRoles(organisationId);
  if (roles.length === 0) {
    await seedOrganisationRoles(organisationId, tx);
  }
  const role = roleId
    ? await roleRepo.findRoleById(organisationId, roleId, tx)
    : await roleRepo.findRoleByCode(organisationId, roleCode, tx);
  if (!role) {
    throw new NotFoundError('Target recruitment role not found in organisation');
  }
  if (role.code === 'CANDIDATE') {
    throw new BadRequestError('Cannot assign Candidate portal role to internal employees');
  }
  return role;
}

async function addAndInviteEmployee(organisationId, input, context = {}) {
  const role = await resolveTargetRole(organisationId, { roleId: input.roleId, roleCode: input.roleCode });
  const orgProfile = await organisationAdapter.getOrganisation(organisationId, context).catch(() => ({ name: 'Your Organisation' }));

  const employee = await employeeAdapter.createEmployee(
    organisationId,
    {
      fullName: input.fullName,
      email: input.email,
      department: input.department,
      designation: input.designation,
      phone: input.phone,
      status: input.sendInvite !== false ? 'INVITED' : 'ACTIVE'
    },
    { actorUserId: context.actorUserId, requestId: context.requestId }
  );

  let authUserId = employee.authUserId || null;
  let inviteResult = null;
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const shouldSendInvite = input.sendInvite !== false;

  if (shouldSendInvite && !authUserId) {
    inviteResult = await authAdapter.inviteEmployeeAccount({
      organisationId,
      employeeId: employee.employeeId,
      email: employee.email,
      fullName: employee.fullName,
      roleCode: role.code,
      authorization: context.authorization,
      requestId: context.requestId
    });
    authUserId = inviteResult.userId;
    employeeAdapter.updateStandaloneEmployeeAuthId(organisationId, employee.employeeId, authUserId, 'INVITED');
  }

  const assignment = await withTransaction(async (tx) => {
    const upserted = await organisationRepo.upsertEmployeeAssignment(
      organisationId,
      employee.employeeId,
      {
        create: {
          authUserId,
          roleId: role.id,
          customPermissions: input.customPermissions || [],
          revokedPermissions: input.revokedPermissions || [],
          isActive: true,
          assignedBy: context.actorUserId || null,
          invitationStatus: shouldSendInvite ? 'INVITATION_PENDING' : 'ACCOUNT_ACTIVATED',
          invitationTokenHash: shouldSendInvite ? tokenHash : null,
          invitationExpiresAt: shouldSendInvite ? expiresAt : null,
          invitationDeliveryStatus: 'PENDING'
        },
        update: {
          ...(authUserId ? { authUserId } : {}),
          roleId: role.id,
          customPermissions: input.customPermissions || [],
          revokedPermissions: input.revokedPermissions || [],
          isActive: true,
          deactivatedAt: null,
          deactivatedBy: null,
          invitationStatus: shouldSendInvite ? 'INVITATION_PENDING' : 'ACCOUNT_ACTIVATED',
          invitationTokenHash: shouldSendInvite ? tokenHash : null,
          invitationExpiresAt: shouldSendInvite ? expiresAt : null,
          invitationDeliveryStatus: 'PENDING'
        }
      },
      tx
    );

    await auditService.recordAudit(
      {
        organisationId,
        actorUserId: context.actorUserId,
        actorEmployeeId: context.actorEmployeeId,
        actorRole: context.actorRole,
        entityType: 'EMPLOYEE_ACCESS',
        entityId: employee.employeeId,
        action: 'EMPLOYEE_CREATED_AND_ROLE_ASSIGNED',
        requestId: context.requestId,
        afterState: {
          employeeId: employee.employeeId,
          email: employee.email,
          roleCode: role.code,
          invitationStatus: shouldSendInvite ? 'INVITATION_PENDING' : 'ACCOUNT_ACTIVATED'
        }
      },
      tx
    );

    return upserted;
  });

  const loginUrl = resolveLoginPortalUrl(role.code);
  const activationLink = `${env.clientAppUrl}/activate-employee?token=${rawToken}`;

  if (shouldSendInvite) {
    try {
      await notificationAdapter.dispatchNotification({
        eventType: 'EMPLOYEE_INVITATION',
        organisationId,
        recipientEmail: employee.email,
        recipientName: employee.fullName,
        requestId: context.requestId,
        payload: {
          employeeId: employee.employeeId,
          roleCode: role.code,
          roleName: role.name,
          organisationName: orgProfile.name,
          activationLink,
          loginUrl,
          expiresInHours: 48,
          instructions: `You have been assigned the ${role.name} role at ${orgProfile.name}. Please set your password to access the hiring platform.`
        }
      });

      await organisationRepo.updateEmployeeAssignment(
        organisationId,
        employee.employeeId,
        {
          invitationStatus: 'INVITATION_SENT',
          invitationSentAt: new Date(),
          invitationDeliveryStatus: 'ACCEPTED'
        }
      );
    } catch (notifErr) {
      logger.warn(
        { employeeId: employee.employeeId, err: notifErr.message },
        'Failed to dispatch employee invitation email'
      );
      await organisationRepo.updateEmployeeAssignment(
        organisationId,
        employee.employeeId,
        {
          invitationStatus: 'INVITATION_FAILED',
          invitationDeliveryStatus: 'FAILED',
          invitationError: notifErr.message
        }
      );
    }
  }

  return {
    ...employee,
    authUserId,
    recruitmentAccess: {
      assignmentId: assignment.id,
      isActive: assignment.isActive,
      roleId: assignment.roleId,
      roleCode: role.code,
      roleName: role.name,
      effectivePermissions: computeEffectivePermissions(assignment),
      invitationStatus: shouldSendInvite ? 'INVITATION_SENT' : 'ACCOUNT_ACTIVATED'
    },
    invitePreview: process.env.NODE_ENV === 'production' ? undefined : { activationLink, loginUrl }
  };
}

async function resendEmployeeInvitation(organisationId, employeeId, context = {}) {
  const assignment = await organisationRepo.findEmployeeAssignment(organisationId, employeeId);
  if (!assignment) {
    throw new NotFoundError('Employee assignment not found in this organisation');
  }

  if (assignment.invitationStatus === 'ACCOUNT_ACTIVATED') {
    throw new BadRequestError('Employee account has already been activated');
  }

  const employee = await employeeAdapter.getEmployeeById(organisationId, employeeId, context);
  if (!employee) {
    throw new NotFoundError('Employee record not found');
  }

  const orgProfile = await organisationAdapter.getOrganisation(organisationId, context).catch(() => ({ name: 'Your Organisation' }));
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const roleCode = assignment.role?.code || 'RECRUITER';
  const roleName = assignment.role?.name || roleCode;
  const loginUrl = resolveLoginPortalUrl(roleCode);
  const activationLink = `${env.clientAppUrl}/activate-employee?token=${rawToken}`;
  const newResendCount = (assignment.invitationResendCount || 0) + 1;

  await organisationRepo.updateEmployeeAssignment(
    organisationId,
    employeeId,
    {
      invitationTokenHash: tokenHash,
      invitationExpiresAt: expiresAt,
      invitationStatus: 'INVITATION_PENDING',
      invitationResendCount: newResendCount
    }
  );

  await auditService.recordAudit({
    organisationId,
    actorUserId: context.actorUserId,
    actorEmployeeId: context.actorEmployeeId,
    actorRole: context.actorRole,
    entityType: 'EMPLOYEE_ACCESS',
    entityId: employeeId,
    action: 'EMPLOYEE_INVITATION_RESENT',
    requestId: context.requestId,
    afterState: { resendCount: newResendCount, expiresAt: expiresAt.toISOString() }
  });

  try {
    await notificationAdapter.dispatchNotification({
      eventType: 'EMPLOYEE_INVITATION',
      organisationId,
      recipientEmail: employee.email,
      recipientName: employee.fullName,
      requestId: context.requestId,
      payload: {
        employeeId: employee.employeeId,
        roleCode,
        roleName,
        organisationName: orgProfile.name,
        activationLink,
        loginUrl,
        expiresInHours: 48,
        instructions: `Your invitation to join ${orgProfile.name} on NEXNUV Recruitment has been refreshed. Please set your password to activate your account.`
      }
    });

    await organisationRepo.updateEmployeeAssignment(
      organisationId,
      employeeId,
      {
        invitationStatus: 'INVITATION_SENT',
        invitationSentAt: new Date(),
        invitationDeliveryStatus: 'ACCEPTED'
      }
    );
  } catch (err) {
    logger.warn({ employeeId, err: err.message }, 'Failed to resend employee invitation email');
    await organisationRepo.updateEmployeeAssignment(
      organisationId,
      employeeId,
      {
        invitationStatus: 'INVITATION_FAILED',
        invitationDeliveryStatus: 'FAILED',
        invitationError: err.message
      }
    );
  }

  return {
    success: true,
    message: 'Invitation resent successfully',
    resendCount: newResendCount,
    sentAt: new Date().toISOString(),
    invitePreview: process.env.NODE_ENV === 'production' ? undefined : { activationLink, loginUrl }
  };
}

async function inspectEmployeeActivation(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') {
    throw new BadRequestError('Activation token is required');
  }

  const tokenHash = hashToken(rawToken);
  const { EmployeeRoleAssignment, RecruitmentRole } = getModels();

  const assignment = await EmployeeRoleAssignment.findOne({
    where: { invitationTokenHash: tokenHash },
    include: [{ model: RecruitmentRole, as: 'role' }]
  });

  if (!assignment) {
    throw new NotFoundError('Invalid or already used invitation token');
  }

  if (assignment.invitationStatus === 'ACCOUNT_ACTIVATED') {
    throw new ConflictError('This invitation has already been accepted and the account is active');
  }

  if (assignment.invitationExpiresAt && new Date(assignment.invitationExpiresAt) < new Date()) {
    throw new BadRequestError('Invitation link has expired. Please contact your administrator to resend the invitation.');
  }

  const [employee, orgProfile] = await Promise.all([
    employeeAdapter.getEmployeeById(assignment.organisationId, assignment.employeeId).catch(() => null),
    organisationAdapter.getOrganisation(assignment.organisationId).catch(() => ({ name: 'Your Organisation' }))
  ]);

  const roleCode = assignment.role?.code || 'RECRUITER';
  const roleName = assignment.role?.name || roleCode;
  const loginUrl = resolveLoginPortalUrl(roleCode);

  return {
    valid: true,
    employeeName: employee?.fullName || 'Team Member',
    email: employee?.email || '',
    organisationName: orgProfile.name,
    roleName,
    roleCode,
    loginUrl,
    expiresAt: assignment.invitationExpiresAt,
    expiresInHours: Math.max(0, Math.round((new Date(assignment.invitationExpiresAt) - new Date()) / (3600 * 1000)))
  };
}

async function activateEmployeeAccount({ token, password }, context = {}) {
  if (!token || typeof token !== 'string') {
    throw new BadRequestError('Activation token is required');
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    throw new BadRequestError('A secure password with at least 8 characters is required');
  }

  const tokenHash = hashToken(token);
  const { EmployeeRoleAssignment, RecruitmentRole } = getModels();

  const assignment = await EmployeeRoleAssignment.findOne({
    where: { invitationTokenHash: tokenHash },
    include: [{ model: RecruitmentRole, as: 'role' }]
  });

  if (!assignment) {
    throw new NotFoundError('Invalid or already used invitation token');
  }

  if (assignment.invitationStatus === 'ACCOUNT_ACTIVATED') {
    throw new ConflictError('This account has already been activated');
  }

  if (assignment.invitationExpiresAt && new Date(assignment.invitationExpiresAt) < new Date()) {
    throw new BadRequestError('Invitation link has expired');
  }

  const employee = await employeeAdapter.getEmployeeById(assignment.organisationId, assignment.employeeId, context);
  if (!employee) {
    throw new NotFoundError('Associated employee record not found');
  }

  // Set credentials on auth provider
  await authAdapter.activateEmployeeAccountCredentials({
    authUserId: assignment.authUserId,
    email: employee.email,
    password,
    requestId: context.requestId
  });

  // Transition employee role assignment to activated state
  await assignment.update({
    invitationStatus: 'ACCOUNT_ACTIVATED',
    accountActivatedAt: new Date(),
    invitationTokenHash: null, // Single-use! Invalidate token immediately
    isActive: true
  });

  // Activate employee in employee adapter
  employeeAdapter.updateStandaloneEmployeeAuthId(assignment.organisationId, assignment.employeeId, assignment.authUserId, 'ACTIVE');

  await auditService.recordAudit({
    organisationId: assignment.organisationId,
    actorUserId: assignment.authUserId || null,
    actorEmployeeId: assignment.employeeId,
    actorRole: assignment.role?.code || 'EMPLOYEE',
    entityType: 'EMPLOYEE_ACCESS',
    entityId: assignment.employeeId,
    action: 'EMPLOYEE_ACCOUNT_ACTIVATED',
    requestId: context.requestId,
    afterState: { invitationStatus: 'ACCOUNT_ACTIVATED', activatedAt: new Date().toISOString() }
  });

  const roleCode = assignment.role?.code || 'RECRUITER';
  const loginUrl = resolveLoginPortalUrl(roleCode);

  return {
    success: true,
    message: 'Your account has been successfully activated. You can now log in.',
    roleCode,
    loginUrl
  };
}

module.exports = {
  computeEffectivePermissions,
  resolveTargetRole,
  addAndInviteEmployee,
  resendEmployeeInvitation,
  inspectEmployeeActivation,
  activateEmployeeAccount
};
