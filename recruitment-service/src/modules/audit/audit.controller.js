const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/apiResponse');
const auditService = require('./audit.service');

const listOrganisationLogs = asyncHandler(async (req, res) => {
  const result = await auditService.getOrganisationAuditLogs(req.tenantId, req.query);
  return sendSuccess(res, {
    message: 'Audit logs fetched',
    data: result.items,
    meta: result.meta
  });
});

module.exports = {
  listOrganisationLogs
};

