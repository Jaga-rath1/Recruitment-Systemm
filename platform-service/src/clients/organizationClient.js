'use strict';
const http = require('http');
const https = require('https');

/**
 * Resolves an organization's status ('active' | 'inactive'), or null when the
 * organization service cannot answer. Never throws.
 */
function getOrganizationStatus(organizationId) {
  return new Promise((resolve) => {
    const { ORGANIZATION_SERVICE_URL: ORG_SERVICE_URL, INTERNAL_SERVICE_TOKEN } = require('../config/env');
    const parsed = new URL(ORG_SERVICE_URL);
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.request({
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: `/api/v1/organizations/${organizationId}`,
      method: 'GET',
      headers: {
        'x-user-id': 'svc-platform',
        'x-user-role': 'super_admin',
        'x-organization-id': organizationId,
        'x-internal-token': INTERNAL_SERVICE_TOKEN,
      },
    }, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        try {
          const body = JSON.parse(raw);
          if (res.statusCode === 200 && body.data) return resolve(body.data.status);
          if (res.statusCode === 404) return resolve('not_found');
          resolve(null);
        } catch { resolve(null); }
      });
    });
    req.setTimeout(3000, () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
    req.end();
  });
}

module.exports = { getOrganizationStatus };
