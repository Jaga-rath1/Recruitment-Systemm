'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { JWT_SECRET, INTERNAL_SERVICE_TOKEN } = require('../src/config/env');
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

test('API Gateway Routing, Authentication, and Integration Tests', async (t) => {
  const { server, baseUrl } = await startTestServer();

  t.after(async () => {
    await stopTestServer(server);
  });

  const validToken = jwt.sign(
    {
      userId: '627eac04-414a-4a35-a8c7-5e738ab7bdb4',
      role: 'org_admin',
      email: 'admin@nexnuv.com',
      organizationId: '00000000-0000-0000-0000-000000000001',
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  await t.test('GET /health returns 200 and healthy gateway status', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.service, 'api-gateway');
    assert.equal(body.status, 'healthy');
  });

  await t.test('Protected routes reject unauthenticated requests with 401', async () => {
    const res = await fetch(`${baseUrl}/api/v1/tickets`);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.message, 'Unauthorized');
  });

  await t.test('Protected routes accept valid internal service token', async () => {
    const res = await fetch(`${baseUrl}/api/v1/tickets`, {
      headers: {
        'x-internal-token': INTERNAL_SERVICE_TOKEN,
        'x-user-id': '00000000-0000-0000-0000-000000000001',
        'x-user-role': 'service',
        'x-tenant-id': '00000000-0000-0000-0000-000000000001',
      }
    });
    assert.ok([200, 502].includes(res.status), `Expected 200 or 502 downstream response, got ${res.status}`);
  });

  await t.test('Protected routes authenticate valid JWT and proxy to ticket-service', async () => {
    const res = await fetch(`${baseUrl}/api/v1/tickets`, {
      headers: {
        'Authorization': `Bearer ${validToken}`,
        'x-tenant-id': '00000000-0000-0000-0000-000000000001',
      }
    });
    assert.ok([200, 502].includes(res.status), `Expected 200 or 502 downstream response, got ${res.status}`);
  });

  await t.test('Protected routes authenticate valid JWT and proxy to team-service', async () => {
    const res = await fetch(`${baseUrl}/api/v1/teams`, {
      headers: {
        'Authorization': `Bearer ${validToken}`,
        'x-tenant-id': '00000000-0000-0000-0000-000000000001',
      }
    });
    assert.ok([200, 502].includes(res.status), `Expected 200 or 502 downstream response, got ${res.status}`);
  });

  await t.test('Protected routes authenticate valid JWT and proxy to agent-service', async () => {
    const res = await fetch(`${baseUrl}/api/v1/agents`, {
      headers: {
        'Authorization': `Bearer ${validToken}`,
        'x-tenant-id': '00000000-0000-0000-0000-000000000001',
      }
    });
    assert.ok([200, 502].includes(res.status), `Expected 200 or 502 downstream response, got ${res.status}`);
  });

  await t.test('Protected routes authenticate valid JWT and proxy to notification-service', async () => {
    const res = await fetch(`${baseUrl}/api/v1/notifications`, {
      headers: {
        'Authorization': `Bearer ${validToken}`,
        'x-organization-id': '00000000-0000-0000-0000-000000000001',
      }
    });
    assert.ok([200, 502].includes(res.status), `Expected 200 or 502 downstream response, got ${res.status}`);
  });

  await t.test('Protected routes authenticate valid JWT and proxy to sla-service', async () => {
    const res = await fetch(`${baseUrl}/api/v1/sla/policies`, {
      headers: {
        'Authorization': `Bearer ${validToken}`,
        'x-tenant-id': '00000000-0000-0000-0000-000000000001',
      }
    });
    assert.ok([200, 502].includes(res.status), `Expected 200 or 502 downstream response, got ${res.status}`);
  });

  await t.test('Public auth route proxies to auth-service /me and forwards downstream response', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: {
        'Authorization': `Bearer ${validToken}`,
      }
    });
    assert.ok([200, 502].includes(res.status), `Expected 200 or 502 downstream response, got ${res.status}`);
  });

  await t.test('Unmatched API route returns 404 ROUTE_NOT_FOUND', async () => {
    const res = await fetch(`${baseUrl}/api/v1/nonexistent`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.code, 'ROUTE_NOT_FOUND');
  });
});
