'use strict';
const http = require('http');
const https = require('https');

const { INTERNAL_SERVICE_TOKEN } = require('../config/env');
const SERVICE_NAME = 'employee-service';

/**
 * Minimal JSON-over-HTTP call to another backend service.
 * Resolves { status, body } for any HTTP response and { status: 0, body: null }
 * when the service cannot be reached. Never rejects.
 */
function serviceRequest(baseUrl, { method = 'GET', path, headers = {}, body, timeoutMs = 5000 }) {
  return new Promise((resolve) => {
    const url = new URL(path, baseUrl);
    const payload = body === undefined ? null : JSON.stringify(body);
    const client = url.protocol === 'https:' ? https : http;
    const req = client.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: {
        'x-internal-token': INTERNAL_SERVICE_TOKEN,
        'x-service-name': SERVICE_NAME,
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    }, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(raw); } catch { /* non-JSON body */ }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve({ status: 0, body: null }); });
    req.on('error', () => resolve({ status: 0, body: null }));
    if (payload) req.write(payload);
    req.end();
  });
}

// Identity used when this service acts on its own behalf inside an organization.
function serviceIdentity(organizationId) {
  return {
    'x-user-id': 'svc-employee',
    'x-user-role': 'super_admin',
    'x-organization-id': organizationId,
  };
}

module.exports = { serviceRequest, serviceIdentity };
