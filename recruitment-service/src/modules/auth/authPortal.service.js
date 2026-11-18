'use strict';

const { Op } = require('sequelize');
const { getModels } = require('../../config/database');
const { ForbiddenError, UnauthorizedError, BadRequestError } = require('../../utils/AppError');
const authAdapter = require('../../integrations/auth/auth.adapter');
const candidateIdentityService = require('../candidate/candidateIdentity.service');
const { resolveEffectivePermissions } = require('../../middleware/rbac');

async function resolveOrgEmployeeRole(organisationId, userId, employeeId) {
  if (!organisationId) return null;
  const { EmployeeRoleAssignment, RecruitmentRole } = getModels();
  const orConditions = [];
  if (userId) orConditions.push({ authUserId: userId });
  if (employeeId) orConditions.push({ employeeId });
  if (orConditions.length === 0) return null;

  const assignment = await EmployeeRoleAssignment.findOne({
    where: {
      organisationId,
      [Op.or]: orConditions
    },
    include: [{ model: RecruitmentRole, as: 'role' }]
  });

  if (!assignment) return null;
  if (!assignment.isActive) {
    throw new ForbiddenError('Your recruitment team access has been deactivated. Please contact your administrator.', 'EMPLOYEE_DEACTIVATED');
  }

  return {
    roleCode: assignment.role?.code || null,
    assignmentId: assignment.id,
    employeeId: assignment.employeeId
  };
}

async function authenticateCandidatePortal({ email, password, requestMeta }) {
  const result = await authAdapter.registerOrLoginCandidate({
    email,
    password,
    mode: 'candidate_login',
    ...requestMeta
  });

  if (result.user.userType !== 'CANDIDATE') {
    throw new ForbiddenError(
      'Access denied. Candidate portal is exclusively for candidates. Please use your organization or platform admin portal.',
      'PORTAL_ROLE_MISMATCH'
    );
  }

  return result;
}

async function authenticatePlatformAdminPortal({ email, password, requestMeta }) {
  // First attempt candidate login check: if this email is candidate-only, reject immediately
  const result = await authAdapter.registerOrLoginCandidate({
    email,
    password,
    mode: 'login',
    ...requestMeta
  });

  const { user } = result;
  const isPlatformAdmin =
    user.userType === 'PLATFORM_ADMIN' ||
    (Array.isArray(user.roles) && (user.roles.includes('PLATFORM_ADMIN') || user.roles.includes('SUPER_ADMIN')));

  if (!isPlatformAdmin) {
    throw new ForbiddenError(
      'Access denied. Platform Admin portal is restricted to authorized platform administrators.',
      'PORTAL_ROLE_MISMATCH'
    );
  }

  return {
    ...result,
    user: {
      ...result.user,
      activeRoleCode: 'PLATFORM_ADMIN'
    }
  };
}

async function authenticateOrgAdminPortal({ email, password, requestMeta }) {
  const result = await authAdapter.registerOrLoginCandidate({
    email,
    password,
    mode: 'login',
    ...requestMeta
  });

  const { user } = result;

  if (user.userType === 'CANDIDATE') {
    throw new ForbiddenError(
      'Access denied. This portal is exclusively for Organisation Administrators. Please use the Candidate portal.',
      'PORTAL_ROLE_MISMATCH'
    );
  }

  if (user.userType === 'PLATFORM_ADMIN') {
    throw new ForbiddenError(
      'Access denied. Platform Administrators must sign in through the Platform Admin portal.',
      'PORTAL_ROLE_MISMATCH'
    );
  }

  // Resolve active role in the organization
  const orgRoleInfo = await resolveOrgEmployeeRole(user.organisationId, user.userId, user.employeeId);
  const resolvedRole = orgRoleInfo?.roleCode || (Array.isArray(user.roles) ? user.roles[0] : null);

  const isOrgAdmin =
    resolvedRole === 'ORGANISATION_ADMIN' ||
    (Array.isArray(user.roles) && user.roles.includes('ORGANISATION_ADMIN')) ||
    user.sharedRole === 'org_admin';

  if (!isOrgAdmin) {
    throw new ForbiddenError(
      'Access denied. This portal is exclusively for Organisation Administrators. Please use the Recruiter login portal.',
      'PORTAL_ROLE_MISMATCH'
    );
  }

  return {
    ...result,
    user: {
      ...result.user,
      employeeId: orgRoleInfo?.employeeId || result.user.employeeId,
      activeRoleCode: 'ORGANISATION_ADMIN'
    }
  };
}

async function authenticateRecruiterPortal({ email, password, requestMeta }) {
  const result = await authAdapter.registerOrLoginCandidate({
    email,
    password,
    mode: 'login',
    ...requestMeta
  });

  const { user } = result;

  if (user.userType === 'CANDIDATE') {
    throw new ForbiddenError(
      'Access denied. This portal is exclusively for Recruiters and Hiring Team members.',
      'PORTAL_ROLE_MISMATCH'
    );
  }

  if (user.userType === 'PLATFORM_ADMIN') {
    throw new ForbiddenError(
      'Access denied. Platform Administrators must sign in through the Platform Admin portal.',
      'PORTAL_ROLE_MISMATCH'
    );
  }

  const orgRoleInfo = await resolveOrgEmployeeRole(user.organisationId, user.userId, user.employeeId);
  const resolvedRole = orgRoleInfo?.roleCode || (Array.isArray(user.roles) ? user.roles[0] : null);

  const validRecruiterRoles = new Set([
    'RECRUITER',
    'SENIOR_INTERVIEWER',
    'TECHNICAL_INTERVIEWER',
    'ORGANISATION_ADMIN'
  ]);

  const hasRecruiterRole =
    validRecruiterRoles.has(resolvedRole) ||
    (Array.isArray(user.roles) && user.roles.some((r) => validRecruiterRoles.has(r))) ||
    ['hr', 'manager', 'employee', 'org_admin'].includes(user.sharedRole);

  if (!hasRecruiterRole) {
    throw new ForbiddenError(
      'Access denied. Your account does not have active Recruiter or Hiring Team permissions.',
      'PORTAL_ROLE_MISMATCH'
    );
  }

  return {
    ...result,
    user: {
      ...result.user,
      employeeId: orgRoleInfo?.employeeId || result.user.employeeId,
      activeRoleCode: resolvedRole || 'RECRUITER'
    }
  };
}

module.exports = {
  authenticateCandidatePortal,
  authenticatePlatformAdminPortal,
  authenticateOrgAdminPortal,
  authenticateRecruiterPortal
};
