const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/apiResponse');
const offerService = require('./offer.service');

const createOffer = asyncHandler(async (req, res) => {
  const { offer, idempotentReplay } = await offerService.createOrPrepareOffer(req.tenantId, req.body, req.file, {
    actorUserId: req.auth.userId,
    actorEmployeeId: req.auth.employeeId,
    actorRole: req.auth.activeRoleCode,
    permissions: req.auth.permissions,
    idempotencyKey: req.headers['idempotency-key'],
    requestId: req.requestId
  });
  return sendSuccess(res, {
    statusCode: idempotentReplay ? 200 : 201,
    message: 'Offer processed',
    data: offer
  });
});

const uploadLetter = asyncHandler(async (req, res) => {
  const data = await offerService.uploadOfferLetter(req.tenantId, req.params.id, req.file, {
    actorUserId: req.auth.userId,
    actorEmployeeId: req.auth.employeeId,
    actorRole: req.auth.activeRoleCode,
    permissions: req.auth.permissions,
    requestId: req.requestId
  });
  return sendSuccess(res, { message: 'Offer letter uploaded', data });
});

const sendOffer = asyncHandler(async (req, res) => {
  const data = await offerService.sendOfferToCandidate(req.tenantId, req.params.id, {
    actorUserId: req.auth.userId,
    actorEmployeeId: req.auth.employeeId,
    actorRole: req.auth.activeRoleCode,
    permissions: req.auth.permissions,
    requestId: req.requestId
  });
  return sendSuccess(res, { message: 'Offer sent to candidate', data });
});

const approveSalary = asyncHandler(async (req, res) => {
  const data = await offerService.approveSalary(req.tenantId, req.params.id, req.body, {
    actorUserId: req.auth.userId,
    actorEmployeeId: req.auth.employeeId,
    actorRole: req.auth.activeRoleCode,
    permissions: req.auth.permissions,
    requestId: req.requestId
  });
  return sendSuccess(res, { message: 'Salary offer approved', data });
});

const listOffers = asyncHandler(async (req, res) => {
  const result = await offerService.listOrganisationOffers(req.tenantId, req.query);
  return sendSuccess(res, {
    message: 'Offers fetched',
    data: result.items,
    meta: result.meta
  });
});

const getOffer = asyncHandler(async (req, res) => {
  const data = await offerService.getOrganisationOffer(req.tenantId, req.params.id);
  return sendSuccess(res, { message: 'Offer fetched', data });
});

module.exports = {
  createOffer,
  uploadLetter,
  sendOffer,
  approveSalary,
  listOffers,
  getOffer
};

