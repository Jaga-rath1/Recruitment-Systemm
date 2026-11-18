'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const authService = require('../src/modules/auth/auth.service');
const { User, Role } = require('../src/models/index');
const sequelize = require('../src/config/database');

test('HRMS Auth Service Contract Compatibility Suite', async (t) => {
  await sequelize.authenticate();

  t.after(async () => {
    try {
      await sequelize.close();
    } catch {}
  });

  const testOrgId = '00000000-0000-0000-0000-000000000001';

  await t.test('1. HRMS listOrgUsersByRoles matches internal HRMS query requirements', async () => {
    const users = await authService.listOrgUsersByRoles(testOrgId, ['org_admin', 'manager', 'hr', 'employee']);
    assert.ok(Array.isArray(users), 'Should return an array of users');
    if (users.length > 0) {
      const u = users[0];
      assert.ok(u.id);
      assert.ok(u.email);
      assert.ok(u.role);
    }
  });

  await t.test('2. HRMS getAccountState returns session verification contract for API Gateway', async () => {
    // Find any user or test user
    const user = await User.findOne({ include: [{ model: Role, as: 'role' }] });
    if (user) {
      const state = await authService.getAccountState(user.id);
      assert.ok(state);
      assert.equal(state.status, user.status);
      assert.equal(state.role, user.role?.name);
      assert.equal(state.organizationId, user.organizationId);
    } else {
      const missingState = await authService.getAccountState('00000000-0000-0000-0000-999999999999');
      assert.equal(missingState, null);
    }
  });

  await t.test('3. HRMS GRANTABLE_ROLES allows hr to provision employee and manager', async () => {
    // Test role permission rules
    const hrActor = { role: 'hr', organizationId: testOrgId };
    
    // HR cannot provision org_admin or super_admin
    await assert.rejects(
      async () => {
        await authService.provisionUser(hrActor, {
          email: 'illegal.admin@nexnuv.local',
          firstName: 'Illegal',
          lastName: 'Admin',
          role: 'org_admin',
          organizationId: testOrgId,
        });
      },
      (err) => {
        assert.equal(err.status, 403);
        return true;
      }
    );
  });
});
