const auditRepository = require('./audit.repository');
const { parsePagination, buildPaginationMeta } = require('../../utils/pagination');

async function recordAudit(entry, tx = null) {
  return auditRepository.createAuditLog(entry, tx);
}

async function getOrganisationAuditLogs(organisationId, query = {}) {
  const { page, limit, skip } = parsePagination(query);
  const { items, total } = await auditRepository.listAuditLogs(organisationId, {
    entityType: query.entityType,
    action: query.action,
    skip,
    take: limit + 1
  });
  return buildPaginationMeta({ items, limit, total, page });
}

module.exports = {
  recordAudit,
  getOrganisationAuditLogs
};

