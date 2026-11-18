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

function createToken(role, orgId = '00000000-0000-0000-0000-000000000001') {
  return jwt.sign(
    {
      userId: `user-${role}-1`,
      role,
      email: `${role}@nexnuv.com`,
      organizationId: orgId,
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

test('API Gateway RBAC Authorization Suite', async (t) => {
  const { server, baseUrl } = await startTestServer();

  t.after(async () => {
    await stopTestServer(server);
  });

  const platformAdminToken = createToken('super_admin');
  const orgAdminToken = createToken('org_admin');
  const helpdeskManagerToken = createToken('manager');
  const supportAgentToken = createToken('agent');
  const employeeToken = createToken('employee');

  await t.test('Role 1: Platform Admin is FORBIDDEN from tenant tickets list', async () => {
    const res = await fetch(`${baseUrl}/api/v1/tickets`, {
      headers: { Authorization: `Bearer ${platformAdminToken}` },
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.code, 'FORBIDDEN');
    assert.ok(body.message.includes('Platform Admin'));
  });

  await t.test('Role 1: Platform Admin is FORBIDDEN from tenant ticket creation', async () => {
    const res = await fetch(`${baseUrl}/api/v1/tickets`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${platformAdminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'Test' }),
    });
    assert.equal(res.status, 403);
  });

  await t.test('Role 1: Platform Admin is FORBIDDEN from tenant teams and agents', async () => {
    const resTeams = await fetch(`${baseUrl}/api/v1/teams`, {
      headers: { Authorization: `Bearer ${platformAdminToken}` },
    });
    assert.equal(resTeams.status, 403);

    const resAgents = await fetch(`${baseUrl}/api/v1/agents`, {
      headers: { Authorization: `Bearer ${platformAdminToken}` },
    });
    assert.equal(resAgents.status, 403);
  });

  await t.test('Role 1: Platform Admin is FORBIDDEN from tenant knowledge base', async () => {
    const res = await fetch(`${baseUrl}/api/v1/knowledge-base/articles`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${platformAdminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'Test Article' }),
    });
    assert.equal(res.status, 403);
  });

  await t.test('Role 4: Support Agent can read teams and agents (GET), but is FORBIDDEN from modifying (POST)', async () => {
    const resGetTeams = await fetch(`${baseUrl}/api/v1/teams`, {
      headers: { Authorization: `Bearer ${supportAgentToken}` },
    });
    assert.notEqual(resGetTeams.status, 403, 'Support agent should be able to read teams');

    const resGetAgents = await fetch(`${baseUrl}/api/v1/agents`, {
      headers: { Authorization: `Bearer ${supportAgentToken}` },
    });
    assert.notEqual(resGetAgents.status, 403, 'Support agent should be able to read agents');

    const resPostTeams = await fetch(`${baseUrl}/api/v1/teams`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supportAgentToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Unauthorized Team' }),
    });
    assert.equal(resPostTeams.status, 403, 'Support agent cannot create teams');

    const resPostAgents = await fetch(`${baseUrl}/api/v1/agents`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supportAgentToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: 'unauthorized@nexnuv.com' }),
    });
    assert.equal(resPostAgents.status, 403, 'Support agent cannot create agents');
  });

  await t.test('Role 4: Support Agent is FORBIDDEN from SLA config', async () => {
    const res = await fetch(`${baseUrl}/api/v1/sla/tenant-policies`, {
      headers: { Authorization: `Bearer ${supportAgentToken}` },
    });
    assert.equal(res.status, 403);
  });

  await t.test('Role 5: Employee is FORBIDDEN from operational tickets list', async () => {
    const res = await fetch(`${baseUrl}/api/v1/tickets`, {
      headers: { Authorization: `Bearer ${employeeToken}` },
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.code, 'FORBIDDEN');
    assert.ok(body.message.includes('Employee'));
  });

  await t.test('Role 5: Employee can read teams and agents (GET), but is FORBIDDEN from modifying (POST)', async () => {
    const resGetTeams = await fetch(`${baseUrl}/api/v1/teams`, {
      headers: { Authorization: `Bearer ${employeeToken}` },
    });
    assert.notEqual(resGetTeams.status, 403, 'Employee should be able to read teams for ticket creation');

    const resGetAgents = await fetch(`${baseUrl}/api/v1/agents`, {
      headers: { Authorization: `Bearer ${employeeToken}` },
    });
    assert.notEqual(resGetAgents.status, 403, 'Employee should be able to read agents');

    const resPostTeams = await fetch(`${baseUrl}/api/v1/teams`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${employeeToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Unauthorized Team' }),
    });
    assert.equal(resPostTeams.status, 403, 'Employee cannot create teams');

    const resPostAgents = await fetch(`${baseUrl}/api/v1/agents`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${employeeToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: 'unauthorized@nexnuv.com' }),
    });
    assert.equal(resPostAgents.status, 403, 'Employee cannot create agents');
  });

  await t.test('Role 2 & 3: Org Admin and Helpdesk Manager pass gateway role checks for teams & agents', async () => {
    // Note: If backend service isn't running on the test port, gateway passes rbac and attempts proxy (returning 500/502/504, NOT 403)
    const resOrgTeams = await fetch(`${baseUrl}/api/v1/teams`, {
      headers: { Authorization: `Bearer ${orgAdminToken}` },
    });
    // Should NOT be 403 Forbidden
    assert.notEqual(resOrgTeams.status, 403, 'Org Admin should not receive 403 on teams');

    const resMgrTeams = await fetch(`${baseUrl}/api/v1/teams`, {
      headers: { Authorization: `Bearer ${helpdeskManagerToken}` },
    });
    // Should NOT be 403 Forbidden
    assert.notEqual(resMgrTeams.status, 403, 'Manager should not receive 403 on teams');
  });

  await t.test('Role 2 & 3: Org Admin and Helpdesk Manager are FORBIDDEN from personal and team ticket queues', async () => {
    const resOrgMy = await fetch(`${baseUrl}/api/v1/tickets?filter=my`, {
      headers: { Authorization: `Bearer ${orgAdminToken}` },
    });
    assert.equal(resOrgMy.status, 403);
    const bodyOrg = await resOrgMy.json();
    assert.equal(bodyOrg.code, 'FORBIDDEN');

    const resMgrTeam = await fetch(`${baseUrl}/api/v1/tickets?filter=team`, {
      headers: { Authorization: `Bearer ${helpdeskManagerToken}` },
    });
    assert.equal(resMgrTeam.status, 403);
  });

  await t.test('Role 4: Support Agent passes gateway checks for personal and team ticket queues', async () => {
    const resAgentMy = await fetch(`${baseUrl}/api/v1/tickets?filter=my`, {
      headers: { Authorization: `Bearer ${supportAgentToken}` },
    });
    assert.notEqual(resAgentMy.status, 403, 'Support agent should be permitted to query My Tickets');

    const resAgentTeam = await fetch(`${baseUrl}/api/v1/tickets?filter=team`, {
      headers: { Authorization: `Bearer ${supportAgentToken}` },
    });
    assert.notEqual(resAgentTeam.status, 403, 'Support agent should be permitted to query Team Tickets');
  });

  await t.test('Unauthenticated request to protected route returns 401 Unauthorized', async () => {
    const res = await fetch(`${baseUrl}/api/v1/tickets`);
    assert.equal(res.status, 401);
  });
});
