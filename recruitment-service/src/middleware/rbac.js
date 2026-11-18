const env = require('../config/env');
const { getModels } = require('../config/database');
const employeeAdapter = require('../integrations/employee/employee.adapter');
const { DEFAULT_ORG_ROLES } = require('../modules/role/rbacDefinitions');
const { ForbiddenError, UnauthorizedError } = require('../utils/AppError');

async function resolveEffectivePermissions(auth, context = {}) {
  if (auth.userType === 'CANDIDATE') {
    return {
      roleCode: 'CANDIDATE',
      permissions: new Set(['candidate:self']),
      employeeId: null
    };
  }

  const {
    EmployeeRoleAssignment,
    RecruitmentRole,
    RecruitmentRolePermission,
    RecruitmentPermission
  } = getModels();

  const whereClause = auth.employeeId
    ? { organisationId: auth.organisationId, employeeId: auth.employeeId }
    : { organisationId: auth.organisationId, authUserId: auth.userId };

  const assignment = await EmployeeRoleAssignment.findOne({
    where: whereClause,
    include: [
      {
        model: RecruitmentRole,
        as: 'role',
        include: [
          {
            model: RecruitmentRolePermission,
            as: 'rolePermissions',
            include: [{ model: RecruitmentPermission, as: 'permission' }]
          }
        ]
      }
    ]
  });

  if (!assignment) {
    // Allow externally provisioned Organization Admins (from Auth Service + Platform Service)
    // only if no assignment rows have disabled this user inside Recruitment yet.
    if (env.integrationMode === 'live' && auth.sharedRole === 'org_admin' && auth.organisationId) {
      const orgAssignmentCount = await EmployeeRoleAssignment.count({
        where: { organisationId: auth.organisationId }
      });
      if (orgAssignmentCount === 0) {
        const orgAdminDef = DEFAULT_ORG_ROLES.find((r) => r.code === 'ORGANISATION_ADMIN');
        return {
          roleCode: 'ORGANISATION_ADMIN',
          permissions: new Set(orgAdminDef ? orgAdminDef.permissions : []),
          employeeId: auth.employeeId || null
        };
      }
    }
    return null;
  }

  if (!assignment.isActive || !assignment.role || !assignment.role.isActive) {
    return null;
  }

  // Respect live Employee Service activation/deactivation/termination/deletion status
  if (env.integrationMode === 'live' && assignment.employeeId) {
    const extEmployee = await employeeAdapter.getEmployeeById(auth.organisationId, assignment.employeeId, {
      actorUserId: auth.userId,
      requestId: context.requestId
    });
    if (!extEmployee || !extEmployee.isActive) {
      return null;
    }
  }

  const permSet = new Set(
    (assignment.role.rolePermissions || []).map((rp) => rp.permission?.code).filter(Boolean)
  );

  if (Array.isArray(assignment.customPermissions)) {
    for (const p of assignment.customPermissions) {
      permSet.add(p);
    }
  }
  if (Array.isArray(assignment.revokedPermissions)) {
    for (const p of assignment.revokedPermissions) {
      permSet.delete(p);
    }
  }

  return {
    roleCode: assignment.role.code,
    permissions: permSet,
    employeeId: assignment.employeeId
  };
}

function requirePermission(...allowedPermissions) {
  return async (req, _res, next) => {
    try {
      if (!req.auth) {
        return next(new UnauthorizedError('Authentication required'));
      }

      if (req.auth.userType === 'PLATFORM_ADMIN') {
        return next(new ForbiddenError('Platform admin cannot access tenant employee routes directly'));
      }

      const resolved = await resolveEffectivePermissions(req.auth, { requestId: req.requestId });
      if (!resolved) {
        return next(
          new ForbiddenError('Recruitment access is deactivated or no role assigned', 'ACCESS_REVOKED')
        );
      }

      req.auth.activeRoleCode = resolved.roleCode;
      req.auth.effectivePermissions = Array.from(resolved.permissions);
      if (!req.auth.employeeId && resolved.employeeId) {
        req.auth.employeeId = resolved.employeeId;
      }

      const hasAccess = allowedPermissions.some((perm) => resolved.permissions.has(perm));
      if (!hasAccess) {
        return next(
          new ForbiddenError(
            `Missing required permission: ${allowedPermissions.join(' or ')}`,
            'INSUFFICIENT_PERMISSION'
          )
        );
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };
}

function requirePlatformAdmin(req, _res, next) {
  if (!req.auth) {
    return next(new UnauthorizedError('Authentication required'));
  }
  const isPlatformAdmin =
    req.auth.userType === 'PLATFORM_ADMIN' ||
    (Array.isArray(req.auth.roles) && req.auth.roles.includes('PLATFORM_ADMIN'));
  if (!isPlatformAdmin) {
    return next(new ForbiddenError('Platform Admin privileges required'));
  }
  return next();
}

function requireCandidate(req, _res, next) {
  if (!req.auth) {
    return next(new UnauthorizedError('Authentication required'));
  }
  const isCandidate =
    req.auth.userType === 'CANDIDATE' ||
    (Array.isArray(req.auth.roles) && req.auth.roles.includes('CANDIDATE'));
  if (!isCandidate) {
    return next(new ForbiddenError('Candidate portal access only'));
  }
  return next();
}

module.exports = {
  resolveEffectivePermissions,
  requirePermission,
  requirePlatformAdmin,
  requireCandidate
};
