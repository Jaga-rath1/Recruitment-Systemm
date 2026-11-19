const { withTransaction } = require('../../config/database');
const { BadRequestError, NotFoundError } = require('../../utils/AppError');
const organisationRepo = require('./organisation.repository');
const roleRepo = require('../role/role.repository');
const auditService = require('../audit/audit.service');
const employeeAdapter = require('../../integrations/employee/employee.adapter');
const organisationAdapter = require('../../integrations/organisation/organisation.adapter');
const employeeInvitationService = require('./employeeInvitation.service');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isValidUuid(val) {
  return typeof val === 'string' && UUID_REGEX.test(val);
}

const {
  computeEffectivePermissions,
  resolveTargetRole,
  addAndInviteEmployee,
  resendEmployeeInvitation,
  inspectEmployeeActivation,
  activateEmployeeAccount
} = employeeInvitationService;

async function getOrganisationProfile(organisationId, context = {}) {
  const [profile, subscription] = await Promise.all([
    organisationAdapter.getOrganisation(organisationId, context),
    organisationRepo.getLatestSubscriptionForOrg(organisationId)
  ]);

  return {
    ...profile,
    organisationId,
    subscription: subscription
      ? {
        id: subscription.id,
        planCode: subscription.planCode,
        billingCycle: subscription.billingCycle,
        status: subscription.status,
        startsAt: subscription.startsAt,
        expiresAt: subscription.expiresAt
      }
      : null
  };
}

async function getOrganisationDashboard(organisationId) {
  const [profile, metrics] = await Promise.all([
    getOrganisationProfile(organisationId),
    organisationRepo.getDashboardMetrics(organisationId)
  ]);
  return { profile, metrics };
}

async function listOrganisationEmployees(organisationId, query = {}) {
  const [externalEmployees, assignments] = await Promise.all([
    employeeAdapter.listEmployees(organisationId, { search: query.search }),
    organisationRepo.listEmployeeAssignments(organisationId)
  ]);

  const assignmentMap = new Map(assignments.map((a) => [a.employeeId, a]));
  const seenEmployeeIds = new Set();

  const formatted = externalEmployees.map((emp) => {
    seenEmployeeIds.add(emp.employeeId);
    const assign = assignmentMap.get(emp.employeeId);
    return {
      ...emp,
      recruitmentAccess: assign
        ? {
          assignmentId: assign.id,
          isActive: assign.isActive,
          roleId: assign.roleId,
          roleCode: assign.role?.code,
          roleName: assign.role?.name,
          customPermissions: assign.customPermissions || [],
          revokedPermissions: assign.revokedPermissions || [],
          effectivePermissions: computeEffectivePermissions(assign),
          deactivatedAt: assign.deactivatedAt,
          invitationStatus: assign.invitationStatus || 'EMPLOYEE_CREATED',
          invitationSentAt: assign.invitationSentAt || null,
          invitationDeliveryStatus: assign.invitationDeliveryStatus || 'PENDING',
          invitationError: assign.invitationError || null,
          invitationResendCount: assign.invitationResendCount || 0,
          accountActivatedAt: assign.accountActivatedAt || null
        }
        : null
    };
  });

  // Reconcile assignments that were not returned by externalEmployees (e.g. created prior to a restart)
  for (const assign of assignments) {
    if (!seenEmployeeIds.has(assign.employeeId)) {
      seenEmployeeIds.add(assign.employeeId);
      formatted.push({
        employeeId: assign.employeeId,
        id: assign.employeeId,
        authUserId: assign.authUserId,
        organisationId,
        employeeCode: `EMP-${assign.employeeId.slice(0, 6).toUpperCase()}`,
        fullName: 'Team Member',
        firstName: 'Team',
        lastName: 'Member',
        email: '',
        department: 'People & Talent',
        designation: assign.role?.name || 'Recruiter',
        status: assign.invitationStatus === 'ACCOUNT_ACTIVATED' ? 'ACTIVE' : 'INVITED',
        isActive: assign.isActive,
        recruitmentAccess: {
          assignmentId: assign.id,
          isActive: assign.isActive,
          roleId: assign.roleId,
          roleCode: assign.role?.code,
          roleName: assign.role?.name,
          customPermissions: assign.customPermissions || [],
          revokedPermissions: assign.revokedPermissions || [],
          effectivePermissions: computeEffectivePermissions(assign),
          deactivatedAt: assign.deactivatedAt,
          invitationStatus: assign.invitationStatus || 'EMPLOYEE_CREATED',
          invitationSentAt: assign.invitationSentAt || null,
          invitationDeliveryStatus: assign.invitationDeliveryStatus || 'PENDING',
          invitationError: assign.invitationError || null,
          invitationResendCount: assign.invitationResendCount || 0,
          accountActivatedAt: assign.accountActivatedAt || null
        }
      });
    }
  }

  return formatted;
}

