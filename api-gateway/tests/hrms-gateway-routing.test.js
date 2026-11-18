'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { JWT_SECRET } = require('../src/config/env');
const http = require('node:http');

function startTestServer() {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const baseUrl = `http://127.0.0.1:${port}`;
      resolve({ server, baseUrl });
    });
  });
}

function stopTestServer(server) {
  return new Promise((resolve) => {
    server.close(resolve);
  });
}

test('HRMS Gateway Routing & Authentication Suite', async (t) => {
  const { server, baseUrl } = await startTestServer();

  t.after(async () => {
    await stopTestServer(server);
  });

  const hrmsToken = jwt.sign({
    userId: '11111111-1111-1111-1111-111111111111',
    email: 'hr@nexnuv.com',
    role: 'hr',
    organizationId: '00000000-0000-0000-0000-000000000001',
  }, JWT_SECRET);

  const hrmsRoutes = [
    '/api/v1/platform',
    '/api/v1/organizations',
    '/api/v1/employees',
    '/api/v1/attendance',
    '/api/v1/attendance-settings',
    '/api/v1/timesheets',
    '/api/v1/leave-types',
    '/api/v1/leave-balances',
    '/api/v1/leave-requests',
  ];

  for (const route of hrmsRoutes) {
    await t.test(`Unauthenticated request to ${route} returns 401 Unauthorized`, async () => {
      const res = await fetch(`${baseUrl}${route}`);
      assert.equal(res.status, 401);
    });

    await t.test(`Authenticated request with HRMS token proxies ${route} (returns 200 or 502)`, async () => {
      const res = await fetch(`${baseUrl}${route}`, {
        headers: { Authorization: `Bearer ${hrmsToken}` }
      });
      // Downstream microservice is not running in isolated gateway test, so expect 502 Bad Gateway - NOT 401 Unauthorized or 404 Not Found
      assert.ok([200, 502].includes(res.status), `Expected 200 or 502, got ${res.status}`);
    });
  }

  await t.test('Public device-attendance route bypasses bearer auth', async () => {
    const res = await fetch(`${baseUrl}/api/v1/device-attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceToken: 'dev-123' }),
    });
    // Public route proxies directly to attendance service (returns 502 because service isn't running), NOT 401
    assert.equal(res.status, 502);
  });
});
