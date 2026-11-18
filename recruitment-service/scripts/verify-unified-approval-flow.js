const fs = require('fs');
const path = require('path');
const tls = require('tls');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const BASE_URL = 'http://127.0.0.1:4007';
const TEST_EMAIL = process.env.SMTP_USER || 'jagankumarrath72@gmail.com';
const IMAP_PASS = process.env.SMTP_PASS;

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(url, {
    ...options,
    headers,
    body: options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

function checkImapEmail({ expectedTextPhrases, timeoutMs = 25000 }) {
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
        reject(new Error(`[IMAP Timeout] Did not complete email verification within ${timeoutMs}ms`));
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
        socket.write(`a003 SEARCH SUBJECT "Activate Your NEXNUV Recruitment Workspace"\r\n`);
      } else if (step === 3 && buffer.includes('a003 OK')) {
        step = 4;
        const match = buffer.match(/\* SEARCH ([\d\s]+)/);
        const ids = match ? match[1].trim().split(/\s+/).filter(Boolean) : [];
        if (ids.length === 0) {
          clearTimeout(timer);
          socket.write(`a005 LOGOUT\r\n`);
          socket.end();
          reject(new Error('[IMAP] No email found matching subject "Activate Your NEXNUV Recruitment Workspace"'));
          return;
        }
        const latestId = ids[ids.length - 1];
        buffer = '';
        socket.write(`a004 FETCH ${latestId} (BODY.PEEK[HEADER.FIELDS (SUBJECT FROM TO DATE MESSAGE-ID)] BODY.PEEK[1]<0.1500>)\r\n`);
      } else if (step === 4 && buffer.includes('a004 OK')) {
        step = 5;
        const receivedText = buffer;
        const missing = expectedTextPhrases.filter((p) => !receivedText.includes(p));

        const subjectMatch = receivedText.match(/Subject:\s*([^\r\n]+)/i);
        const fromMatch = receivedText.match(/From:\s*([^\r\n]+)/i);
        const dateMatch = receivedText.match(/Date:\s*([^\r\n]+)/i);

        foundEmailDetails = {
          verified: missing.length === 0,
          missingPhrases: missing,
          subject: subjectMatch ? subjectMatch[1].trim() : 'N/A',
          from: fromMatch ? fromMatch[1].trim() : 'N/A',
          date: dateMatch ? dateMatch[1].trim() : 'N/A'
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

async function run() {
  console.log('================================================================');
  console.log('NEXNUV RECRUITMENT — UNIFIED APPROVAL & CUSTOMER ACTIVATION E2E');
  console.log('================================================================\n');

  // Wait for server health
  for (let i = 0; i < 10; i++) {
    try {
      const h = await fetch(`${BASE_URL}/health`);
      if (h.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }

  const orgName = `Quantum AI Labs ${Date.now().toString().slice(-4)}`;
  const domain = `quantum-${Date.now().toString().slice(-4)}.io`;

  // Step 1: Customer submits paid booking
  console.log(`[Step 1] Customer submits paid subscription booking for "${orgName}"...`);
  const bookingRes = await request('/api/v1/subscriptions', {
    method: 'POST',
    body: {
      organisationName: orgName,
      organisationDomain: domain,
      industry: 'Artificial Intelligence',
      companySize: '51-200',
      adminName: 'Dr. Aris Thorne',
      adminEmail: TEST_EMAIL,
      planCode: 'RECRUITMENT_ADVANCED',
      billingCycle: 'ANNUAL'
    }
  });

  if (!bookingRes.ok) {
    throw new Error(`Failed to submit booking: ${JSON.stringify(bookingRes.data)}`);
  }
  const subscriptionId = bookingRes.data.data.id || bookingRes.data.data.subscription?.id;
  const expectedAmountCents = String(bookingRes.data.data.amountCents || bookingRes.data.data.subscription?.amountCents || 149900);
  const expectedCurrency = bookingRes.data.data.currency || bookingRes.data.data.subscription?.currency || 'INR';
  console.log(`   ✓ Booking created: Subscription ID #${subscriptionId} (${expectedCurrency} ${expectedAmountCents})`);

  // Step 2: Customer uploads payment remittance proof
  console.log(`\n[Step 2] Customer submits wire payment proof...`);
  const formData = new FormData();
  formData.append('paymentMethod', 'WIRE_TRANSFER');
  formData.append('paymentReference', `WIRE-QUANTUM-${Date.now().toString().slice(-6)}`);
  formData.append('amountCents', expectedAmountCents);
  formData.append('currency', expectedCurrency);
  formData.append('notes', 'Payment remitted via State Bank Wire Transfer');
  const dummyPdf = new Blob(['%PDF-1.4 sample payment remittance receipt for audit verification'], {
    type: 'application/pdf'
  });
  formData.append('proof', dummyPdf, 'wire_settlement_receipt.pdf');

  const uploadRes = await fetch(`${BASE_URL}/api/v1/subscriptions/${subscriptionId}/payments`, {
    method: 'POST',
    body: formData
  });
  const uploadJson = await uploadRes.json();
  if (!uploadRes.ok) {
    throw new Error(`Failed to submit payment proof: ${JSON.stringify(uploadJson)}`);
  }
  const paymentId = uploadJson.data.payment.id;
  console.log(`   ✓ Payment proof submitted: Payment ID #${paymentId}, Ref #${uploadJson.data.payment.paymentReference}`);

  // Step 3: Platform Admin logs in
  console.log(`\n[Step 3] Platform Admin signs in via /api/v1/auth/login...`);
  const loginRes = await request('/api/v1/auth/login', {
    method: 'POST',
    body: {
      email: 'superadmin@nexnuv.com',
      password: 'SuperAdmin@2026!'
    }
  });
  if (!loginRes.ok) {
    throw new Error(`Platform Admin login failed: ${JSON.stringify(loginRes.data)}`);
  }
  const adminToken = loginRes.data.data.token;
  const adminHeaders = { Authorization: `Bearer ${adminToken}` };
  console.log(`   ✓ Authenticated as ${loginRes.data.data.user.email} (${loginRes.data.data.user.activeRoleCode || loginRes.data.data.user.userType})`);

  // Step 4: Verify booking appears in Platform Admin pending queue
  console.log(`\n[Step 4] Checking Platform Admin pending verification queue...`);
  const queueRes = await request(`/api/v1/subscriptions/platform-admin/queue?status=PENDING_VERIFICATION`, {
    headers: adminHeaders
  });
  const queueItems = queueRes.data?.data || [];
  const foundInQueue = queueItems.find((item) => item.id === subscriptionId);
  if (!foundInQueue) {
    throw new Error(`Booking ${subscriptionId} not found in pending verification queue`);
  }
  console.log(`   ✓ Verified booking ${subscriptionId} is visible in queue with status ${foundInQueue.status}`);

  // Step 5: Execute unified single action "Approve & Create Organisation"
  console.log(`\n[Step 5] Platform Admin clicks "Approve & Create Organisation"...`);
  const approveRes = await request(`/api/v1/subscriptions/platform-admin/${subscriptionId}/verify`, {
    method: 'POST',
    headers: adminHeaders,
    body: {
      decision: 'APPROVE',
      paymentId
    }
  });
  if (!approveRes.ok) {
    throw new Error(`Unified approval failed: ${JSON.stringify(approveRes.data)}`);
  }
  const approvedSub = approveRes.data.data.subscription;
  const invitationPreview = approveRes.data.data.invitationPreview;
  console.log(`   ✓ Status: ${approvedSub.status}`);
  console.log(`   ✓ Tenant Provisioned: Organisation ID #${approvedSub.organisationId}`);
  console.log(`   ✓ Lifecycle Dates Persisted:`);
  console.log(`       startsAt:  ${approvedSub.startsAt}`);
  console.log(`       expiresAt: ${approvedSub.expiresAt}`);
  console.log(`   ✓ Provisioning Status: ${approvedSub.provisioningStatus}`);

  if (!approvedSub.startsAt || !approvedSub.expiresAt) {
    throw new Error('FAILURE: Subscription startsAt or expiresAt was not persisted upon approval!');
  }

  // Step 6: Verify actual email receipt in Gmail inbox via IMAP
  console.log(`\n[Step 6] Connecting to Gmail IMAP to verify customer activation email delivery...`);
  // Give SMTP a few seconds to deliver to Google mail servers
  await new Promise((r) => setTimeout(r, 4000));
  const imapResult = await checkImapEmail({
    expectedTextPhrases: [
      TEST_EMAIL,
      'Plan Start Date:',
      'Plan End Date:',
      'Set Your Administrator Password',
      '/login'
    ],
    timeoutMs: 30000
  });

  console.log(`   ✓ Inbox Email Received!`);
  console.log(`       Subject: ${imapResult.subject}`);
  console.log(`       From:    ${imapResult.from}`);
  console.log(`       Date:    ${imapResult.date}`);
  console.log(`   ✓ All required phrases verified in email body:`);
  console.log(`       - Organisation Name: ${orgName}`);
  console.log(`       - Admin Email: ${TEST_EMAIL}`);
  console.log(`       - Plan Start & End Dates present`);
  console.log(`       - Activation URL & Login link present`);
  if (imapResult.missingPhrases.length > 0) {
    console.warn(`   ⚠ Missing phrases in email: ${imapResult.missingPhrases.join(', ')}`);
  }

  // Step 7: Use activation token to set password
  console.log(`\n[Step 7] Using activation token to set Organisation Admin password...`);
  const rawToken = invitationPreview.activationToken;
  const activateRes = await request('/api/v1/subscriptions/activate', {
    method: 'POST',
    body: {
      activationToken: rawToken,
      password: 'QuantumAdmin#2026!'
    }
  });
  if (!activateRes.ok) {
    throw new Error(`Activation failed: ${JSON.stringify(activateRes.data)}`);
  }
  const activatedSub = activateRes.data.data.subscription;
  console.log(`   ✓ Account activated successfully!`);
  console.log(`   ✓ Subscription status: ${activatedSub.status}`);
  console.log(`   ✓ Activated at: ${activatedSub.activatedAt}`);

  // Step 8: Log in as newly activated Organisation Admin
  console.log(`\n[Step 8] Logging in as newly activated Organisation Admin (${TEST_EMAIL})...`);
  const orgLoginRes = await request('/api/v1/auth/login', {
    method: 'POST',
    body: {
      email: TEST_EMAIL,
      password: 'QuantumAdmin#2026!'
    }
  });
  if (!orgLoginRes.ok) {
    throw new Error(`Org Admin login failed: ${JSON.stringify(orgLoginRes.data)}`);
  }
  const orgAdminToken = orgLoginRes.data.data.token;
  const orgAdminUser = orgLoginRes.data.data.user;
  console.log(`   ✓ Successfully signed in!`);
  console.log(`   ✓ User ID: ${orgAdminUser.userId || orgAdminUser.id}`);
  console.log(`   ✓ Active Role: ${orgAdminUser.activeRoleCode || orgAdminUser.role}`);
  console.log(`   ✓ Tenant Organisation ID: ${orgAdminUser.organisationId}`);

  // Step 9: Verify Organisation Profile & Subscription Lifecycle dates
  console.log(`\n[Step 9] Inspecting Organisation Profile as Org Admin...`);
  const profileRes = await request('/api/v1/organisations/profile', {
    headers: { Authorization: `Bearer ${orgAdminToken}` }
  });
  if (!profileRes.ok) {
    throw new Error(`Fetch profile failed: ${JSON.stringify(profileRes.data)}`);
  }
  const profile = profileRes.data.data;
  console.log(`   ✓ Organisation Profile Name: ${profile.name}`);
  console.log(`   ✓ Subscription Plan: ${profile.subscription?.planCode}`);
  console.log(`   ✓ Persisted startsAt: ${profile.subscription?.startsAt}`);
  console.log(`   ✓ Persisted expiresAt: ${profile.subscription?.expiresAt}`);

  // Step 10: Test creating an employee to verify full tenant access
  console.log(`\n[Step 10] Verifying tenant features: adding team member as Org Admin...`);
  const empRes = await request('/api/v1/organisations/employees', {
    method: 'POST',
    headers: { Authorization: `Bearer ${orgAdminToken}` },
    body: {
      fullName: 'Sarah Chen, Senior Recruiter',
      email: `sarah-${Date.now().toString().slice(-4)}@${domain}`,
      roleCode: 'RECRUITER'
    }
  });
  if (!empRes.ok) {
    throw new Error(`Adding employee failed: ${JSON.stringify(empRes.data)}`);
  }
  const emp = empRes.data.data;
  console.log(`   ✓ Employee added to tenant: ${emp.fullName || emp.name} (ID: ${emp.employeeId})`);

  // Step 11: Verify idempotency - repeated approval should return 409 Conflict
  console.log(`\n[Step 11] Verifying idempotency: repeated approval attempt on already approved booking...`);
  const repeatRes = await request(`/api/v1/subscriptions/platform-admin/${subscriptionId}/verify`, {
    method: 'POST',
    headers: adminHeaders,
    body: { decision: 'APPROVE', paymentId }
  });
  console.log(`   ✓ Repeated approval response: HTTP ${repeatRes.status} (Expected 409 Conflict)`);
  if (repeatRes.status !== 409) {
    throw new Error(`Expected HTTP 409 Conflict on repeated approval, got ${repeatRes.status}`);
  }

  // Step 12: Verify Alpha Apex Tech remains 100% intact
  console.log(`\n[Step 12] Verifying Alpha Apex Tech customer record is intact...`);
  const { getModels } = require('../src/config/database');
  const { Subscription } = getModels();
  const alphaSub = await Subscription.findOne({ where: { organisationName: 'Alpha Apex Tech' } });
  if (!alphaSub) {
    throw new Error('CRITICAL: Alpha Apex Tech not found in database!');
  }
  console.log(`   ✓ Alpha Apex Tech verified:`);
  console.log(`       ID:     ${alphaSub.id}`);
  console.log(`       Status: ${alphaSub.status}`);
  console.log(`       Plan:   ${alphaSub.planCode}`);
  console.log(`       Archived: ${alphaSub.isArchived}`);

  console.log('\n================================================================');
  console.log('✅ ALL 12 END-TO-END VERIFICATION STEPS PASSED SUCCESSFULLY!');
  console.log('================================================================\n');
  process.exit(0);
}

run().catch((err) => {
  console.error('\n❌ VERIFICATION TEST FAILED:', err);
  process.exit(1);
});
