const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/apiResponse');
const applicationService = require('./application.service');

const applyPublic = asyncHandler(async (req, res) => {
  const authenticatedCandidateEmail =
    req.auth?.userType === 'CANDIDATE' && req.auth.emailVerified === true && req.auth.email
      ? String(req.auth.email).trim().toLowerCase()
      : null;
  const submittedEmail = req.body?.email ? String(req.body.email).trim().toLowerCase() : null;
  const verifiedCandidateAuthId =
    req.auth?.userType === 'CANDIDATE' &&
    req.auth.emailVerified === true &&
    authenticatedCandidateEmail &&
    authenticatedCandidateEmail === submittedEmail
      ? req.auth.userId
      : null;

  const data = await applicationService.submitPublicApplication(req.params.jobId, req.body, req.file, {
    authUserId: verifiedCandidateAuthId,
    requestId: req.requestId,
    ipAddress: req.ip
  });

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Application submitted successfully',
    data
  });
});

const listApplications = asyncHandler(async (req, res) => {
  const result = await applicationService.listOrganisationApplications(req.tenantId, req.query);
  return sendSuccess(res, {
    message: 'Applications fetched',
    data: result.items,
    meta: result.meta
  });
});

const getApplication = asyncHandler(async (req, res) => {
  const data = await applicationService.getOrganisationApplicationDetail(req.tenantId, req.params.id);
  return sendSuccess(res, {
    message: 'Application details fetched',
    data
  });
});

const screen = asyncHandler(async (req, res) => {
  const data = await applicationService.screenApplication(req.tenantId, req.params.id, req.body, {
    actorUserId: req.auth.userId,
    actorEmployeeId: req.auth.employeeId,
    actorRole: req.auth.activeRoleCode,
    requestId: req.requestId
  });
  return sendSuccess(res, {
    message: 'Application screening updated',
    data
  });
});

const finalDecision = asyncHandler(async (req, res) => {
  const data = await applicationService.recordFinalDecision(req.tenantId, req.params.id, req.body, {
    actorUserId: req.auth.userId,
    actorEmployeeId: req.auth.employeeId,
    actorRole: req.auth.activeRoleCode,
    requestId: req.requestId
  });
  return sendSuccess(res, {
    message: 'Final selection decision recorded',
    data
  });
});

module.exports = {
  applyPublic,
  listApplications,
  getApplication,
  screen,
  finalDecision
};

