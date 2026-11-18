'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const authService = require('../src/modules/auth/auth.service');
const { User, Role, Tenant, sequelize } = require('../src/models');

describe('Multi-Tenant Service Manager & Organization Tests', () => {
  let server;
  let baseUrl;

  // Tenant Identifiers
  const tenantAId = crypto.randomUUID();
  const tenantBId = crypto.randomUUID();
  const tenantCId = crypto.randomUUID();

  let adminAUser, adminBUser, adminCUser;
  let adminAToken, adminBToken, adminCToken;
  let smAUser, smAToken;

  before(async () => {
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    const orgAdminRole = await Role.findOne({ where: { name: 'org_admin' } });
    const empRole = await Role.findOne({ where: { name: 'employee' } });
    const smRole = await Role.findOne({ where: { name: 'service_manager' } });
    assert.ok(orgAdminRole && empRole && smRole, 'Required roles must exist');

    // Register Tenant A
    await Tenant.create({ id: tenantAId, name: 'Organization Alpha', industryId: 'IND01', status: 'active' });
    const pwHash = await bcrypt.hash('TestPass#123', 10);
    adminAUser = await User.create({
      id: crypto.randomUUID(),
      email: `admin.a.${Date.now()}@alpha.com`,
      passwordHash: pwHash,
      firstName: 'Admin',
      lastName: 'Alpha',
      roleId: orgAdminRole.id,
      organizationId: tenantAId,
      status: 'active',
    });

    // Register Tenant B
    await Tenant.create({ id: tenantBId, name: 'Organization Beta', industryId: 'IND02', status: 'active' });
    adminBUser = await User.create({
      id: crypto.randomUUID(),
      email: `admin.b.${Date.now()}@beta.com`,
      passwordHash: pwHash,
      firstName: 'Admin',
      lastName: 'Beta',
      roleId: orgAdminRole.id,
      organizationId: tenantBId,
      status: 'active',
    });

    // Register Tenant C (Starts completely clean without Service Manager)
    await Tenant.create({ id: tenantCId, name: 'Organization Gamma', industryId: 'IND03', status: 'active' });
    adminCUser = await User.create({
      id: crypto.randomUUID(),
      email: `admin.c.${Date.now()}@gamma.com`,
      passwordHash: pwHash,
      firstName: 'Admin',
      lastName: 'Gamma',
      roleId: orgAdminRole.id,
      organizationId: tenantCId,
      status: 'active',
    });

    // Obtain tokens
    const loginA = await authService.login({ email: adminAUser.email, password: 'TestPass#123' });
    adminAToken = loginA.token;

    const loginB = await authService.login({ email: adminBUser.email, password: 'TestPass#123' });
    adminBToken = loginB.token;

    const loginC = await authService.login({ email: adminCUser.email, password: 'TestPass#123' });
    adminCToken = loginC.token;
  });

  after(async () => {
    await User.destroy({ where: { organizationId: [tenantAId, tenantBId, tenantCId] } }).catch(() => {});
    await Tenant.destroy({ where: { id: [tenantAId, tenantBId, tenantCId] } }).catch(() => {});
    if (server) await new Promise((r) => server.close(r));
    if (sequelize) await sequelize.close().catch(() => {});
  });

  it('1. New Organization C starts without any Service Managers', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/service-managers`, {
      headers: { Authorization: `Bearer ${adminCToken}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.length, 0, 'New Organization C must have zero Service Managers');
  });

  it('2. Organization A can appoint an employee as Service Manager (Option A)', async () => {
    const empRole = await Role.findOne({ where: { name: 'employee' } });
    const empUserA = await User.create({
      id: crypto.randomUUID(),
      employeeId: 'EMP-A01',
      email: `emp.a.${Date.now()}@alpha.com`,
      passwordHash: await bcrypt.hash('EmpPass#123', 10),
      firstName: 'Alice',
      lastName: 'Manager',
      roleId: empRole.id,
      organizationId: tenantAId,
      status: 'active',
    });

    const res = await fetch(`${baseUrl}/api/v1/auth/service-managers/promote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminAToken}`,
      },
      body: JSON.stringify({ userId: empUserA.id }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.user.role, 'service_manager');

    // Verify employee credentials remained intact and can log in
    const smLogin = await authService.login({ email: empUserA.email, password: 'EmpPass#123' });
    assert.ok(smLogin.token);
    assert.equal(smLogin.user.role, 'service_manager');
    assert.equal(smLogin.user.organizationId, tenantAId);

    smAUser = empUserA;
    smAToken = smLogin.token;
  });

  it('3. Organization B can provision a Service Manager by email (Option B)', async () => {
    const smEmailB = `sm.b.${Date.now()}@beta.com`;
    const res = await fetch(`${baseUrl}/api/v1/auth/service-managers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminBToken}`,
      },
      body: JSON.stringify({
        email: smEmailB,
        name: 'Bob Beta SM',
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.user.role, 'service_manager');
    assert.equal(body.data.user.organizationId, tenantBId);
    assert.ok(body.data.tempPassword, 'Temporary password must be generated for new account');

    // Verify Bob can log in with temp password
    const loginRes = await authService.login({ email: smEmailB, password: body.data.tempPassword });
    assert.equal(loginRes.user.role, 'service_manager');
    assert.equal(loginRes.user.mustChangePassword, true);
  });

  it('4. Cross-Tenant Protection: Organization A cannot view Organization B Service Managers', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/service-managers`, {
      headers: { Authorization: `Bearer ${adminAToken}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);

    for (const sm of body.data) {
      assert.equal(sm.organizationId, tenantAId, 'Org A must only see its own Service Managers');
    }
  });

  it('5. Cross-Tenant Protection: Organization A cannot promote an employee from Organization B', async () => {
    const empRole = await Role.findOne({ where: { name: 'employee' } });
    const empUserB = await User.create({
      id: crypto.randomUUID(),
      employeeId: 'EMP-B99',
      email: `emp.b.${Date.now()}@beta.com`,
      passwordHash: await bcrypt.hash('EmpPass#123', 10),
      firstName: 'Brian',
      lastName: 'Foreign',
      roleId: empRole.id,
      organizationId: tenantBId,
      status: 'active',
    });

    const res = await fetch(`${baseUrl}/api/v1/auth/service-managers/promote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminAToken}`,
      },
      body: JSON.stringify({ userId: empUserB.id }),
    });

    assert.equal(res.status, 403, 'Must reject cross-tenant promotion with 403');
  });

  it('6. Privilege Restriction: Service Manager CANNOT create or manage another Service Manager', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/service-managers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${smAToken}`,
      },
      body: JSON.stringify({
        email: `illegal.sm.${Date.now()}@alpha.com`,
        name: 'Illegal SM',
      }),
    });

    assert.equal(res.status, 403, 'Service Manager calling SM provisioning must receive 403 Forbidden');
  });

  it('7. Privilege Restriction: Service Manager CANNOT promote themselves to Org Admin', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/users/${smAUser.id}/role`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${smAToken}`,
      },
      body: JSON.stringify({ role: 'org_admin' }),
    });

    assert.equal(res.status, 403, 'Service Manager attempting self-promotion must receive 403 Forbidden');
  });

  it('8. Safe Role Removal: Removing Service Manager assignment demotes to employee and preserves account', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/service-managers/${smAUser.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminAToken}` },
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);

    // Verify in database: user still exists, still active, but role is now employee
    const userInDb = await User.findByPk(smAUser.id, {
      include: [{ model: Role, as: 'role' }],
    });
    assert.ok(userInDb, 'User record must NOT be deleted');
    assert.equal(userInDb.status, 'active', 'User must remain active');
    assert.equal(userInDb.role.name, 'employee', 'User must be demoted to employee');
  });
});

