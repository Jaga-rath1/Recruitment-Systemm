const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/apiResponse');
const candidateService = require('./candidate.service');

const listCandidates = asyncHandler(async (req, res) => {
  const result = await candidateService.listOrganisationCandidates(req.tenantId, req.query);
  return sendSuccess(res, {
    message: 'Candidates fetched',
    data: result.items,
    meta: result.meta
  });
});

const getCandidate = asyncHandler(async (req, res) => {
  const data = await candidateService.getOrganisationCandidate(req.tenantId, req.params.id);
  return sendSuccess(res, {
    message: 'Candidate profile fetched',
    data
  });
});

module.exports = {
  listCandidates,
  getCandidate
};

