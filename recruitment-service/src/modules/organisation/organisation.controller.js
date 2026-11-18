const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/apiResponse');
const organisationService = require('./organisation.service');

const getProfile = asyncHandler(async (req, res) => {
  const data = await organisationService.getOrganisationProfile(req.tenantId);
  return sendSuccess(res, { message: 'Organisation profile fetched', data });
});

const getDashboard = asyncHandler(async (req, res) => {
  const data = await organisationService.getOrganisationDashboard(req.tenantId);
  return sendSuccess(res, { message: 'Organisation dashboard fetched', data });
});

const listEmployees = asyncHandler(async (req, res) => {
  const data = await organisationService.listOrganisationEmployees(req.tenantId, req.query);
  return sendSuccess(res, { message: 'Employees fetched', data });
});

const addEmployee = asyncHandler(async (req, res) => {
  const data = await organisationService.addAndInviteEmployee(req.tenantId, req.body, {
    actorUserId: req.auth.userId,
    actorEmployeeId: req.auth.employeeId,
    actorRole: req.auth.activeRoleCode,
    authorization: req.headers.authorization,
    requestId: req.requestId
  });
  return sendSuccess(res, { statusCode: 201, message: 'Employee added and invited', data });
});

const assignRole = asyncHandler(async (req, res) => {
  const data = await organisationService.assignEmployeeRole(req.tenantId, req.params.employeeId, req.body, {
    actorUserId: req.auth.userId,
    actorEmployeeId: req.auth.employeeId,
    actorRole: req.auth.activeRoleCode,
    requestId: req.requestId
  });
  return sendSuccess(res, { message: 'Employee role updated', data });
});

const updatePermissions = asyncHandler(async (req, res) => {
  const data = await organisationService.updateEmployeePermissions(req.tenantId, req.params.employeeId, req.body, {
    actorUserId: req.auth.userId,
    actorEmployeeId: req.auth.employeeId,
    actorRole: req.auth.activeRoleCode,
    requestId: req.requestId
  });
  return sendSuccess(res, { message: 'Employee permissions updated', data });
});

const deactivateAccess = asyncHandler(async (req, res) => {
  const data = await organisationService.setEmployeeRecruitmentAccess(req.tenantId, req.params.employeeId, false, {
    actorUserId: req.auth.userId,
    actorEmployeeId: req.auth.employeeId,
    actorRole: req.auth.activeRoleCode,
    requestId: req.requestId
  });
  return sendSuccess(res, { message: 'Recruitment access deactivated', data });
});

const reactivateAccess = asyncHandler(async (req, res) => {
  const data = await organisationService.setEmployeeRecruitmentAccess(req.tenantId, req.params.employeeId, true, {
    actorUserId: req.auth.userId,
    actorEmployeeId: req.auth.employeeId,
    actorRole: req.auth.activeRoleCode,
    requestId: req.requestId
  });
  return sendSuccess(res, { message: 'Recruitment access reactivated', data });
});

const getActivity = asyncHandler(async (req, res) => {
  const data = await organisationService.getEmployeeActivity(req.tenantId, req.params.employeeId);
  return sendSuccess(res, { message: 'Employee recruitment activity fetched', data });
});

const resendInvitation = asyncHandler(async (req, res) => {
  const data = await organisationService.resendEmployeeInvitation(req.tenantId, req.params.employeeId, {
    actorUserId: req.auth.userId,
    actorEmployeeId: req.auth.employeeId,
    actorRole: req.auth.activeRoleCode,
    requestId: req.requestId
  });
  return sendSuccess(res, { message: 'Employee invitation resent', data });
});

const inspectActivation = asyncHandler(async (req, res) => {
  const data = await organisationService.inspectEmployeeActivation(req.query.token);
  return sendSuccess(res, { message: 'Employee invitation inspected', data });
});

const activateEmployee = asyncHandler(async (req, res) => {
  const data = await organisationService.activateEmployeeAccount(req.body, {
    requestId: req.requestId,
    ipAddress: req.ip
  });
  return sendSuccess(res, { message: data.message, data });
});

module.exports = {
  getProfile,
  getDashboard,
  listEmployees,
  addEmployee,
  assignRole,
  updatePermissions,
  deactivateAccess,
  reactivateAccess,
  getActivity,
  resendInvitation,
  inspectActivation,
  activateEmployee
};

