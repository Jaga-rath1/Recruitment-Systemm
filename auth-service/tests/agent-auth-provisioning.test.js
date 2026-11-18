'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const authService = require('../src/modules/auth/auth.service');
const { User, Role, sequelize } = require('../src/models');

describe('Agent Auth Account Provisioning and First-Login Password Setup', () => {
  const testTenantId = '00000000-0000-0000-0000-000000000001';
  const testEmail = `test.agent.${Date.now()}@example.com`;
  let createdUserId = null;
  let temporaryPassword = null;

  test('provisions agent account with temporary password and mustChangePassword=true', async () => {
    const result = await authService.provisionAgentAccount({
      email: testEmail,
      name: 'Test Setup Agent',
      role: 'agent',
      organizationId: testTenantId,
    });

    assert.ok(result.user, 'User object should be returned');
    assert.equal(result.user.email, testEmail);
    assert.equal(result.user.role, 'agent');
    assert.equal(result.user.mustChangePassword, true);
    assert.ok(result.tempPassword, 'Temporary password must be returned');

    createdUserId = result.user.id;
    temporaryPassword = result.tempPassword;

    // Verify in database
    const userInDb = await User.findByPk(createdUserId);
    assert.ok(userInDb, 'User must exist in DB');
    assert.equal(userInDb.mustChangePassword, true);

    const matchesTemp = await bcrypt.compare(temporaryPassword, userInDb.passwordHash);
    assert.equal(matchesTemp, true, 'Stored password hash must match temporary password');
  });

  test('idempotency: reprovisioning existing pending agent returns refreshed temp password', async () => {
    const retryResult = await authService.provisionAgentAccount({
      email: testEmail,
      name: 'Test Setup Agent',
      role: 'agent',
      organizationId: testTenantId,
    });

    assert.equal(retryResult.user.id, createdUserId, 'Must retain same user ID');
    assert.ok(retryResult.tempPassword, 'Should return new temp password on retry');
    assert.equal(retryResult.reprovisioned, true);

    temporaryPassword = retryResult.tempPassword;
  });

  test('setupPassword rejects password under 8 characters', async () => {
    await assert.rejects(
      async () => {
        await authService.setupPassword(createdUserId, 'short');
      },
      /at least 8 characters/i
    );
  });

  test('setupPassword updates password and clears mustChangePassword', async () => {
    const newPermanentPassword = 'SecurePermanentPassword#2026';
    const setupResult = await authService.setupPassword(createdUserId, newPermanentPassword);

    assert.equal(setupResult.success, true);
    assert.equal(setupResult.user.mustChangePassword, false);

    // Verify in database
    const userInDb = await User.findByPk(createdUserId);
    assert.equal(userInDb.mustChangePassword, false);

    const matchesNew = await bcrypt.compare(newPermanentPassword, userInDb.passwordHash);
    assert.equal(matchesNew, true, 'Stored password hash must match new password');

    // Verify temporary password is no longer valid
    const matchesOld = await bcrypt.compare(temporaryPassword, userInDb.passwordHash);
    assert.equal(matchesOld, false, 'Temporary password must be completely replaced');
  });

  test('setupPassword fails if called again after onboarding completed', async () => {
    await assert.rejects(
      async () => {
        await authService.setupPassword(createdUserId, 'AnotherPassword#2026');
      },
      /already been completed/i
    );
  });

  test('provisions existing non-agent user into agent role and generates temp password', async () => {
    const empRole = await Role.findOne({ where: { name: 'employee' } });
    assert.ok(empRole, 'Employee role must exist');
    const empEmail = `test.emp.${Date.now()}@example.com`;
    const empUser = await User.create({
      id: crypto.randomUUID(),
      email: empEmail,
      passwordHash: await bcrypt.hash('OldEmpPassword#123', 10),
      roleId: empRole.id,
      organizationId: testTenantId,
      status: 'active',
      mustChangePassword: false,
    });

    const provisionResult = await authService.provisionAgentAccount({
      email: empEmail,
      name: 'Promoted Agent',
      role: 'agent',
      organizationId: testTenantId,
    });

    assert.equal(provisionResult.user.id, empUser.id);
    assert.equal(provisionResult.user.role, 'agent');
    assert.ok(provisionResult.tempPassword, 'Must generate temp password for newly promoted agent');

    const updated = await User.findByPk(empUser.id, { include: [{ model: Role, as: 'role' }] });
    assert.equal(updated.role.name, 'agent');
    assert.equal(updated.mustChangePassword, true);
    const matches = await bcrypt.compare(provisionResult.tempPassword, updated.passwordHash);
    assert.equal(matches, true);

    await User.destroy({ where: { id: empUser.id } });
  });

  test('setupPassword rejects invalid temporary password and mismatched confirmation', async () => {
    const testTempEmail = `test.temppw.${Date.now()}@example.com`;
    const provisionResult = await authService.provisionAgentAccount({
      email: testTempEmail,
      name: 'Temp Check Agent',
      role: 'agent',
      organizationId: testTenantId,
    });

    const tempUserId = provisionResult.user.id;
    const realTempPw = provisionResult.tempPassword;

    // 1. Rejects wrong temporary password
    await assert.rejects(
      async () => {
        await authService.setupPassword(tempUserId, {
          temporaryPassword: 'WrongTemporaryPassword#99',
          newPassword: 'ValidPermanentPassword#2026',
          confirmPassword: 'ValidPermanentPassword#2026',
        });
      },
      /temporary password.*incorrect/i
    );

    // 2. Rejects mismatched confirmation
    await assert.rejects(
      async () => {
        await authService.setupPassword(tempUserId, {
          temporaryPassword: realTempPw,
          newPassword: 'ValidPermanentPassword#2026',
          confirmPassword: 'MismatchedPermanentPassword#2026',
        });
      },
      /passwords do not match/i
    );

    // 3. Rejects setting new password identical to temporary password
    await assert.rejects(
      async () => {
        await authService.setupPassword(tempUserId, {
          temporaryPassword: realTempPw,
          newPassword: realTempPw,
          confirmPassword: realTempPw,
        });
      },
      /must differ from temporary password/i
    );

    // 4. Case-insensitive login verification with temporary password
    const loginUpper = await authService.login({
      email: testTempEmail.toUpperCase(),
      password: realTempPw,
    });
    assert.ok(loginUpper.token, 'Should authenticate with uppercase email');
    assert.equal(loginUpper.user.mustChangePassword, true);

    // 5. Successful password setup with correct temporary password
    const successResult = await authService.setupPassword(tempUserId, {
      temporaryPassword: realTempPw,
      newPassword: 'MyNewStrongPermanentPass#2026',
      confirmPassword: 'MyNewStrongPermanentPass#2026',
    });
    assert.equal(successResult.success, true);
    assert.equal(successResult.user.mustChangePassword, false);

    // 6. Login with new permanent password
    const normalLogin = await authService.login({
      email: testTempEmail,
      password: 'MyNewStrongPermanentPass#2026',
    });
    assert.ok(normalLogin.token);
    assert.equal(normalLogin.user.mustChangePassword, false);

    // Cleanup
    await User.destroy({ where: { id: tempUserId } });
  });

  after(async () => {
    if (createdUserId) {
      await User.destroy({ where: { id: createdUserId } });
    }
    await sequelize.close();
  });
});
