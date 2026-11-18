const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/apiResponse');
const interviewService = require('./interview.service');

const schedule = asyncHandler(async (req, res) => {
  const data = await interviewService.scheduleInterview(req.tenantId, req.body, {
    actorUserId: req.auth.userId,
    actorEmployeeId: req.auth.employeeId,
    actorRole: req.auth.activeRoleCode,
    requestId: req.requestId
  });
  return sendSuccess(res, { statusCode: 201, message: 'Interview scheduled', data });
});

const reschedule = asyncHandler(async (req, res) => {
  const data = await interviewService.rescheduleInterview(req.tenantId, req.params.id, req.body, {
    actorUserId: req.auth.userId,
    actorEmployeeId: req.auth.employeeId,
    actorRole: req.auth.activeRoleCode,
    requestId: req.requestId
  });
  return sendSuccess(res, { message: 'Interview rescheduled', data });
});

const listAll = asyncHandler(async (req, res) => {
  const result = await interviewService.listOrganisationInterviews(req.tenantId, req.query);
  return sendSuccess(res, {
    message: 'Interviews fetched',
    data: result.items,
    meta: result.meta
  });
});

const listAssignedTechnical = asyncHandler(async (req, res) => {
  const result = await interviewService.listAssignedInterviews(req.tenantId, req.auth.employeeId, 'TECHNICAL', req.query);
  return sendSuccess(res, {
    message: 'Assigned technical interviews fetched',
    data: result.items,
    meta: result.meta
  });
});

const listAssignedManagerial = asyncHandler(async (req, res) => {
  const result = await interviewService.listAssignedInterviews(req.tenantId, req.auth.employeeId, 'MANAGERIAL', req.query);
  return sendSuccess(res, {
    message: 'Assigned managerial interviews fetched',
    data: result.items,
    meta: result.meta
  });
});

const submitFeedback = asyncHandler(async (req, res) => {
  const data = await interviewService.submitInterviewFeedback(req.tenantId, req.params.id, req.body, {
    actorUserId: req.auth.userId,
    actorEmployeeId: req.auth.employeeId,
    actorRole: req.auth.activeRoleCode,
    requestId: req.requestId
  });
  return sendSuccess(res, { statusCode: 201, message: 'Interview feedback submitted', data });
});

module.exports = {
  schedule,
  reschedule,
  listAll,
  listAssignedTechnical,
  listAssignedManagerial,
  submitFeedback
};

