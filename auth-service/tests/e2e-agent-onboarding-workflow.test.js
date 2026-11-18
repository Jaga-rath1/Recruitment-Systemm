'use strict';

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const authService = require('../src/modules/auth/auth.service');
const { User, Tenant } = require('../src/models/index');
const Role = require('../src/modules/roles/roles.model');
const { JWT_SECRET } = require('../src/config/env');
const { hasTemplate, renderTemplate } = require('../../notification-service/src/modules/templates/templates.service');

describe('End-to-End Agent Onboarding Workflow Test', () => {
  const TEST_AGENT_EMAIL = 'test.agent.workflow.e2e@nexnuv.local';
  const TEST_AGENT_NAME = 'Test Workflow Agent';
  const TEST_DESCRIPTION = 'Senior Incident Response & Escalations Specialist';
  const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
  let generatedTempPassword = '';
  let provisionedUserId = '';
  let initialAuthToken = '';
  const PERMANENT_PASSWORD = 'OrbitSecureP@ss2026!';

  it('1. Auth Service provisions agent account with temporary credential and mustChangePassword=true', async () => {
    // If user already exists from a previous run, cleanup or reset to ensure fresh test
    await User.destroy({ where: { email: TEST_AGENT_EMAIL } });

    const result = await authService.provisionAgentAccount({
      email: TEST_AGENT_EMAIL,
      name: TEST_AGENT_NAME,
      organizationId: TEST_TENANT_ID,
      role: 'agent',
    });

    assert.ok(result);
    assert.ok(result.user);
    assert.equal(result.user.email, TEST_AGENT_EMAIL);
    assert.equal(result.user.role, 'agent');
    assert.equal(result.user.mustChangePassword, true);
    assert.ok(result.tempPassword);
    assert.ok(result.tempPassword.length >= 14);

    generatedTempPassword = result.tempPassword;
    provisionedUserId = result.user.id;

    // Verify in database: password is NEVER stored in plaintext
    const dbUser = await User.findByPk(provisionedUserId);
    assert.ok(dbUser);
    assert.notEqual(dbUser.passwordHash, generatedTempPassword);
    assert.ok(dbUser.passwordHash.startsWith('$2')); // bcrypt hash
    assert.equal(dbUser.mustChangePassword, true);
    assert.equal(dbUser.organizationId, TEST_TENANT_ID);
  });

  it('2. Onboarding email template generates clean Nexnuv Orbit layout without emojis and with human tenant name', async () => {
    assert.ok(hasTemplate('agent_onboarding'), 'agent_onboarding template must be registered');

    const tenant = await Tenant.findByPk(TEST_TENANT_ID);
    const tenantDisplayName = tenant ? tenant.name : 'Nexnuv Orbit Enterprise';

    const emailContent = renderTemplate('agent_onboarding', {
      agentName: TEST_AGENT_NAME,
      tenantName: tenantDisplayName,
      email: TEST_AGENT_EMAIL,
      temporaryPassword: generatedTempPassword,
      loginUrl: 'https://nexnuv-helpdesk.vercel.app/login',
    });

    assert.equal(emailContent.subject, 'Your Nexnuv Orbit Agent Account Is Ready');
    assert.ok(emailContent.html.includes('Welcome to Nexnuv Orbit'));
    assert.ok(emailContent.html.includes(tenantDisplayName));
    assert.ok(!emailContent.html.includes(TEST_TENANT_ID), 'Must not show raw UUID tenant ID');
    assert.ok(emailContent.html.includes(TEST_AGENT_EMAIL));
    assert.ok(emailContent.html.includes(generatedTempPassword));
    assert.ok(emailContent.html.includes('https://nexnuv-helpdesk.vercel.app/login'));

    // Verify NO emojis in email subject or body per requirement 5 & 12
    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    assert.equal(emojiRegex.test(emailContent.subject), false, 'Subject must not have emojis');
    assert.equal(emojiRegex.test(emailContent.html), false, 'HTML body must not have emojis');
    assert.equal(emojiRegex.test(emailContent.text), false, 'Text body must not have emojis');
  });

  it('3. Agent logs in using temporary password and receives JWT with mustChangePassword=true', async () => {
    const loginResult = await authService.login({
      email: TEST_AGENT_EMAIL,
      password: generatedTempPassword,
    });

    assert.ok(loginResult.token);
    assert.ok(loginResult.user);
    assert.equal(loginResult.user.mustChangePassword, true);
    assert.equal(loginResult.user.role, 'agent');

    // Decode token and verify claim
    const decoded = jwt.verify(loginResult.token, JWT_SECRET);
    assert.equal(decoded.mustChangePassword, true);
    assert.equal(decoded.userId, provisionedUserId);

    initialAuthToken = loginResult.token;
  });

  it('4. Password setup rejects short passwords (< 8 chars)', async () => {
    await assert.rejects(
      async () => {
        await authService.setupPassword(provisionedUserId, 'short');
      },
      /at least 8 characters/i
    );
  });

  it('5. Agent sets permanent password, which updates hash and clears mustChangePassword', async () => {
    const setupResult = await authService.setupPassword(provisionedUserId, PERMANENT_PASSWORD);

    assert.ok(setupResult);
    assert.equal(setupResult.success, true);
    assert.equal(setupResult.user.mustChangePassword, false);

    // Verify database state directly
    const updatedUser = await User.findByPk(provisionedUserId);
    assert.equal(updatedUser.mustChangePassword, false);
    const isValidNewPassword = await bcrypt.compare(PERMANENT_PASSWORD, updatedUser.passwordHash);
    assert.equal(isValidNewPassword, true);
  });

  it('6. The temporary password CANNOT be reused after password setup', async () => {
    await assert.rejects(
      async () => {
        await authService.login({
          email: TEST_AGENT_EMAIL,
          password: generatedTempPassword,
        });
      },
      /Invalid credentials/i
    );
  });

  it('7. Calling setupPassword again after onboarding completed is rejected', async () => {
    await assert.rejects(
      async () => {
        await authService.setupPassword(provisionedUserId, 'AnotherPassword123!');
      },
      /already been completed/i
    );
  });

  it('8. Agent logs in normally with new permanent password', async () => {
    const normalLogin = await authService.login({
      email: TEST_AGENT_EMAIL,
      password: PERMANENT_PASSWORD,
    });

    assert.ok(normalLogin.token);
    assert.ok(normalLogin.user);
    assert.equal(normalLogin.user.mustChangePassword, false);

    const decoded = jwt.verify(normalLogin.token, JWT_SECRET);
    assert.equal(decoded.mustChangePassword, undefined);
    assert.equal(decoded.role, 'agent');
    assert.equal(decoded.organizationId, TEST_TENANT_ID);
  });

  it('9. Reprovisioning / retry idempotency: safe reprovisioning refreshes credential without duplicates', async () => {
    // If admin clicks "Resend Invite" or retries provisioning
    const retryResult = await authService.provisionAgentAccount({
      email: TEST_AGENT_EMAIL,
      name: TEST_AGENT_NAME,
      organizationId: TEST_TENANT_ID,
      role: 'agent',
    });

    assert.ok(retryResult.user);
    assert.equal(retryResult.user.id, provisionedUserId, 'Must retain stable user ID');

    // Count users with this email in database
    const userCount = await User.count({ where: { email: TEST_AGENT_EMAIL } });
    assert.equal(userCount, 1, 'Never create duplicate authentication accounts');
  });

  it('10. Tenant isolation: agent account is linked strictly to tenant organization', async () => {
    const user = await User.findByPk(provisionedUserId);
    assert.equal(user.organizationId, TEST_TENANT_ID);
  });

  after(async () => {
    const { sequelize } = require('../src/models/index');
    await sequelize.close();
  });
});
