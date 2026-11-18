const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/apiResponse');
const roleService = require('./role.service');

const listPermissions = asyncHandler(async (_req, res) => {
  const data = await roleService.getPermissionCatalog();
  return sendSuccess(res, { message: 'Permission catalog fetched', data });
});

const listRoles = asyncHandler(async (req, res) => {
  const data = await roleService.getOrganisationRoles(req.tenantId);
  return sendSuccess(res, { message: 'Organisation roles fetched', data });
});

const createRole = asyncHandler(async (req, res) => {
  const data = await roleService.createCustomRole(req.tenantId, req.body, {
    actorUserId: req.auth.userId,
    actorEmployeeId: req.auth.employeeId,
    actorRole: req.auth.activeRoleCode,
    requestId: req.requestId
  });
  return sendSuccess(res, { statusCode: 201, message: 'Role created', data });
});

const updatePermissions = asyncHandler(async (req, res) => {
  const data = await roleService.updateRolePermissions(req.tenantId, req.params.roleId, req.body.permissionCodes, {
    actorUserId: req.auth.userId,
    actorEmployeeId: req.auth.employeeId,
    actorRole: req.auth.activeRoleCode,
    requestId: req.requestId
  });
  return sendSuccess(res, { message: 'Role permissions updated', data });
});

module.exports = {
  listPermissions,
  listRoles,
  createRole,
  updatePermissions
};

