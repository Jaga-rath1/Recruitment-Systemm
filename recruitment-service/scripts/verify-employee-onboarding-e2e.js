'use strict';

const fs = require('fs');
const path = require('path');
const tls = require('tls');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { getSequelize, disconnectDatabase, getModels } = require('../src/config/database');
const { createApp } = require('../src/app');
const authAdapter = require('../src/integrations/auth/auth.adapter');
const env = require('../src/config/env');

const TEST_EMAIL = process.env.SMTP_USER || 'jagankumarrath72@gmail.com';
const IMAP_PASS = process.env.SMTP_PASS;

function checkImapForEmployeeInvitation({ timeoutMs = 25000 }) {
  return new Promise((resolve, reject) => {
    console.log(`[IMAP] Connecting to imap.gmail.com:993 for ${TEST_EMAIL}...`);
    const socket = tls.connect(993, 'imap.gmail.com', { rejectUnauthorized: false });

    let buffer = '';
    let step = 0;
    let foundEmailDetails = null;

    const timer = setTimeout(() => {
      socket.end();
      if (foundEmailDetails) {
        resolve(foundEmailDetails);
      } else {
        reject(new Error(`[IMAP Timeout] Did not find employee invitation email within ${timeoutMs}ms`));
      }
    }, timeoutMs);

    socket.on('data', (data) => {
      const text = data.toString();
      buffer += text;

      if (step === 0 && buffer.includes('* OK')) {
        step = 1;
        buffer = '';
        socket.write(`a001 LOGIN ${TEST_EMAIL} ${IMAP_PASS}\r\n`);
      } else if (step === 1 && buffer.includes('a001 OK')) {
        step = 2;
        buffer = '';
        socket.write(`a002 SELECT INBOX\r\n`);
      } else if (step === 1 && (buffer.includes('a001 NO') || buffer.includes('a001 BAD'))) {
        clearTimeout(timer);
        socket.end();
        reject(new Error(`[IMAP Auth Failed]: ${buffer.trim()}`));
      } else if (step === 2 && buffer.includes('a002 OK')) {
        step = 3;
        buffer = '';
        socket.write(`a003 SEARCH SUBJECT "You've Been Invited to Join"\r\n`);
      } else if (step === 3 && buffer.includes('a003 OK')) {
        step = 4;
        const match = buffer.match(/\* SEARCH ([\d\s]+)/);
        const ids = match ? match[1].trim().split(/\s+/).filter(Boolean) : [];
        if (ids.length === 0) {
          clearTimeout(timer);
          socket.write(`a005 LOGOUT\r\n`);
          socket.end();
          reject(new Error('[IMAP] No email found matching subject "You\'ve Been Invited to Join"'));
          return;
        }
        const latestId = ids[ids.length - 1];
        buffer = '';
        socket.write(`a004 FETCH ${latestId} (BODY.PEEK[HEADER.FIELDS (SUBJECT FROM TO DATE MESSAGE-ID)] BODY.PEEK[1]<0.2000>)\r\n`);
      } else if (step === 4 && buffer.includes('a004 OK')) {
        step = 5;
        const cleanedText = buffer.replace(/=\r?\n/g, '').replace(/=3D/gi, '=');
        const subjectMatch = cleanedText.match(/Subject:\s*([^\r\n]+)/i);
        const fromMatch = cleanedText.match(/From:\s*([^\r\n]+)/i);
        const dateMatch = cleanedText.match(/Date:\s*([^\r\n]+)/i);
        const tokenMatch = cleanedText.match(/activate-employee\?token=([a-f0-9]{32,64})/i);

        foundEmailDetails = {
          verified: true,
          subject: subjectMatch ? subjectMatch[1].trim() : 'N/A',
          from: fromMatch ? fromMatch[1].trim() : 'N/A',
          date: dateMatch ? dateMatch[1].trim() : 'N/A',
          extractedToken: tokenMatch ? tokenMatch[1] : null,
          hasRecruiterPortalLink: cleanedText.includes('recruiter-login'),
          hasExpirationNotice: cleanedText.includes('48 hours') || cleanedText.includes('48h'),
          rawSnippet: cleanedText.slice(0, 500)
        };

        socket.write(`a005 LOGOUT\r\n`);
      } else if (step === 5 && buffer.includes('a005 OK')) {
        clearTimeout(timer);
        socket.end();
        resolve(foundEmailDetails);
      }
    });

    socket.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function runVerification() {
  console.log('='.repeat(70));
  console.log('NEXNUV RECRUITMENT — ROLE SEPARATION & EMPLOYEE ONBOARDING E2E TEST');
  console.log('='.repeat(70));

  const sequelize = getSequelize();
  const app = createApp();
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[HTTP] Test server listening on ${baseUrl}`);

  async function api(path, options = {}) {
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      body: options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined
    });
    const data = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok, data };
  }

  const results = {
    part1_portalSeparation: false,
    part2_employeeOnboarding: false,
    part2_imapVerified: false,
    part2_activationSuccess: false,
    part2_resendSuccess: false,
    dataIntegrityPreserved: false
  };

  try {
    // ------------------------------------------------------------------------
    // SETUP: Seed test organisation & admin
    // ------------------------------------------------------------------------
    console.log('\n--- PHASE 1: Setting Up Test Organisation Context ---');
    const orgId = '77777777-7777-4777-a777-777777777777';
    const orgName = 'Omni Consumer Tech';
    const orgAdminEmail = 'orgadmin.test@omnicorp.com';
    const orgAdminPass = 'OrgAdmin#2026!';

    // Register / Seed Org Admin in standalone adapter
    const orgAdminRecord = authAdapter.seedStandaloneUser({
      userId: '66666666-6666-4666-a666-666666666666',
      email: orgAdminEmail,
      name: 'Omni Admin',
      organisationId: orgId,
      employeeId: '55555555-5555-4555-a555-555555555555',
      userType: 'ORG_USER',
      roles: ['ORGANISATION_ADMIN'],
      password: orgAdminPass,
      isActive: true
    });

    // Seed roles in DB for this organisation
    const { seedOrganisationRoles } = require('../src/db/seed');
    const rolesByCode = await seedOrganisationRoles(orgId);
    const orgAdminRole = rolesByCode.ORGANISATION_ADMIN;

    const { EmployeeRoleAssignment } = getModels();
    const existingAssign = await EmployeeRoleAssignment.findOne({
      where: { organisationId: orgId, authUserId: '66666666-6666-4666-a666-666666666666' }
    });
    if (!existingAssign) {
      await EmployeeRoleAssignment.create({
        organisationId: orgId,
        employeeId: '55555555-5555-4555-a555-555555555555',
        authUserId: '66666666-6666-4666-a666-666666666666',
        roleId: orgAdminRole.id,
        isActive: true,
        invitationStatus: 'ACCOUNT_ACTIVATED'
      });
    }

    // Seed Candidate
    const candidateEmail = `candidate.${Date.now()}@nexnuv.test`;
    const candidatePass = 'CandSecure#2026!';
    await authAdapter.registerOrLoginCandidate({
      fullName: 'David Test Candidate',
      email: candidateEmail,
      password: candidatePass,
      mode: 'register'
    });

    // Verify candidate in DB directly for test convenience
    const { CandidateAccount } = getModels();
    await CandidateAccount.update(
      { emailVerified: true, emailVerifiedAt: new Date() },
      { where: { email: candidateEmail } }
    );
    console.log(`[SETUP] Org Admin: ${orgAdminEmail}, Candidate: ${candidateEmail}`);

    // ------------------------------------------------------------------------
    // PART 1: Role-Based Portal Separation & Backend Enforcement
    // ------------------------------------------------------------------------
    console.log('\n--- PHASE 2: Verifying 4 Separate Login Portals & RBAC Enforcement ---');

    // 1. Candidate Portal Login
    console.log('[TEST 1.1] Candidate Login (/api/v1/auth/candidate/login)');
    const candLoginRes = await api('/api/v1/auth/candidate/login', {
      method: 'POST',
      body: { email: candidateEmail, password: candidatePass }
    });
    console.log(`  Candidate credentials -> Status ${candLoginRes.status} (Expected 200)`);
    if (candLoginRes.status !== 200 || candLoginRes.data?.data?.user?.userType !== 'CANDIDATE') {
      throw new Error(`Candidate login failed: ${JSON.stringify(candLoginRes.data)}`);
    }

    // Try Org Admin on Candidate Portal -> MUST FAIL (403)
    const orgOnCandRes = await api('/api/v1/auth/candidate/login', {
      method: 'POST',
      body: { email: orgAdminEmail, password: orgAdminPass }
    });
    console.log(`  Org Admin on Candidate Portal -> Status ${orgOnCandRes.status} (Expected 403)`);
    if (orgOnCandRes.status !== 403) {
      throw new Error(`Org Admin was not rejected on Candidate portal! Status: ${orgOnCandRes.status}`);
    }

    // 2. Platform Admin Portal Login
    console.log('[TEST 1.2] Platform Admin Login (/api/v1/auth/platform-admin/login)');
    const platAdminRes = await api('/api/v1/auth/platform-admin/login', {
      method: 'POST',
      body: { email: 'superadmin@nexnuv.com', password: 'SuperAdmin@2026!' }
    });
    console.log(`  Platform Admin credentials -> Status ${platAdminRes.status} (Expected 200)`);
    if (platAdminRes.status !== 200) {
      throw new Error(`Platform Admin login failed: ${JSON.stringify(platAdminRes.data)}`);
    }

    // Try Candidate on Platform Admin Portal -> MUST FAIL (403)
    const candOnPlatRes = await api('/api/v1/auth/platform-admin/login', {
      method: 'POST',
      body: { email: candidateEmail, password: candidatePass }
    });
    console.log(`  Candidate on Platform Admin Portal -> Status ${candOnPlatRes.status} (Expected 403)`);
    if (candOnPlatRes.status !== 403) {
      throw new Error(`Candidate was not rejected on Platform Admin portal! Status: ${candOnPlatRes.status}`);
    }

    // 3. Organisation Admin Portal Login
    console.log('[TEST 1.3] Organisation Admin Login (/api/v1/auth/org-admin/login)');
    const orgAdminLoginRes = await api('/api/v1/auth/org-admin/login', {
      method: 'POST',
      body: { email: orgAdminEmail, password: orgAdminPass }
    });
    console.log(`  Org Admin credentials -> Status ${orgAdminLoginRes.status} (Expected 200)`);
    if (orgAdminLoginRes.status !== 200) {
      throw new Error(`Org Admin login failed: ${JSON.stringify(orgAdminLoginRes.data)}`);
    }
    const orgAdminToken = orgAdminLoginRes.data.data.token;

    // Try Platform Admin on Org Admin Portal -> MUST FAIL (403)
    const platOnOrgRes = await api('/api/v1/auth/org-admin/login', {
      method: 'POST',
      body: { email: 'superadmin@nexnuv.com', password: 'SuperAdmin@2026!' }
    });
    console.log(`  Platform Admin on Org Admin Portal -> Status ${platOnOrgRes.status} (Expected 403)`);
    if (platOnOrgRes.status !== 403) {
      throw new Error(`Platform Admin was not rejected on Org Admin portal! Status: ${platOnOrgRes.status}`);
    }

    // 4. Recruiter Portal Login - Cross-check
    console.log('[TEST 1.4] Recruiter Login Cross-Check (/api/v1/auth/recruiter/login)');
    const candOnRecruiterRes = await api('/api/v1/auth/recruiter/login', {
      method: 'POST',
      body: { email: candidateEmail, password: candidatePass }
    });
    console.log(`  Candidate on Recruiter Portal -> Status ${candOnRecruiterRes.status} (Expected 403)`);
    if (candOnRecruiterRes.status !== 403) {
      throw new Error(`Candidate was not rejected on Recruiter portal! Status: ${candOnRecruiterRes.status}`);
    }

    results.part1_portalSeparation = true;
    console.log('✓ PART 1: Four Separate Login Portals & Strict RBAC Enforcement VERIFIED.');

    // ------------------------------------------------------------------------
    // PART 2: Employee Creation, Invitation & Account Activation
    // ------------------------------------------------------------------------
    console.log('\n--- PHASE 3: Employee Creation & Automated Onboarding Email ---');

    // Add employee as Org Admin
    const addEmployeeRes = await api('/api/v1/organisations/employees', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${orgAdminToken}`,
        'x-organisation-id': orgId
      },
      body: {
        fullName: 'Sarah Connor',
        email: TEST_EMAIL,
        department: 'Talent Acquisition',
        designation: 'Senior Technical Recruiter',
        roleCode: 'RECRUITER',
        sendInvite: true
      }
    });

    console.log(`[ADD EMPLOYEE] Status: ${addEmployeeRes.status}`);
    if (addEmployeeRes.status !== 201) {
      throw new Error(`Failed to add employee: ${JSON.stringify(addEmployeeRes.data)}`);
    }

    const employeeId = addEmployeeRes.data.data.employeeId;
    const invitePreview = addEmployeeRes.data.data.invitePreview;
    console.log(`[EMPLOYEE CREATED] Employee ID: ${employeeId}`);
    results.part2_employeeOnboarding = true;

    // Check database state
    const [assignmentRows] = await sequelize.query(`
      SELECT invitation_status, invitation_token_hash, invitation_expires_at, 
             invitation_sent_at, invitation_delivery_status, invitation_resend_count
      FROM employee_role_assignments
      WHERE employee_id = '${employeeId}';
    `);
    const dbAssignment = assignmentRows[0];
    console.log('[DB RECORD] Employee role assignment:');
    console.log(` - invitation_status: ${dbAssignment.invitation_status}`);
    console.log(` - invitation_token_hash: ${dbAssignment.invitation_token_hash ? '[REDACTED 64-char SHA256]' : 'NULL'}`);
    console.log(` - invitation_expires_at: ${dbAssignment.invitation_expires_at}`);
    console.log(` - invitation_delivery_status: ${dbAssignment.invitation_delivery_status}`);

    if (dbAssignment.invitation_status !== 'INVITATION_SENT') {
      throw new Error(`Expected invitation_status 'INVITATION_SENT', got: ${dbAssignment.invitation_status}`);
    }

    // Verify actual delivery in controlled mailbox via IMAP
    console.log('\n--- PHASE 4: Verifying Email Receipt in Test Mailbox via IMAP ---');
    console.log(`Target Mailbox: ${TEST_EMAIL}`);
    const imapEmail = await checkImapForEmployeeInvitation({ timeoutMs: 20000 });
    console.log('[IMAP EVIDENCE]');
    console.log(` - Subject: ${imapEmail.subject}`);
    console.log(` - From: ${imapEmail.from}`);
    console.log(` - Date: ${imapEmail.date}`);
    console.log(` - Contains Recruiter Portal Link: ${imapEmail.hasRecruiterPortalLink}`);
    console.log(` - Contains 48h Expiration Notice: ${imapEmail.hasExpirationNotice}`);
    console.log(` - Extracted Token from Link: ${imapEmail.extractedToken ? '[PRESENT & REDACTED]' : 'N/A'}`);

    if (!imapEmail.hasRecruiterPortalLink) {
      throw new Error('Email body missing recruiter login portal URL');
    }
    results.part2_imapVerified = true;

    // ------------------------------------------------------------------------
    // PHASE 5: Token Inspection & Employee Password Setup
    // ------------------------------------------------------------------------
    console.log('\n--- PHASE 5: Inspecting Token & Activating Employee Account ---');
    const previewToken = invitePreview?.activationLink ? new URL(invitePreview.activationLink).searchParams.get('token') : null;
    const rawActivationToken = previewToken || imapEmail.extractedToken;
    console.log(`[TOKEN] Preview token length: ${previewToken?.length}, IMAP token length: ${imapEmail.extractedToken?.length}`);

    if (!rawActivationToken) {
      throw new Error('Could not obtain activation token for testing activation endpoint');
    }

    // Inspect token
    const inspectRes = await api(`/api/v1/organisations/employees/activate/inspect?token=${rawActivationToken}`);
    console.log(`[INSPECT TOKEN] Status: ${inspectRes.status}`);
    console.log(` - Valid: ${inspectRes.data?.data?.valid}`);
    console.log(` - Employee: ${inspectRes.data?.data?.employeeName}`);
    console.log(` - Role: ${inspectRes.data?.data?.roleName} (${inspectRes.data?.data?.roleCode})`);
    console.log(` - Login Portal: ${inspectRes.data?.data?.loginUrl}`);

    if (inspectRes.status !== 200 || !inspectRes.data?.data?.valid) {
      throw new Error(`Token inspection failed: ${JSON.stringify(inspectRes.data)}`);
    }

    // Activate Account
    const newPassword = 'RecruiterSecure#2026!';
    const activateRes = await api('/api/v1/organisations/employees/activate', {
      method: 'POST',
      body: {
        token: rawActivationToken,
        password: newPassword
      }
    });

    console.log(`[ACTIVATE ACCOUNT] Status: ${activateRes.status}`);
    console.log(` - Message: ${activateRes.data?.message}`);
    console.log(` - Login Portal: ${activateRes.data?.data?.loginUrl}`);

    if (activateRes.status !== 200 || !activateRes.data?.data?.success) {
      throw new Error(`Account activation failed: ${JSON.stringify(activateRes.data)}`);
    }

    // Check DB state after activation
    const [postActiveRows] = await sequelize.query(`
      SELECT invitation_status, invitation_token_hash, account_activated_at, is_active
      FROM employee_role_assignments
      WHERE employee_id = '${employeeId}';
    `);
    const postAssignment = postActiveRows[0];
    console.log('[DB RECORD AFTER ACTIVATION]');
    console.log(` - invitation_status: ${postAssignment.invitation_status}`);
    console.log(` - account_activated_at: ${postAssignment.account_activated_at}`);
    console.log(` - invitation_token_hash: ${postAssignment.invitation_token_hash} (Single-use invalidated!)`);
    console.log(` - is_active: ${postAssignment.is_active}`);

    if (postAssignment.invitation_status !== 'ACCOUNT_ACTIVATED' || postAssignment.invitation_token_hash !== null) {
      throw new Error('Database record did not transition correctly to ACCOUNT_ACTIVATED with null token hash');
    }

    // Test single-use token reuse rejection
    const reuseRes = await api('/api/v1/organisations/employees/activate', {
      method: 'POST',
      body: {
        token: rawActivationToken,
        password: newPassword
      }
    });
    console.log(`[REUSE TOKEN CHECK] Status: ${reuseRes.status} (Expected 404 Not Found)`);
    if (reuseRes.status !== 404) {
      throw new Error(`Single-use token was not invalidated! Status: ${reuseRes.status}`);
    }

    // ------------------------------------------------------------------------
    // PHASE 6: Sign In as Newly Activated Recruiter
    // ------------------------------------------------------------------------
    console.log('\n--- PHASE 6: Sign In as Newly Activated Recruiter ---');
    const recruiterLoginRes = await api('/api/v1/auth/recruiter/login', {
      method: 'POST',
      body: {
        email: TEST_EMAIL,
        password: newPassword
      }
    });

    console.log(`[RECRUITER LOGIN] Status: ${recruiterLoginRes.status}`);
    console.log(` - User email: ${recruiterLoginRes.data?.data?.user?.email}`);
    console.log(` - Active Role: ${recruiterLoginRes.data?.data?.user?.activeRoleCode}`);

    if (recruiterLoginRes.status !== 200) {
      throw new Error(`Newly activated recruiter could not log in: ${JSON.stringify(recruiterLoginRes.data)}`);
    }

    // Recruiter tries to login at /org-admin/login -> MUST FAIL (403)
    const recruiterOnOrgRes = await api('/api/v1/auth/org-admin/login', {
      method: 'POST',
      body: {
        email: TEST_EMAIL,
        password: newPassword
      }
    });
    console.log(`[RECRUITER ON ORG-ADMIN PORTAL] Status: ${recruiterOnOrgRes.status} (Expected 403 Forbidden)`);
    if (recruiterOnOrgRes.status !== 403) {
      throw new Error(`Recruiter was allowed to sign in to Organisation Admin portal! Status: ${recruiterOnOrgRes.status}`);
    }

    results.part2_activationSuccess = true;

    // ------------------------------------------------------------------------
    // PHASE 7: Resend Invitation Endpoint Verification
    // ------------------------------------------------------------------------
    console.log('\n--- PHASE 7: Testing Resend Invitation Endpoint ---');
    // Create an unactivated employee to test resend
    const unactiveEmpRes = await api('/api/v1/organisations/employees', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${orgAdminToken}`,
        'x-organisation-id': orgId
      },
      body: {
        fullName: 'John Connor',
        email: `john.connor.${Date.now()}@nexnuv.test`,
        department: 'Engineering',
        designation: 'Interviewer',
        roleCode: 'TECHNICAL_INTERVIEWER',
        sendInvite: true
      }
    });
    const unactiveEmpId = unactiveEmpRes.data.data.employeeId;

    const resendRes = await api(`/api/v1/organisations/employees/${unactiveEmpId}/resend-invitation`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${orgAdminToken}`,
        'x-organisation-id': orgId
      }
    });
    console.log(`[RESEND INVITATION] Status: ${resendRes.status}`);
    console.log(` - Resend Count: ${resendRes.data?.data?.resendCount}`);

    if (resendRes.status !== 200 || resendRes.data?.data?.resendCount !== 1) {
      throw new Error(`Resend invitation failed: ${JSON.stringify(resendRes.data)}`);
    }
    results.part2_resendSuccess = true;

    // ------------------------------------------------------------------------
    // PHASE 8: Data Integrity Verification (Alpha Apex Tech)
    // ------------------------------------------------------------------------
    console.log('\n--- PHASE 8: Customer Data Integrity Verification ---');
    const [alphaOrgRows] = await sequelize.query(`
      SELECT id, organisation_id, organisation_name, status, plan_code, admin_email 
      FROM subscriptions 
      WHERE id = '83baf0aa-5ba4-43e8-bc83-962ca6e2982c';
    `);
    if (alphaOrgRows.length === 0) {
      throw new Error('Alpha Apex Tech subscription record was NOT found!');
    }
    console.log(`[DATA INTEGRITY] Alpha Apex Tech: ${alphaOrgRows[0].organisation_name} (Status: ${alphaOrgRows[0].status}, OrgID: ${alphaOrgRows[0].organisation_id}, Plan: ${alphaOrgRows[0].plan_code}) INTACT.`);
    results.dataIntegrityPreserved = true;

    console.log('\n' + '='.repeat(70));
    console.log('ALL VERIFICATION PHASES COMPLETED WITH 100% SUCCESS');
    console.log('='.repeat(70));
    console.log(JSON.stringify(results, null, 2));

  } catch (err) {
    console.error('\n❌ VERIFICATION FAILURE:', err.message, err.errors || '');
    process.exit(1);
  } finally {
    server.close();
    await disconnectDatabase();
  }
}

runVerification();
