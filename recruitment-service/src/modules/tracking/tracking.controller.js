const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/apiResponse');
const trackingService = require('./tracking.service');
const candidateClaimService = require('../candidate/candidateClaim.service');

const getPortalOverview = asyncHandler(async (req, res) => {
  const data = await trackingService.getCandidatePortalOverview(req.auth);
  return sendSuccess(res, { message: 'Candidate portal data fetched', data });
});

const updateProfile = asyncHandler(async (req, res) => {
  const data = await trackingService.updateCandidateSelfProfile(req.auth, req.body);
  return sendSuccess(res, { message: 'Candidate profile updated', data });
});

const respondOffer = asyncHandler(async (req, res) => {
  const data = await trackingService.respondToOffer(req.auth, req.params.offerId, req.body, {
    requestId: req.requestId
  });
  return sendSuccess(res, { message: `Offer ${req.body.decision === 'ACCEPT' ? 'accepted' : 'declined'}`, data });
});

const claimApplications = asyncHandler(async (req, res) => {
  const data = await candidateClaimService.claimCandidateApplications({
    auth: req.auth,
    organisationId: req.body.organisationId,
    applicationReference: req.body.applicationReference || null,
    requestId: req.requestId,
    ipAddress: req.ip || null,
    userAgent: req.get('user-agent') || null
  });
  return sendSuccess(res, { message: 'Application ownership verified and claimed', data });
});

const getReports = asyncHandler(async (req, res) => {
  const data = await trackingService.getOrganisationReports(req.tenantId);
  return sendSuccess(res, { message: 'Recruitment reports fetched', data });
});

module.exports = {
  getPortalOverview,
  updateProfile,
  respondOffer,
  claimApplications,
  getReports
};

