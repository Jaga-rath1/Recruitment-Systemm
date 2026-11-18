'use strict';
const service = require('./entitlements.service');

// super_admin: entitlements for any organization
async function getForOrganization(req, res, next) {
  try {
    const data = await service.resolveForOrg(req.params.organizationId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

// authenticated org user: entitlements for their own organization (from JWT context)
async function getMine(req, res, next) {
  try {
    const data = await service.resolveForOrg(req.user.organizationId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

module.exports = { getForOrganization, getMine };
