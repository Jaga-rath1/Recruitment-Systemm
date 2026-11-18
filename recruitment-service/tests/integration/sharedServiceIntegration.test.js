import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const http = require('http');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const { startTestDatabase, resetTestState, stopTestDatabase } = require('../helpers/testDb');
const { registerAndVerifyCandidate } = require('../helpers/candidateAuthHelper');
const { createApp } = require('../../src/app');
const env = require('../../src/config/env');
const { seedOrganisationRoles } = require('../../src/db/seed');
const { getModels } = require('../../src/config/database');
const notificationAdapter = require('../../src/integrations/notification/notification.adapter');

// NOTE: These integration tests use clearly labeled local HTTP test servers implementing the
// exact verified contracts of the six external NEXNUV shared services (no shared-service code was modified).

const AUTH_SECRET_EXTERNAL = 'external-auth-service-only-secret-never-shared-with-recruitment';

function createMockHttpServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      let body = null;
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch (_err) {
        body = raw;
      }
      await handler(req, res, body);
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    if (!server) return resolve();
    server.close(() => resolve());
  });
}

describe('Shared Microservices Live Contract Integration Tests [Local HTTP Contract Test Harness]', () => {
  let app;
  let servers = [];
  let orgState;
  let platformState;
  let employeeState;
  let authUsers;
  let receivedNotifications;
  let orgRetryCounter;
  let originalMode;
  let originalUrls;
  let originalTimeout;

  const orgIdA = 'aaaaaaaa-1111-4111-8111-111111111111';
  const orgIdB = 'bbbbbbbb-2222-4222-8222-222222222222';
  const userIdAdmin = '11111111-aaaa-4111-8111-111111111111';
  const empIdAdmin = '22222222-bbbb-4222-8222-222222222222';
  const empIdInactive = '33333333-cccc-4333-8333-333333333333';

  beforeAll(async () => {
    await startTestDatabase();
    app = createApp();
    originalMode = env.integrationMode;
    originalTimeout = env.services.requestTimeoutMs;
    originalUrls = { ...env.services };
  });

  afterAll(async () => {
    env.integrationMode = originalMode;
    env.services.requestTimeoutMs = originalTimeout;
    Object.assign(env.services, originalUrls);
    await Promise.all(servers.map(closeServer));
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await resetTestState();
    await Promise.all(servers.map(closeServer));
    servers = [];

    orgRetryCounter = 0;
    receivedNotifications = [];

    orgState = new Map([
      [orgIdA, { id: orgIdA, name: 'Vertex Cloud Corp', code: 'VERTEX', status: 'active', email: 'ops@vertex.io' }],
      [orgIdB, { id: orgIdB, name: 'Suspended Org Ltd', code: 'SUSP', status: 'inactive', email: 'ops@susp.io' }]
    ]);

    platformState = new Map([
      [orgIdA, { organizationId: orgIdA, active: true, reason: null, features: ['HRMS', 'EMPLOYEES', 'RECRUITMENT'] }],
      [orgIdB, { organizationId: orgIdB, active: false, reason: 'organization_inactive', features: [] }]
    ]);

    employeeState = new Map([
      [
        empIdAdmin,
        {
          id: empIdAdmin,
          organizationId: orgIdA,
          employeeCode: 'EMP001',
          firstName: 'Elena',
          lastName: 'Vance',
          workEmail: 'elena@vertex.io',
          status: 'active',
          authUserId: userIdAdmin
        }
      ],
      [
        empIdInactive,
        {
          id: empIdInactive,
          organizationId: orgIdA,
          employeeCode: 'EMP002',
          firstName: 'Sam',
          lastName: 'Former',
          workEmail: 'sam@vertex.io',
          status: 'terminated',
          authUserId: '44444444-dddd-4444-8444-444444444444'
        }
      ]
    ]);

    authUsers = new Map([
      [
        userIdAdmin,
        {
          id: userIdAdmin,
          employeeId: empIdAdmin,
          email: 'elena@vertex.io',
          firstName: 'Elena',
          lastName: 'Vance',
          name: 'Elena Vance',
          role: 'org_admin',
          organizationId: orgIdA,
          status: 'active',
          mustChangePassword: false
        }
      ]
    ]);

    // 1. Mock Auth Service (Port 4001 Contract)
    const authMock = await createMockHttpServer((req, res, body) => {
      if (req.url === '/api/v1/auth/login' && req.method === 'POST') {
        const found = Array.from(authUsers.values()).find((u) => u.email === body?.email?.toLowerCase());
        if (!found || body?.password !== 'RealAuthPass!2026') {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, message: 'Invalid credentials' }));
        }
        // Auth Service signs tokens WITHOUT issuer/audience and with its own external secret
        const token = jwt.sign(
          {
            userId: found.id,
            employeeId: found.employeeId,
            email: found.email,
            name: found.name,
            role: found.role,
            organizationId: found.organizationId
          },
          AUTH_SECRET_EXTERNAL,
          { expiresIn: '1h' }
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, token, user: found }));
      }

      if (req.url === '/api/v1/auth/me' && req.method === 'GET') {
        const hdr = req.headers.authorization || '';
        const tok = hdr.startsWith('Bearer ') ? hdr.slice(7) : '';
        try {
          const decoded = jwt.verify(tok, AUTH_SECRET_EXTERNAL);
          const u = authUsers.get(decoded.userId);
          if (!u || u.status !== 'active') {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, message: 'Account is not active' }));
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, user: u }));
        } catch (_e) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, message: 'Invalid or expired token' }));
        }
      }

      if (req.url.startsWith('/api/v1/auth/internal/accounts/') && req.method === 'GET') {
        if (req.headers['x-internal-token'] !== env.services.internalToken) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, message: 'Forbidden' }));
        }
        const id = decodeURIComponent(req.url.split('/').pop());
        const u = authUsers.get(id);
        if (!u) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, code: 'ACCOUNT_NOT_FOUND', message: 'Not found' }));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(
          JSON.stringify({ success: true, data: { status: u.status, role: u.role, organizationId: u.organizationId } })
        );
      }

      if (req.url.startsWith('/api/v1/auth/internal/users') && req.method === 'GET') {
        if (req.headers['x-internal-token'] !== env.services.internalToken) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, message: 'Forbidden' }));
        }
        const parsed = new URL(req.url, 'http://127.0.0.1');
        const orgIdQuery = parsed.searchParams.get('organizationId');
        const list = Array.from(authUsers.values()).filter((u) => !orgIdQuery || u.organizationId === orgIdQuery);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, data: list }));
      }

      if (req.url === '/api/v1/auth/provision' && req.method === 'POST') {
        const cleanEmail = String(body.email || '').trim().toLowerCase();
        const clash = Array.from(authUsers.values()).find((u) => u.email.toLowerCase() === cleanEmail);
        if (clash) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, message: 'Email already registered' }));
        }
        const newId = uuidv4();
        const created = {
          id: newId,
          email: cleanEmail,
          firstName: body.firstName || null,
          lastName: body.lastName || null,
          name: [body.firstName, body.lastName].filter(Boolean).join(' ') || cleanEmail,
          role: body.role || 'employee',
          organizationId: orgIdA,
          status: 'active',
          mustChangePassword: true
        };
        authUsers.set(newId, created);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, user: created, emailDelivered: true }));
      }

      if (req.url === '/api/v1/auth/internal/provision-agent' && req.method === 'POST') {
        if (req.headers['x-internal-token'] !== env.services.internalToken) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, message: 'Forbidden' }));
        }
        const newId = uuidv4();
        const rec = {
          id: newId,
          email: body.email,
          name: body.name,
          role: body.role || 'employee',
          organizationId: body.organizationId,
          status: 'active',
          mustChangePassword: false
        };
        authUsers.set(newId, rec);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, data: { user: rec, isNew: true } }));
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Not found' }));
    });

    // 2. Mock Organization Service (Port 4003 Contract)
    const orgMock = await createMockHttpServer((req, res, body) => {
      if (req.headers['x-internal-token'] !== env.services.internalToken) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'Unauthorized' }));
      }
      if (req.url === '/api/v1/organizations' && req.method === 'POST') {
        const newId = uuidv4();
        const created = { id: newId, name: body.name, code: body.code, email: body.email, status: body.status || 'active' };
        orgState.set(newId, created);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, data: created }));
      }
      if (req.url.startsWith('/api/v1/organizations/') && req.method === 'GET') {
        orgRetryCounter += 1;
        if (req.headers['x-test-transient-fail'] || global.__mockOrgTransientFailOnce) {
          global.__mockOrgTransientFailOnce = false;
          res.writeHead(503, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, message: 'Temporary overload' }));
        }
        const orgId = decodeURIComponent(req.url.split('/')[4]);
        const found = orgState.get(orgId);
        if (!found) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, message: 'Organization not found' }));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, data: found }));
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Not found' }));
    });

    // 3. Mock Platform Service (Port 4002 Contract)
    const platformMock = await createMockHttpServer((req, res, body) => {
      if (req.headers['x-internal-token'] !== env.services.internalToken) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'Unauthorized' }));
      }
      if (req.url === '/api/v1/platform/plans' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(
          JSON.stringify({
            success: true,
            data: [{ id: 'plan-1', code: 'RECRUITMENT_PREMIUM', name: 'Recruitment Premium', status: 'active' }]
          })
        );
      }
      if (req.url === '/api/v1/platform/subscriptions' && req.method === 'POST') {
        platformState.set(body.organizationId, {
          organizationId: body.organizationId,
          active: true,
          reason: null,
          features: ['HRMS', 'EMPLOYEES', 'RECRUITMENT']
        });
        res.writeHead(201, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, data: { id: uuidv4(), ...body } }));
      }
      if (req.url.startsWith('/api/v1/platform/entitlements/organizations/') && req.method === 'GET') {
        const oid = decodeURIComponent(req.url.split('/').pop());
        const ent = platformState.get(oid) || { organizationId: oid, active: false, reason: 'no_subscription', features: [] };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, data: ent }));
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Not found' }));
    });

    // 4. Mock Employee Service (Port 4004 Contract)
    const employeeMock = await createMockHttpServer((req, res, body) => {
      if (req.headers['x-internal-token'] !== env.services.internalToken) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'Unauthorized' }));
      }
      const callerOrgId = req.headers['x-organization-id'];
      if (req.url.startsWith('/api/v1/employees') && req.method === 'GET') {
        const cleanPath = req.url.split('?')[0];
        const parts = cleanPath.split('/').filter(Boolean);
        if (parts.length === 4) {
          const emp = employeeState.get(parts[3]);
          if (!emp || emp.organizationId !== callerOrgId) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, message: 'Employee not found' }));
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, data: emp }));
        }
        const list = Array.from(employeeState.values()).filter((e) => e.organizationId === callerOrgId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, data: list }));
      }
      if (req.url === '/api/v1/employees' && req.method === 'POST') {
        const newEmpId = uuidv4();
        const created = {
          id: newEmpId,
          organizationId: callerOrgId,
          employeeCode: body.employeeCode,
          firstName: body.firstName,
          lastName: body.lastName,
          email: body.email,
          workEmail: body.workEmail,
          status: body.status || 'onboarding'
        };
        employeeState.set(newEmpId, created);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, data: created }));
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Not found' }));
    });

    // 5. Mock Notification Service (Port 4006 Contract)
    const notificationMock = await createMockHttpServer((req, res, body) => {
      if (
        req.headers['x-internal-token'] !== env.services.internalToken ||
        !req.headers['x-service-name'] ||
        !req.headers['x-organization-id']
      ) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'Missing internal or org context' }));
      }
      if (req.url === '/api/v1/notifications' && req.method === 'POST') {
        if (global.__mockNotificationFail) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, message: 'SMTP unavailable' }));
        }
        receivedNotifications.push({ headers: req.headers, body });
        res.writeHead(201, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, data: { id: uuidv4(), ...body } }));
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Not found' }));
    });

    servers = [authMock.server, orgMock.server, platformMock.server, employeeMock.server, notificationMock.server];

    env.integrationMode = 'live';
    env.services.authUrl = authMock.url;
    env.services.organisationUrl = orgMock.url;
    env.services.platformUrl = platformMock.url;
    env.services.employeeUrl = employeeMock.url;
    env.services.notificationUrl = notificationMock.url;
    env.services.requestTimeoutMs = 1500;
    env.services.getRetryAttempts = 2;
    global.__mockOrgTransientFailOnce = false;
    global.__mockNotificationFail = false;

    const rolesByCode = await seedOrganisationRoles(orgIdA);
    const { EmployeeRoleAssignment } = getModels();
    await EmployeeRoleAssignment.create({
      organisationId: orgIdA,
      employeeId: empIdAdmin,
      authUserId: userIdAdmin,
      roleId: rolesByCode.ORGANISATION_ADMIN.id,
      isActive: true
    });
  });

  it('authenticates via real Auth Service (without shared JWT_SECRET), verifies org/platform status, and lists employees', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'elena@vertex.io', password: 'RealAuthPass!2026' });

    expect(loginRes.status).toBe(200);
    const realAuthToken = loginRes.body.data.token;
    expect(loginRes.body.data.user.organisationId).toBe(orgIdA);

    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${realAuthToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.organisation.name).toBe('Vertex Cloud Corp');
    expect(meRes.body.data.user.activeRoleCode).toBe('ORGANISATION_ADMIN');

    const empRes = await request(app)
      .get('/api/v1/organisations/employees')
      .set('Authorization', `Bearer ${realAuthToken}`);
    expect(empRes.status).toBe(200);
    expect(empRes.body.data.length).toBe(2);
    expect(empRes.body.data.find((e) => e.employeeId === empIdAdmin)?.recruitmentAccess?.roleCode).toBe(
      'ORGANISATION_ADMIN'
    );
  });

  it('supports trusted API Gateway identity headers and rejects spoofed internal headers', async () => {
    const spoofed = await request(app)
      .get('/api/v1/organisations/profile')
      .set('x-internal-token', 'forged-token')
      .set('x-user-id', userIdAdmin)
      .set('x-user-role', 'org_admin')
      .set('x-organization-id', orgIdA);
    expect(spoofed.status).toBe(401);

    const viaGateway = await request(app)
      .get('/api/v1/organisations/profile')
      .set('x-internal-token', env.services.internalToken)
      .set('x-user-id', userIdAdmin)
      .set('x-user-role', 'org_admin')
      .set('x-organization-id', orgIdA);
    expect(viaGateway.status).toBe(200);
    expect(viaGateway.body.data.name).toBe('Vertex Cloud Corp');

    const manifestRes = await request(app).get('/api/v1/gateway/manifest');
    expect(manifestRes.status).toBe(200);
    expect(manifestRes.body.data.service).toBe('recruitment-service');
  });

  it('denies inactive organisations, expired platform subscriptions, inactive employees, cross-tenant payloads, and invalid JWTs', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'elena@vertex.io', password: 'RealAuthPass!2026' });
    const token = loginRes.body.data.token;

    // Cross-tenant header / payload tampering rejected
    const crossHeader = await request(app)
      .get('/api/v1/jobs')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgIdB);
    expect(crossHeader.status).toBe(403);

    // Assigning Recruitment role to terminated employee rejected
    const assignTerminated = await request(app)
      .patch(`/api/v1/organisations/employees/${empIdInactive}/role`)
      .set('Authorization', `Bearer ${token}`)
      .send({ roleCode: 'RECRUITER' });
    expect(assignTerminated.status).toBe(403);
    expect(assignTerminated.body.error.code).toBe('EMPLOYEE_INACTIVE');

    // Malformed, wrong-secret, and expired JWTs rejected
    const badJwt = await request(app)
      .get('/api/v1/jobs')
      .set('Authorization', 'Bearer invalid.jwt.string');
    expect(badJwt.status).toBe(401);

    const wrongSigJwt = jwt.sign({ userId: userIdAdmin, role: 'org_admin', organizationId: orgIdA }, 'wrong-secret');
    const wrongSigRes = await request(app)
      .get('/api/v1/jobs')
      .set('Authorization', `Bearer ${wrongSigJwt}`);
    expect(wrongSigRes.status).toBe(401);

    const expiredJwt = jwt.sign({ userId: userIdAdmin, role: 'org_admin', organizationId: orgIdA }, AUTH_SECRET_EXTERNAL, {
      expiresIn: -60
    });
    const expiredRes = await request(app)
      .get('/api/v1/jobs')
      .set('Authorization', `Bearer ${expiredJwt}`);
    expect(expiredRes.status).toBe(401);

    // Suspended/inactive organization denied
    orgState.get(orgIdA).status = 'inactive';
    const inactiveOrgRes = await request(app)
      .get('/api/v1/jobs')
      .set('Authorization', `Bearer ${token}`);
    expect(inactiveOrgRes.status).toBe(403);
    expect(inactiveOrgRes.body.error.code).toBe('ORGANISATION_INACTIVE');

    // Restore org, expire subscription in Platform Service -> denied
    orgState.get(orgIdA).status = 'active';
    platformState.set(orgIdA, { organizationId: orgIdA, active: false, reason: 'subscription_expired', features: [] });
    const expiredSubRes = await request(app)
      .get('/api/v1/jobs')
      .set('Authorization', `Bearer ${token}`);
    expect(expiredSubRes.status).toBe(403);
    expect(expiredSubRes.body.error.code).toBe('SUBSCRIPTION_INACTIVE');
  });

  it('retries transient GET 503 safely and returns explicit 503 when dependencies are down or time out in live mode', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'elena@vertex.io', password: 'RealAuthPass!2026' });
    const token = loginRes.body.data.token;

    // Transient 503 on GET Organization retried safely and succeeds
    global.__mockOrgTransientFailOnce = true;
    const retryOk = await request(app)
      .get('/api/v1/organisations/profile')
      .set('Authorization', `Bearer ${token}`);
    expect(retryOk.status).toBe(200);
    expect(orgRetryCounter).toBeGreaterThanOrEqual(2);

    // Timeout test against stalled Organization Service -> 503 DEPENDENCY_TIMEOUT
    env.services.requestTimeoutMs = 100;
    env.services.getRetryAttempts = 1;
    const stalledServer = await createMockHttpServer((_req, _res) => {
      // intentionally hang beyond 100ms
    });
    servers.push(stalledServer.server);
    env.services.organisationUrl = stalledServer.url;

    const timeoutRes = await request(app)
      .get('/api/v1/organisations/profile')
      .set('Authorization', `Bearer ${token}`);
    expect(timeoutRes.status).toBe(503);
    expect(timeoutRes.body.error.code).toBe('DEPENDENCY_TIMEOUT');

    // Offline Organization Service -> explicit 503 mentioning Organization Service
    await closeServer(stalledServer.server);
    await closeServer(servers[1]);
    const orgDownRes = await request(app)
      .get('/api/v1/organisations/profile')
      .set('Authorization', `Bearer ${token}`);
    expect(orgDownRes.status).toBe(503);
    expect(orgDownRes.body.error.code).toBe('DEPENDENCY_UNAVAILABLE');
    expect(orgDownRes.body.error.message).toContain('Organization Service');

    // Offline Platform Service -> explicit 503 mentioning Platform Service (restore Organization Service)
    const orgUpAgain = await createMockHttpServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: orgState.get(orgIdA) }));
    });
    servers.push(orgUpAgain.server);
    env.services.organisationUrl = orgUpAgain.url;
    await closeServer(servers[2]);

    const platformDownRes = await request(app)
      .get('/api/v1/jobs')
      .set('Authorization', `Bearer ${token}`);
    expect(platformDownRes.status).toBe(503);
    expect(platformDownRes.body.error.code).toBe('DEPENDENCY_UNAVAILABLE');
    expect(platformDownRes.body.error.message).toContain('Platform Service');

    // Offline Employee Service -> explicit 503 mentioning Employee Service (restore Platform Service)
    const platformUpAgain = await createMockHttpServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: platformState.get(orgIdA) }));
    });
    servers.push(platformUpAgain.server);
    env.services.platformUrl = platformUpAgain.url;
    await closeServer(servers[3]);

    const empDownRes = await request(app)
      .get('/api/v1/organisations/employees')
      .set('Authorization', `Bearer ${token}`);
    expect(empDownRes.status).toBe(503);
    expect(empDownRes.body.error.code).toBe('DEPENDENCY_UNAVAILABLE');
    expect(empDownRes.body.error.message).toContain('Employee Service');

    // Unavailable Auth Service -> explicit 503 mentioning Auth Service (never falls back to standalone mocks)
    await closeServer(servers[0]);
    const authDownRes = await request(app)
      .get('/api/v1/jobs')
      .set('Authorization', `Bearer ${token}`);
    expect(authDownRes.status).toBe(503);
    expect(authDownRes.body.error.code).toBe('DEPENDENCY_UNAVAILABLE');
    expect(authDownRes.body.error.message).toContain('Auth Service');
  });

  it('delivers Notification Service REST events cleanly and keeps Recruitment operations successful if Notification Service fails', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'elena@vertex.io', password: 'RealAuthPass!2026' });
    const token = loginRes.body.data.token;

    // Create & publish a job, then verify notification dispatch tolerates Notification Service failure cleanly
    const jobRes = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Live Staff Engineer',
        description: 'Architect distributed systems with PostgreSQL and Express microservices.',
        department: 'Engineering',
        location: 'Remote',
        employmentType: 'FULL_TIME',
        headcount: 1
      });
    expect(jobRes.status).toBe(201);
    const jobId = jobRes.body.data.id;

    const pubRes = await request(app)
      .post(`/api/v1/jobs/${jobId}/publish`)
      .set('Authorization', `Bearer ${token}`);
    expect(pubRes.status).toBe(200);

    // Apply as candidate while Notification Service succeeds -> verify payload sent to POST /api/v1/notifications
    const applyRes = await request(app)
      .post(`/api/v1/applications/public/jobs/${jobId}/apply`)
      .field('fullName', 'Jordan Blake')
      .field('email', 'jordan@candidate.io')
      .field('mobileNumber', '555-0102')
      .field('location', 'Austin')
      .field('totalExperienceYears', '6')
      .attach('resume', Buffer.from('%PDF-1.4 mock resume'), { filename: 'cv.pdf', contentType: 'application/pdf' });
    expect(applyRes.status).toBe(201);
    expect(receivedNotifications.length).toBe(1);
    expect(receivedNotifications[0].body.type).toBe('recruitment_application_received');
    expect(receivedNotifications[0].headers['x-organization-id']).toBe(orgIdA);
    expect(receivedNotifications[0].headers['x-service-name']).toBe('nexnuv-recruitment-service');

    // Now simulate Notification Service returning HTTP 500 -> public application STILL succeeds safely
    global.__mockNotificationFail = true;
    const applyWithNotifDown = await request(app)
      .post(`/api/v1/applications/public/jobs/${jobId}/apply`)
      .field('fullName', 'Taylor Quinn')
      .field('email', 'taylor@candidate.io')
      .field('mobileNumber', '555-0109')
      .field('location', 'Boston')
      .field('totalExperienceYears', '4')
      .attach('resume', Buffer.from('%PDF-1.4 mock resume 2'), { filename: 'cv2.pdf', contentType: 'application/pdf' });
    expect(applyWithNotifDown.status).toBe(201);

    // Candidate Portal signup, email verification & explicit application claim in live mode
    const { token: candToken } = await registerAndVerifyCandidate(request, app, {
      fullName: 'Jordan Blake',
      email: 'jordan@candidate.io',
      password: 'CandidatePass!2026'
    });

    // Candidate dedicated login route works without touching Auth Service
    const candLogin = await request(app)
      .post('/api/v1/auth/candidate/login')
      .send({ email: 'jordan@candidate.io', password: 'CandidatePass!2026' });
    expect(candLogin.status).toBe(200);
    expect(candLogin.body.data.user.userType).toBe('CANDIDATE');

    // Candidate cannot access internal org routes
    const forbiddenOrgRoute = await request(app)
      .get('/api/v1/applications')
      .set('Authorization', `Bearer ${candToken}`);
    expect(forbiddenOrgRoute.status).toBe(403);

    // Anonymous prior application is NOT exposed before explicit verified claim
    const portalBeforeClaim = await request(app)
      .get('/api/v1/portal/overview')
      .set('Authorization', `Bearer ${candToken}`);
    expect(portalBeforeClaim.status).toBe(200);
    expect(portalBeforeClaim.body.data.applications.length).toBe(0);

    // Explicit org-scoped claim binds prior anonymous application cleanly
    const claimRes = await request(app)
      .post('/api/v1/portal/claims')
      .set('Authorization', `Bearer ${candToken}`)
      .send({
        organisationId: orgIdA,
        applicationReference: applyRes.body.data.applicationReference
      });
    expect(claimRes.status).toBe(200);
    expect(claimRes.body.data.claimed).toBe(true);

    // Candidate sees own portal overview after claiming
    const portalRes = await request(app)
      .get('/api/v1/portal/overview')
      .set('Authorization', `Bearer ${candToken}`);
    expect(portalRes.status).toBe(200);
    expect(portalRes.body.data.applications.length).toBe(1);
  });

  it('prevents duplicate Auth and Employee identities when adding an existing org employee', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'elena@vertex.io', password: 'RealAuthPass!2026' });
    const token = loginRes.body.data.token;

    // Seed an existing employee & matching Auth user without authUserId set on the employee row
    const existingEmpId = '55555555-eeee-4555-8555-555555555555';
    const existingAuthId = '66666666-ffff-4666-8666-666666666666';
    employeeState.set(existingEmpId, {
      id: existingEmpId,
      organizationId: orgIdA,
      employeeCode: 'EMP055',
      firstName: 'Nadia',
      lastName: 'Chen',
      workEmail: 'nadia@vertex.io',
      status: 'active'
    });
    authUsers.set(existingAuthId, {
      id: existingAuthId,
      employeeId: existingEmpId,
      email: 'nadia@vertex.io',
      name: 'Nadia Chen',
      role: 'hr',
      organizationId: orgIdA,
      status: 'active',
      mustChangePassword: false
    });

    const empCountBefore = employeeState.size;
    const authCountBefore = authUsers.size;

    const addExisting = await request(app)
      .post('/api/v1/organisations/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({
        fullName: 'Nadia Chen',
        email: 'nadia@vertex.io',
        roleCode: 'RECRUITER',
        sendInvite: true
      });

    expect(addExisting.status).toBe(201);
    expect(addExisting.body.data.employeeId).toBe(existingEmpId);
    expect(addExisting.body.data.authUserId).toBe(existingAuthId);
    expect(employeeState.size).toBe(empCountBefore);
    expect(authUsers.size).toBe(authCountBefore);
  });
});

