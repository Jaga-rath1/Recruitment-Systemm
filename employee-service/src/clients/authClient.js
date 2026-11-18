'use strict';
const { serviceRequest } = require('./serviceRequest');

const { AUTH_SERVICE_URL } = require('../config/env');

function makeError(message, status) {
  return Object.assign(new Error(message), { status });
}

// auth-service authorizes with the JWT itself, so account operations are made
// on behalf of the signed-in admin by forwarding their Authorization header.
async function call(method, path, authorization, body) {
  if (!authorization) throw makeError('Missing credentials for account operation', 401);
  const res = await serviceRequest(AUTH_SERVICE_URL, { method, path, body, headers: { authorization } });
  if (res.status === 0) throw makeError('Auth service is unavailable', 503);
  if (res.status < 200 || res.status >= 300) {
    throw makeError((res.body && res.body.message) || 'Auth service error', res.status);
  }
  return res.body;
}

/**
 * Provision a login account. Resolves
 * { user, emailDelivered, tempPassword? } — tempPassword is only present
 * when the credentials email could not be delivered.
 */
function provision(authorization, { email, role, firstName, lastName }) {
  return call('POST', '/api/v1/auth/provision', authorization, {
    email, role: role || 'employee', firstName, lastName,
  });
}

function setUserStatus(authorization, authUserId, status) {
  return call('PATCH', `/api/v1/auth/users/${authUserId}/status`, authorization, { status });
}

module.exports = { provision, setUserStatus };
