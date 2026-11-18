const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/apiResponse');
const joiningService = require('./joining.service');

const initiate = asyncHandler(async (req, res) => {
  const { joining, idempotentReplay } = await joiningService.initiateJoining(req.tenantId, req.body, req.file, {
    actorUserId: req.auth.userId,
    actorEmployeeId: req.auth.employeeId,
    actorRole: req.auth.activeRoleCode,
    idempotencyKey: req.headers['idempotency-key'],
    requestId: req.requestId
  });
  return sendSuccess(res, {
    statusCode: idempotentReplay ? 200 : 201,
    message: 'Joining initiated',
    data: joining
  });
});

const uploadLetter = asyncHandler(async (req, res) => {
  const data = await joiningService.uploadAndSendJoiningLetter(req.tenantId, req.params.id, req.file, {
    actorUserId: req.auth.userId,
    actorEmployeeId: req.auth.employeeId,
    actorRole: req.auth.activeRoleCode,
    requestId: req.requestId
  });
  return sendSuccess(res, { message: 'Joining letter uploaded and dispatched', data });
});

const updateStatus = asyncHandler(async (req, res) => {
  const data = await joiningService.updateJoiningStatus(req.tenantId, req.params.id, req.body, {
    actorUserId: req.auth.userId,
    actorEmployeeId: req.auth.employeeId,
    actorRole: req.auth.activeRoleCode,
    requestId: req.requestId
  });
  return sendSuccess(res, { message: 'Joining status updated', data });
});

const retryEmployeeSync = asyncHandler(async (req, res) => {
  const result = await joiningService.retryEmployeeSync(req.tenantId, req.params.id, {
    actorUserId: req.auth.userId,
    actorEmployeeId: req.auth.employeeId,
    actorRole: req.auth.activeRoleCode,
    requestId: req.requestId
  });
  return sendSuccess(res, {
    statusCode: result.status === 'ALREADY_SYNCED' ? 200 : 201,
    message: result.message,
    data: result
  });
});

const listJoining = asyncHandler(async (req, res) => {
  const result = await joiningService.listOrganisationJoiningRecords(req.tenantId, req.query);
  return sendSuccess(res, {
    message: 'Joining records fetched',
    data: result.items,
    meta: result.meta
  });
});

module.exports = {
  initiate,
  uploadLetter,
  updateStatus,
  retryEmployeeSync,
  listJoining
};

