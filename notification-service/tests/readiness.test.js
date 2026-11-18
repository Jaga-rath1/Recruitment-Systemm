'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const app = require('../src/app');
const sequelize = require('../src/config/database');

async function startTestServer() {
  await sequelize.authenticate();
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

test('Notification Service Health and Readiness Endpoints', async (t) => {
  const { server, baseUrl } = await startTestServer();

  t.after(async () => {
    await stopTestServer(server);
    await sequelize.close().catch(() => {});
  });

  await t.test('GET /health returns 200 and process liveness info', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.service, 'notification-service');
    assert.equal(body.status, 'healthy');
    assert.ok(body.timestamp);
  });

  await t.test('GET /ready returns 200 and readiness status when DB is connected', async () => {
    const res = await fetch(`${baseUrl}/ready`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.status, 'ready');
    assert.equal(body.service, 'notification-service');
    assert.equal(body.checks?.database, 'up');
    assert.ok(body.timestamp);
    // Ensure no secrets leaked
    assert.equal(body.password, undefined);
    assert.equal(body.DATABASE_URL, undefined);
    assert.equal(body.stack, undefined);
  });

  await t.test('GET /health/ready alias returns 200', async () => {
    const res = await fetch(`${baseUrl}/health/ready`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ready');
    assert.equal(body.service, 'notification-service');
    assert.equal(body.checks?.database, 'up');
  });

  await t.test('GET /ready returns 503 when database dependency fails', async () => {
    const originalAuthenticate = sequelize.authenticate;
    try {
      sequelize.authenticate = async () => {
        throw new Error('Simulated database connection failure');
      };

      const res = await fetch(`${baseUrl}/ready`);
      assert.equal(res.status, 503);
      const body = await res.json();
      assert.equal(body.success, false);
      assert.equal(body.status, 'not_ready');
      assert.equal(body.service, 'notification-service');
      assert.equal(body.checks?.database, 'down');
      assert.ok(body.timestamp);
      // Verify no sensitive info or stack traces exposed
      assert.equal(body.stack, undefined);
      assert.equal(body.message, undefined);
    } finally {
      sequelize.authenticate = originalAuthenticate;
    }
  });

  await t.test('GET /nonexistent returns 404 with standard error format', async () => {
    const res = await fetch(`${baseUrl}/nonexistent`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.code, 'ROUTE_NOT_FOUND');
  });
});
