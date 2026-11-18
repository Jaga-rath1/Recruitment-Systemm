'use strict';
const { serviceRequest } = require('./serviceRequest');

const { PLATFORM_SERVICE_URL } = require('../config/env');

/** Entitlements of the user's organization, or null when platform-service cannot answer. */
async function getEntitlements(user) {
  const res = await serviceRequest(PLATFORM_SERVICE_URL, {
    path: '/api/v1/platform/entitlements/me',
    headers: {
      'x-user-id': user.userId,
      'x-user-role': user.role,
      'x-organization-id': user.organizationId,
    },
    timeoutMs: 8000,
  });
  return res.status === 200 && res.body && res.body.data ? res.body.data : null;
}

module.exports = { getEntitlements };
