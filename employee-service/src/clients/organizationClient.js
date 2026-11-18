'use strict';
const { serviceRequest, serviceIdentity } = require('./serviceRequest');

const { ORGANIZATION_SERVICE_URL: ORG_SERVICE_URL } = require('../config/env');

/**
 * Does `id` exist as a `kind` (branches | departments | designations | teams | shifts)
 * inside this organization? Resolves true / false, or null when the
 * organization service cannot answer.
 */
async function existsInOrg(organizationId, kind, id) {
  const res = await serviceRequest(ORG_SERVICE_URL, {
    path: `/api/v1/organizations/${organizationId}/${kind}/${id}`,
    headers: serviceIdentity(organizationId),
    timeoutMs: 4000,
  });
  if (res.status === 200) return true;
  if (res.status === 404 || res.status === 400) return false;
  return null;
}

module.exports = { existsInOrg };
