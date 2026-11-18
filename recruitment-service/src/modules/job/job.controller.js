const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/apiResponse');
const jobService = require('./job.service');

const listPublicJobs = asyncHandler(async (req, res) => {
  const result = await jobService.listPublicCareersJobs(req.query);
  return sendSuccess(res, {
    message: 'Published careers jobs fetched',
    data: result.items,
    meta: result.meta
  });
});

const getPublicJob = asyncHandler(async (req, res) => {
  const data = await jobService.getPublicCareersJobDetail(req.params.identifier);
  return sendSuccess(res, {
    message: 'Published job detail fetched',
    data
  });
});

const syncHrms = asyncHandler(async (req, res) => {
  const data = await jobService.syncHrmsJobs(req.tenantId, {
    actorUserId: req.auth.userId,
    actorEmployeeId: req.auth.employeeId,
    actorRole: req.auth.activeRoleCode,
    requestId: req.requestId
  });
  return sendSuccess(res, {
    message: `Synced ${data.length} HRMS jobs`,
    data
  });
});

const listOrgJobs = asyncHandler(async (req, res) => {
  const result = await jobService.listOrganisationJobs(req.tenantId, req.query);
  return sendSuccess(res, {
    message: 'Organisation jobs fetched',
    data: result.items,
    meta: result.meta
  });
});

const getOrgJob = asyncHandler(async (req, res) => {
  const data = await jobService.getOrganisationJob(req.tenantId, req.params.id);
  return sendSuccess(res, { message: 'Job fetched', data });
});

const createManual = asyncHandler(async (req, res) => {
  const data = await jobService.createManualJob(req.tenantId, req.body, {
    actorUserId: req.auth.userId,
    actorEmployeeId: req.auth.employeeId,
    actorRole: req.auth.activeRoleCode,
    requestId: req.requestId
  });
  return sendSuccess(res, { statusCode: 201, message: 'Job created', data });
});

const update = asyncHandler(async (req, res) => {
  const data = await jobService.updateJob(req.tenantId, req.params.id, req.body, {
    actorUserId: req.auth.userId,
    actorEmployeeId: req.auth.employeeId,
    actorRole: req.auth.activeRoleCode,
    requestId: req.requestId
  });
  return sendSuccess(res, { message: 'Job updated', data });
});

const publish = asyncHandler(async (req, res) => {
  const data = await jobService.changeJobPublicationStatus(req.tenantId, req.params.id, 'PUBLISHED', {
    actorUserId: req.auth.userId,
    actorEmployeeId: req.auth.employeeId,
    actorRole: req.auth.activeRoleCode,
    requestId: req.requestId
  });
  return sendSuccess(res, { message: 'Job published to Careers page', data });
});

const unpublish = asyncHandler(async (req, res) => {
  const data = await jobService.changeJobPublicationStatus(req.tenantId, req.params.id, 'UNPUBLISHED', {
    actorUserId: req.auth.userId,
    actorEmployeeId: req.auth.employeeId,
    actorRole: req.auth.activeRoleCode,
    requestId: req.requestId
  });
  return sendSuccess(res, { message: 'Job unpublished from Careers page', data });
});

const close = asyncHandler(async (req, res) => {
  const data = await jobService.changeJobPublicationStatus(req.tenantId, req.params.id, 'CLOSED', {
    actorUserId: req.auth.userId,
    actorEmployeeId: req.auth.employeeId,
    actorRole: req.auth.activeRoleCode,
    requestId: req.requestId
  });
  return sendSuccess(res, { message: 'Job closed', data });
});

module.exports = {
  listPublicJobs,
  getPublicJob,
  syncHrms,
  listOrgJobs,
  getOrgJob,
  createManual,
  update,
  publish,
  unpublish,
  close
};

