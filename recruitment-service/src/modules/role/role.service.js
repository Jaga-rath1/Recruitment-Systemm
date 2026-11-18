const { withTransaction } = require('../../config/database');
const { BadRequestError, ConflictError, NotFoundError } = require('../../utils/AppError');
const roleRepo = require('./role.repository');
const auditService = require('../audit/audit.service');
const { seedOrganisationRoles } = require('../../db/seed');

function formatRole(role) {
  return {
    id: role.id,
    organisationId: role.organisationId,
    code: role.code,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    isActive: role.isActive,
    assignedCount: role._count?.employeeAssignments ?? undefined,
    permissions: (role.rolePermissions || []).map((rp) => ({
      id: rp.permission.id,
      code: rp.permission.code,
      name: rp.permission.name,
      module: rp.permission.module
    })),
    createdAt: role.createdAt,
    updatedAt: role.updatedAt
  };
}

async function getPermissionCatalog() {
  return roleRepo.listPermissions();
}

async function getOrganisationRoles(organisationId) {
  let roles = await roleRepo.listRoles(organisationId);
  if (roles.length === 0) {
    await seedOrganisationRoles(organisationId);
    roles = await roleRepo.listRoles(organisationId);
  }
  return roles.map(formatRole);
}

async function createCustomRole(organisationId, input, context = {}) {
  const normalizedCode = input.code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  const existing = await roleRepo.findRoleByCode(organisationId, normalizedCode);
  if (existing) {
    throw new ConflictError(`Role with code ${normalizedCode} already exists`);
  }

  const permissions = await roleRepo.findPermissionsByCodes(input.permissionCodes || []);
  if ((input.permissionCodes || []).length > 0 && permissions.length !== input.permissionCodes.length) {
    throw new BadRequestError('One or more permission codes are invalid');
  }

  const created = await withTransaction(async (tx) => {
    const role = await roleRepo.createRole(
      organisationId,
      {
        code: normalizedCode,
        name: input.name.trim(),
        description: input.description.trim()
      },
      tx
    );

    const withPerms = await roleRepo.replaceRolePermissions(
      organisationId,
      role.id,
      permissions.map((p) => p.id),
      tx
    );

    await auditService.recordAudit(
      {
        organisationId,
        actorUserId: context.actorUserId,
        actorEmployeeId: context.actorEmployeeId,
        actorRole: context.actorRole,
        entityType: 'ROLE',
        entityId: role.id,
        action: 'ROLE_CREATED',
        requestId: context.requestId,
        afterState: { code: role.code, permissions: input.permissionCodes || [] }
      },
      tx
    );

    return withPerms;
  });

  return formatRole(created);
}

async function updateRolePermissions(organisationId, roleId, permissionCodes, context = {}) {
  const existing = await roleRepo.findRoleById(organisationId, roleId);
  if (!existing) {
    throw new NotFoundError('Role not found in organisation');
  }

  if (existing.code === 'CANDIDATE') {
    throw new BadRequestError('Candidate self-service role permissions cannot be escalated');
  }

  const permissions = await roleRepo.findPermissionsByCodes(permissionCodes);
  if (permissions.length !== permissionCodes.length) {
    throw new BadRequestError('One or more permission codes are invalid');
  }

  const beforeCodes = existing.rolePermissions.map((rp) => rp.permission.code);
  const updated = await withTransaction(async (tx) => {
    const res = await roleRepo.replaceRolePermissions(
      organisationId,
      roleId,
      permissions.map((p) => p.id),
      tx
    );

    await auditService.recordAudit(
      {
        organisationId,
        actorUserId: context.actorUserId,
        actorEmployeeId: context.actorEmployeeId,
        actorRole: context.actorRole,
        entityType: 'ROLE',
        entityId: roleId,
        action: 'ROLE_PERMISSIONS_UPDATED',
        requestId: context.requestId,
        beforeState: { permissions: beforeCodes },
        afterState: { permissions: permissionCodes }
      },
      tx
    );

    return res;
  });

  return formatRole(updated);
}

module.exports = {
  getPermissionCatalog,
  getOrganisationRoles,
  createCustomRole,
  updateRolePermissions
};