async function assignEmployeeRole(organisationId, employeeId, input, context = {}) {
  await employeeAdapter.validateActiveEmployeeInOrg(organisationId, employeeId, {
    actorUserId: context.actorUserId,
    requestId: context.requestId
  });
  const employee = await employeeAdapter.getEmployeeById(organisationId, employeeId, {
    actorUserId: context.actorUserId,
    requestId: context.requestId
  });

  const role = await resolveTargetRole(organisationId, { roleId: input.roleId, roleCode: input.roleCode });
  const existing = await organisationRepo.findEmployeeAssignment(organisationId, employeeId);

  const safeActorUserId = isValidUuid(context.actorUserId) ? context.actorUserId : null;

  const assignment = await withTransaction(async (tx) => {
    const upserted = await organisationRepo.upsertEmployeeAssignment(
      organisationId,
      employeeId,
      {
        create: {
          authUserId: employee.authUserId || null,
          roleId: role.id,
          isActive: true,
          assignedBy: safeActorUserId
        },
        update: {
          ...(employee.authUserId && !existing?.authUserId ? { authUserId: employee.authUserId } : {}),
          roleId: role.id,
          isActive: true,
          deactivatedAt: null,
          deactivatedBy: null
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
        entityId: employeeId,
        action: 'EMPLOYEE_ROLE_ASSIGNED',
        requestId: context.requestId,
        beforeState: existing ? { roleCode: existing.role.code, isActive: existing.isActive } : null,
        afterState: { roleCode: role.code, isActive: true }
      },
      tx
    );

    return upserted;
  });

  return {
    employeeId,
    roleId: assignment.roleId,
    roleCode: assignment.role.code,
    roleName: assignment.role.name,
    isActive: assignment.isActive,
    effectivePermissions: computeEffectivePermissions(assignment)
  };
}

async function updateEmployeePermissions(organisationId, employeeId, input, context = {}) {
  const existing = await organisationRepo.findEmployeeAssignment(organisationId, employeeId);
  if (!existing) {
    throw new NotFoundError('Employee recruitment assignment not found');
  }

  const updated = await withTransaction(async (tx) => {
    const record = await organisationRepo.updateEmployeeAssignment(
      organisationId,
      employeeId,
      {
        customPermissions: input.customPermissions ?? existing.customPermissions,
        revokedPermissions: input.revokedPermissions ?? existing.revokedPermissions
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
        entityId: employeeId,
        action: 'EMPLOYEE_PERMISSIONS_UPDATED',
        requestId: context.requestId,
        beforeState: {
          customPermissions: existing.customPermissions,
          revokedPermissions: existing.revokedPermissions
        },
        afterState: {
          customPermissions: record.customPermissions,
          revokedPermissions: record.revokedPermissions
        }
      },
      tx
    );

    return record;
  });

  return {
    employeeId,
    roleCode: updated.role.code,
    customPermissions: updated.customPermissions,
    revokedPermissions: updated.revokedPermissions,
    effectivePermissions: computeEffectivePermissions(updated)
  };
}

async function setEmployeeRecruitmentAccess(organisationId, employeeId, isActive, context = {}) {
  const existing = await organisationRepo.findEmployeeAssignment(organisationId, employeeId);
  if (!existing) {
    throw new NotFoundError('Employee recruitment assignment not found');
  }

  if (employeeId === context.actorEmployeeId && !isActive) {
    throw new BadRequestError('You cannot deactivate your own active recruitment admin access');
  }

  if (isActive) {
    await employeeAdapter.validateActiveEmployeeInOrg(organisationId, employeeId, {
      actorUserId: context.actorUserId,
      requestId: context.requestId
    });
  }

  const updated = await withTransaction(async (tx) => {
    const record = await organisationRepo.updateEmployeeAssignment(
      organisationId,
      employeeId,
      {
        isActive,
        deactivatedBy: isActive ? null : (isValidUuid(context.actorUserId) ? context.actorUserId : null),
        deactivatedAt: isActive ? null : new Date()
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
        entityId: employeeId,
        action: isActive ? 'EMPLOYEE_ACCESS_REACTIVATED' : 'EMPLOYEE_ACCESS_DEACTIVATED',
        requestId: context.requestId,
        beforeState: { isActive: existing.isActive },
        afterState: { isActive: record.isActive }
      },
      tx
    );

    return record;
  });

  if (employeeAdapter.updateStandaloneEmployeeStatus) {
    employeeAdapter.updateStandaloneEmployeeStatus(organisationId, employeeId, isActive ? 'ACTIVE' : 'INACTIVE');
  }

  return {
    employeeId,
    isActive: updated.isActive,
    deactivatedAt: updated.deactivatedAt
  };
}

async function deleteOrganisationEmployee(organisationId, employeeId, context = {}) {
  const existing = await organisationRepo.findEmployeeAssignment(organisationId, employeeId);
  const employee = await employeeAdapter.getEmployeeById(organisationId, employeeId, context);

  if (!existing && !employee) {
    throw new NotFoundError('Employee not found in organisation');
  }

  // Guard: Cannot delete self
  if (employeeId === context.actorEmployeeId) {
    throw new BadRequestError('You cannot delete your own organisation admin account');
  }

  // Remove recruitment role assignment in DB
  await withTransaction(async (tx) => {
    if (existing) {
      await organisationRepo.deleteEmployeeAssignment(organisationId, employeeId, tx);
    }

    await auditService.recordAudit(
      {
        organisationId,
        actorUserId: context.actorUserId,
        actorEmployeeId: context.actorEmployeeId,
        actorRole: context.actorRole,
        entityType: 'EMPLOYEE_ACCESS',
        entityId: employeeId,
        action: 'EMPLOYEE_ACCESS_DELETED',
        requestId: context.requestId,
        beforeState: {
          employeeId,
          roleId: existing?.roleId,
          roleCode: existing?.role?.code,
          isActive: existing?.isActive
        },
        afterState: null
      },
      tx
    );
  });

  // Remove from standalone store if in standalone mode
  if (employeeAdapter.deleteStandaloneEmployee) {
    await employeeAdapter.deleteStandaloneEmployee(organisationId, employeeId);
  }

  return {
    success: true,
    message: 'Employee deleted successfully',
    employeeId
  };
}

async function getEmployeeActivity(organisationId, employeeId) {
  const [employee, assignment] = await Promise.all([
    employeeAdapter.getEmployeeById(organisationId, employeeId),
    organisationRepo.findEmployeeAssignment(organisationId, employeeId)
  ]);

  if (!employee && !assignment) {
    throw new NotFoundError('Employee not found');
  }

  const stats = await organisationRepo.getEmployeeActivityStats(organisationId, employeeId, assignment?.authUserId);
  return {
    employee: employee || { employeeId },
    roleCode: assignment?.role?.code || null,
    isActive: assignment?.isActive ?? false,
    ...stats
  };
}

module.exports = {
  getOrganisationProfile,
  getOrganisationDashboard,
  listOrganisationEmployees,
  assignEmployeeRole,
  updateEmployeePermissions,
  setEmployeeRecruitmentAccess,
  deleteOrganisationEmployee,
  getEmployeeActivity,
  // Delegated employee invitation and onboarding functions
  computeEffectivePermissions,
  resolveTargetRole,
  addAndInviteEmployee,
  resendEmployeeInvitation,
  inspectEmployeeActivation,
  activateEmployeeAccount
};
