const { NotFoundError } = require('../../utils/AppError');
const { parsePagination, buildPaginationMeta } = require('../../utils/pagination');
const candidateRepo = require('./candidate.repository');
const storageAdapter = require('../../integrations/storage/storage.adapter');

async function listOrganisationCandidates(organisationId, query = {}) {
  const { page, limit, skip } = parsePagination(query);
  const { items, total } = await candidateRepo.listCandidates(organisationId, {
    search: query.search,
    skip,
    take: limit + 1
  });
  return buildPaginationMeta({ items, limit, total, page });
}

async function getOrganisationCandidate(organisationId, candidateId) {
  const candidate = await candidateRepo.findCandidateById(organisationId, candidateId);
  if (!candidate) {
    throw new NotFoundError('Candidate not found in organisation');
  }

  return {
    ...candidate,
    applications: (candidate.applications || []).map((app) => ({
      ...app,
      documents: (app.documents || []).map((doc) => ({
        ...doc,
        downloadUrl: storageAdapter.buildSignedDownloadUrl({
          storageKey: doc.storageKey,
          fileName: doc.fileName,
          mimeType: doc.mimeType,
          organisationId,
          docScope: 'APPLICATION',
          candidateEmail: candidate.email,
          candidateAuthUserId: candidate.authUserId
        })
      }))
    }))
  };
}

module.exports = {
  listOrganisationCandidates,
  getOrganisationCandidate
};

