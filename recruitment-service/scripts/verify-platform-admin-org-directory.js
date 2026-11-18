'use strict';

/**
 * Live End-to-End Test Suite for Platform Admin Organisation Directory & Admin Credentials Fix
 */

const path = require('path');
const http = require('http');
const crypto = require('crypto');
require(path.resolve('recruitment-service/node_modules/dotenv')).config({ path: 'recruitment-service/.env' });

const { createApp } = require('../src/app');
const { getSequelize, getModels, disconnectDatabase } = require('../src/config/database');
const authAdapter = require('../src/integrations/auth/auth.adapter');
const { seedPermissionCatalog } = require('../src/db/seed');

async function runDirectoryVerification() {
  const sequelize = getSequelize();
  await sequelize.authenticate();
  await seedPermissionCatalog();

  const app = createApp();
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;

  console.log(`[HTTP] Verification test server running on ${baseUrl}`);

  async function apiRequest(url, options = {}) {
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(options.headers || {})
      },
      body: options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined
    });
    const data = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok, data };
  }

  const results = {
    test1_directoryListsOrganisations: false,
    test2_adminNameAndEmailDisplayed: false,
    test3_invitedStatusAndExpiry: false,
    test4_resendWithoutDuplicates: false,
    test5_activatedStatusReflected: false,
    test6_passwordResetFlow: false,
    test7_missingAccountRecovery: false,
    test8_nonAdminRejected403: false,
    test9_unauthorizedRejected401: false,
    test10_alphaApexTechPreserved: false
  };

  try {
    // ------------------------------------------------------------------------
    // SETUP: Platform Admin Authentication & Non-Admin Accounts
    // ------------------------------------------------------------------------
    console.log('\n--- SETUP: Preparing Authentication Contexts ---');
    const platformAdminLogin = await apiRequest(`${baseUrl}/auth/platform-admin/login`, {
      method: 'POST',
      body: {
        email: 'superadmin@nexnuv.com',
        password: 'SuperAdmin@2026!'
      }
    });
    const platformAdminToken = platformAdminLogin.data.data.token;
    console.log('[AUTH] Platform Admin authenticated successfully.');

    // Seed candidate for cross-portal / non-admin test
    const candEmail = `candidate.orgtest.${Date.now()}@nexnuv.test`;
    await authAdapter.registerOrLoginCandidate({
      email: candEmail,
      fullName: 'Test Candidate',
      password: 'StrongCandidate#2026',
      mode: 'register'
    });
    const { CandidateAccount } = getModels();
    await CandidateAccount.update(
      { emailVerified: true, emailVerifiedAt: new Date() },
      { where: { email: candEmail } }
    );
    const candidateLogin = await apiRequest(`${baseUrl}/auth/candidate/login`, {
      method: 'POST',
      body: {
        email: candEmail,
        password: 'StrongCandidate#2026'
      }
    });
    const candidateToken = candidateLogin.data.data.token;

    // ------------------------------------------------------------------------
    // TEST 1 & 2: Organisation Directory Lists Persisted Orgs & Admin Details
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 1 & 2: Listing Persisted Organisations in Directory ---');
    const dirRes = await apiRequest(`${baseUrl}/subscriptions/platform-admin/organisations?limit=50`, {
      headers: { Authorization: `Bearer ${platformAdminToken}` }
    });
    console.log(`[DIRECTORY] Status: ${dirRes.status}, Total records: ${dirRes.data.meta.total}`);

    if (dirRes.status !== 200 || !Array.isArray(dirRes.data.data) || dirRes.data.data.length === 0) {
      throw new Error('Directory did not return persisted organisations');
    }
    results.test1_directoryListsOrganisations = true;

    // Check Alpha Apex Tech is in the directory
    let alphaOrg = dirRes.data.data.find((o) => o.organisationName === 'Alpha Apex Tech');
    if (!alphaOrg) {
      // Also test search filter query specifically for Alpha Apex Tech!
      const searchRes = await apiRequest(`${baseUrl}/subscriptions/platform-admin/organisations?search=Alpha+Apex`, {
        headers: { Authorization: `Bearer ${platformAdminToken}` }
      });
      alphaOrg = searchRes.data?.data?.[0];
    }
    if (!alphaOrg) {
      throw new Error('Alpha Apex Tech was NOT listed in the organisation directory');
    }
    console.log(`[ALPHA APEX TECH] Found: ${alphaOrg.organisationName}`);
    console.log(` - Admin Name: ${alphaOrg.adminName}`);
    console.log(` - Admin Email: ${alphaOrg.adminEmail}`);
    console.log(` - Account Status: ${alphaOrg.adminAccountStatus}`);
    console.log(` - Plan: ${alphaOrg.planName} (${alphaOrg.planCode})`);
    console.log(` - Starts: ${alphaOrg.startsAt}, Ends: ${alphaOrg.expiresAt}`);
    console.log(` - Portal URL: ${alphaOrg.loginPortalUrl}`);

    if (alphaOrg.adminName && alphaOrg.adminEmail && alphaOrg.adminAccountStatus) {
      results.test2_adminNameAndEmailDisplayed = true;
    }

    // ------------------------------------------------------------------------
    // TEST 3: Create a Paid Organisation Booking, Approve, and Verify Invited Status
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 3: Creating and Approving Paid Customer Booking ---');
    const timestamp = Date.now();
    const testOrgName = `Aether Test Org ${timestamp}`;
    const testAdminEmail = `admin.${timestamp}@aethertest.io`;

    const createSubRes = await apiRequest(`${baseUrl}/subscriptions`, {
      method: 'POST',
      body: {
        organisationName: testOrgName,
        organisationDomain: `aethertest-${timestamp}.io`,
        industry: 'Technology & SaaS',
        companySize: '51-200',
        adminName: 'Alexander Hayes',
        adminEmail: testAdminEmail,
        planCode: 'RECRUITMENT_ADVANCED',
        billingCycle: 'MONTHLY'
      }
    });
    const subId = createSubRes.data.data.id;
    const subAmountCents = createSubRes.data.data.amountCents;
    console.log(`[CREATE SUB] Created subscription ${subId}, amount: ${subAmountCents}`);

    // Submit payment proof
    const paymentRes = await apiRequest(`${baseUrl}/subscriptions/${subId}/payments`, {
      method: 'POST',
      body: {
        paymentReference: `WIRE-TEST-${timestamp}`,
        paymentMethod: 'WIRE_TRANSFER',
        amountCents: subAmountCents
      }
    });
    console.log(`[PAYMENT SUBMIT] Status: ${paymentRes.status}`);

    // Platform Admin Approves & Creates Organisation
    const approveRes = await apiRequest(
      `${baseUrl}/subscriptions/platform-admin/${subId}/verify`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${platformAdminToken}` },
        body: { decision: 'APPROVE' }
      }
    );
    console.log(`[APPROVE] Status: ${approveRes.status}`);

    // Inspect the newly created organisation in Platform Admin Directory
    const newOrgRes = await apiRequest(
      `${baseUrl}/subscriptions/platform-admin/organisations/${subId}`,
      { headers: { Authorization: `Bearer ${platformAdminToken}` } }
    );
    const newOrgData = newOrgRes.data.data;
    console.log('[NEW ORG DETAILS]');
    console.log(` - Name: ${newOrgData.organisation.name}`);
    console.log(` - Admin Name: ${newOrgData.adminAccount.fullName}`);
    console.log(` - Admin Email: ${newOrgData.adminAccount.email}`);
    console.log(` - Account Status: ${newOrgData.adminAccount.accountStatus}`);
    console.log(` - Invitation Status: ${newOrgData.adminAccount.invitationStatus}`);
    console.log(` - Invitation Expires At: ${newOrgData.adminAccount.invitationExpiresAt}`);

    if (
      newOrgData.adminAccount.accountStatus === 'INVITED' &&
      newOrgData.adminAccount.invitationStatus === 'INVITATION_SENT' &&
      newOrgData.adminAccount.invitationExpiresAt
    ) {
      results.test3_invitedStatusAndExpiry = true;
    }

    // ------------------------------------------------------------------------
    // TEST 4: Resend Activation Email (Without Duplicate Accounts)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 4: Testing Resend Activation Email ---');
    const resendRes = await apiRequest(
      `${baseUrl}/subscriptions/platform-admin/organisations/${subId}/resend-activation`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${platformAdminToken}` }
      }
    );
    console.log(`[RESEND ACTIVATION] Status: ${resendRes.status}, Message: ${resendRes.data.message}`);

    const postResendDetails = await apiRequest(
      `${baseUrl}/subscriptions/platform-admin/organisations/${subId}`,
      { headers: { Authorization: `Bearer ${platformAdminToken}` } }
    );
    const resendCount = postResendDetails.data.data.adminAccount.invitationResendCount;
    console.log(` - Resend Count: ${resendCount}`);

    // Verify exactly one subscription record and no duplicate assignments created
    const { EmployeeRoleAssignment } = getModels();
    const assignmentCount = await EmployeeRoleAssignment.count({
      where: { organisationId: newOrgData.organisation.id }
    });
    console.log(` - EmployeeRoleAssignment count: ${assignmentCount} (Expected <= 1)`);

    if (resendRes.status === 200 && resendCount === 1 && assignmentCount <= 1) {
      results.test4_resendWithoutDuplicates = true;
    }

    // ------------------------------------------------------------------------
    // TEST 5: Activate Account & Verify Status Transitions to ACTIVATED
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 5: Customer Activates Password & Account ---');
    const { Subscription } = getModels();
    const updatedSub = await Subscription.findByPk(subId);

    // Note: In production, the raw token is only sent directly to customer email, never exposed in API.
    // In test context, we generate a test activation token, set its hash in the DB, and invoke the live activate API.
    const testActivationToken = crypto.randomBytes(32).toString('hex');
    const testTokenHash = crypto.createHash('sha256').update(testActivationToken).digest('hex');
    await updatedSub.update({
      activationTokenHash: testTokenHash,
      activationExpiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000)
    });

    const activateRes = await apiRequest(`${baseUrl}/subscriptions/activate`, {
      method: 'POST',
      body: {
        activationToken: testActivationToken,
        password: 'StrongOrgAdmin#2026!'
      }
    });
    console.log(`[ACTIVATE] Status: ${activateRes.status}`);

    const postActivateDetails = await apiRequest(
      `${baseUrl}/subscriptions/platform-admin/organisations/${subId}`,
      { headers: { Authorization: `Bearer ${platformAdminToken}` } }
    );
    console.log(`[POST-ACTIVATION STATUS] Account: ${postActivateDetails.data.data.adminAccount.accountStatus}, Invitation: ${postActivateDetails.data.data.adminAccount.invitationStatus}`);

    if (
      postActivateDetails.data.data.adminAccount.accountStatus === 'ACTIVATED' &&
      postActivateDetails.data.data.adminAccount.invitationStatus === 'ACCOUNT_ACTIVATED'
    ) {
      results.test5_activatedStatusReflected = true;
    }

    // ------------------------------------------------------------------------
    // TEST 6: Trigger Password Reset Flow for Activated Account
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 6: Testing Password Reset Flow for Activated Account ---');
    const pwdResetRes = await apiRequest(
      `${baseUrl}/subscriptions/platform-admin/organisations/${subId}/password-reset`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${platformAdminToken}` }
      }
    );
    console.log(`[PASSWORD RESET] Status: ${pwdResetRes.status}, Message: ${pwdResetRes.data.message}`);
    if (pwdResetRes.status === 200 && pwdResetRes.data.data.resetPortalUrl) {
      results.test6_passwordResetFlow = true;
    }

    // ------------------------------------------------------------------------
    // TEST 7: Missing Admin Account Detection & Recovery
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 7: Missing Admin Account Detection & Safe Recovery ---');
    const recoverySubId = crypto.randomUUID();
    const recoveryOrgId = crypto.randomUUID();
    await Subscription.create({
      id: recoverySubId,
      organisationId: recoveryOrgId,
      organisationName: 'Recovery Target Corp',
      organisationDomain: 'recoverytarget.io',
      industry: 'Robotics',
      companySize: '11-50',
      adminName: 'Sarah Connor',
      adminEmail: `sarah.recovery.${Date.now()}@cyberdyne.io`,
      planCode: 'RECRUITMENT_BASIC',
      billingCycle: 'MONTHLY',
      amountCents: 49900,
      currency: 'USD',
      status: 'ACTIVE',
      activatedAt: new Date(),
      provisioningStatus: 'PROVISIONED',
      paymentInstructions: {}
    });

    const inspectMissingRes = await apiRequest(
      `${baseUrl}/subscriptions/platform-admin/organisations/${recoverySubId}`,
      { headers: { Authorization: `Bearer ${platformAdminToken}` } }
    );
    console.log(`[MISSING INSPECTION] isMissingAssignment: ${inspectMissingRes.data.data.adminAccount.isMissingAssignment}`);

    const recoverRes = await apiRequest(
      `${baseUrl}/subscriptions/platform-admin/organisations/${recoverySubId}/recover-admin`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${platformAdminToken}` }
      }
    );
    console.log(`[RECOVER ADMIN] Status: ${recoverRes.status}, Message: ${recoverRes.data.message}`);

    const postRecoveryDetails = await apiRequest(
      `${baseUrl}/subscriptions/platform-admin/organisations/${recoverySubId}`,
      { headers: { Authorization: `Bearer ${platformAdminToken}` } }
    );
    console.log(`[POST RECOVERY] Account Status: ${postRecoveryDetails.data.data.adminAccount.accountStatus}, AssignmentId: ${postRecoveryDetails.data.data.adminAccount.assignmentId}`);

    if (
      inspectMissingRes.data.data.adminAccount.isMissingAssignment === true &&
      recoverRes.status === 200 &&
      postRecoveryDetails.data.data.adminAccount.assignmentId
    ) {
      results.test7_missingAccountRecovery = true;
    }

    // ------------------------------------------------------------------------
    // TEST 8 & 9: Security: Non-Platform Admin (403) & Unauthorized (401)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 8 & 9: Security & Authorization Boundaries ---');
    const candAccessRes = await apiRequest(`${baseUrl}/subscriptions/platform-admin/organisations`, {
      headers: { Authorization: `Bearer ${candidateToken}` }
    });
    if (candAccessRes.status === 403) {
      console.log('[SECURITY 403] Non-admin candidate correctly rejected with HTTP 403.');
      results.test8_nonAdminRejected403 = true;
    } else {
      throw new Error(`Expected 403 for candidate access, got ${candAccessRes.status}`);
    }

    const unauthRes = await apiRequest(`${baseUrl}/subscriptions/platform-admin/organisations`);
    if (unauthRes.status === 401) {
      console.log('[SECURITY 401] Unauthenticated request correctly rejected with HTTP 401.');
      results.test9_unauthorizedRejected401 = true;
    } else {
      throw new Error(`Expected 401 for unauthenticated request, got ${unauthRes.status}`);
    }

    // ------------------------------------------------------------------------
    // TEST 10: Alpha Apex Tech Data Integrity
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 10: Alpha Apex Tech Data Integrity Audit ---');
    const [alphaDbRows] = await sequelize.query(`
      SELECT id, organisation_id, organisation_name, admin_name, admin_email, status, plan_code 
      FROM subscriptions 
      WHERE id = '83baf0aa-5ba4-43e8-bc83-962ca6e2982c';
    `);

    if (alphaDbRows.length === 0) {
      throw new Error('Alpha Apex Tech subscription record not found in PostgreSQL');
    }
    const alphaRecord = alphaDbRows[0];
    console.log(`[DATA INTEGRITY] Alpha Apex Tech: ${alphaRecord.organisation_name}`);
    console.log(` - Admin: ${alphaRecord.admin_name} <${alphaRecord.admin_email}>`);
    console.log(` - OrgID: ${alphaRecord.organisation_id}`);
    console.log(` - Status: ${alphaRecord.status}, Plan: ${alphaRecord.plan_code}`);

    if (
      alphaRecord.organisation_name === 'Alpha Apex Tech' &&
      alphaRecord.status === 'TRIAL' &&
      alphaRecord.organisation_id === 'c19fa048-1d33-479b-949a-64f46d3fee5d'
    ) {
      results.test10_alphaApexTechPreserved = true;
    }

    console.log('\n' + '='.repeat(70));
    console.log('ALL VERIFICATION PHASES COMPLETED');
    console.log('='.repeat(70));
    console.log(JSON.stringify(results, null, 2));

  } catch (err) {
    console.error('\n❌ VERIFICATION FAILURE:', err.message, err.response?.data || '');
    process.exit(1);
  } finally {
    server.close();
    await disconnectDatabase();
  }
}

runDirectoryVerification();
