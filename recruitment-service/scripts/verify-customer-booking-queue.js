const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const request = require('supertest');
const { createApp } = require('../src/app');
const { getSequelize, getModels } = require('../src/config/database');
const authAdapter = require('../src/integrations/auth/auth.adapter');

async function runBookingQueueVerification() {
  console.log('========================================================================');
  console.log(' NEXNUV Recruitment — Customer Booking & Platform Admin Queue Verification');
  console.log('========================================================================\n');

  const sequelize = getSequelize();
  await sequelize.authenticate();
  console.log('[Step 1] Database connected to Neon PostgreSQL successfully.');

  const app = createApp();

  // Create Platform Admin Token
  const platformAdminToken = authAdapter.signAccessToken({
    sub: '00000000-0000-4000-a000-000000000001',
    email: 'platformadmin@nexnuv.com',
    name: 'Platform Super Admin',
    userType: 'PLATFORM_ADMIN',
    roles: ['PLATFORM_ADMIN']
  });
  console.log('[Step 2] Platform Admin JWT token generated.');

  // Step 3: Customer Books Paid Subscription via Public Page
  const runId = Date.now().toString().slice(-6);
  const orgName = `Zenith Core Corp ${runId}`;
  const orgDomain = `zenithcore-${runId}.com`;
  const adminEmail = `admin-${runId}@zenithcore.com`;
  const paymentRef = `WIRE-ZENITH-${runId}`;

  console.log(`\n[Step 3] Customer books paid subscription for "${orgName}"...`);
  const registerPayload = {
    organisationName: orgName,
    organisationDomain: orgDomain,
    industry: 'Engineering & Technology',
    companySize: '51-200',
    adminName: 'Aarav Singhania',
    adminEmail: adminEmail,
    planCode: 'RECRUITMENT_ADVANCED',
    billingCycle: 'ANNUAL'
  };

  const regRes = await request(app)
    .post('/api/v1/subscriptions')
    .send(registerPayload);

  console.log(`  -> Registration HTTP ${regRes.status}`);
  if (regRes.status !== 201) {
    throw new Error(`Registration failed: ${JSON.stringify(regRes.body)}`);
  }
  const subscriptionId = regRes.body.data.id;
  const initialStatus = regRes.body.data.status;
  console.log(`  -> Subscription created with ID: ${subscriptionId}, Status: ${initialStatus}`);
  console.log(`  -> Remittance instructions provided: Memo = ${regRes.body.data.paymentInstructions?.paymentMemo}`);

  // Step 4: Customer submits payment proof
  console.log(`\n[Step 4] Customer uploads payment remittance proof for subscription ${subscriptionId}...`);
  const samplePdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
  const proofRes = await request(app)
    .post(`/api/v1/subscriptions/${subscriptionId}/payments`)
    .field('paymentReference', paymentRef)
    .field('paymentMethod', 'WIRE_TRANSFER')
    .field('submittedByEmail', adminEmail)
    .attach('proof', samplePdf, {
      filename: `zenith_remittance_${runId}.pdf`,
      contentType: 'application/pdf'
    });

  console.log(`  -> Payment proof submission HTTP ${proofRes.status}`);
  if (proofRes.status !== 201) {
    throw new Error(`Payment proof submission failed: ${JSON.stringify(proofRes.body)}`);
  }
  const paymentId = proofRes.body.data.payment.id;
  const updatedSubStatus = proofRes.body.data.subscription.status;
  console.log(`  -> Payment record created: ID = ${paymentId}, Ref = ${paymentRef}, Status = ${proofRes.body.data.payment.status}`);
  console.log(`  -> Subscription status updated to: ${updatedSubStatus}`);

  // Step 5: Platform Admin Verification Queue Visibility
  console.log(`\n[Step 5] Platform Admin calls GET /api/v1/subscriptions/platform-admin/queue...`);
  const queueRes = await request(app)
    .get('/api/v1/subscriptions/platform-admin/queue')
    .set('Authorization', `Bearer ${platformAdminToken}`);

  console.log(`  -> Queue API HTTP ${queueRes.status}`);
  if (queueRes.status !== 200) {
    throw new Error(`Failed to list queue: ${JSON.stringify(queueRes.body)}`);
  }
  const queueItems = queueRes.body.data || [];
  const queueMeta = queueRes.body.meta || {};
  console.log(`  -> Total pending queue records: ${queueMeta.total || queueItems.length}`);

  const foundItem = queueItems.find((item) => item.id === subscriptionId);
  if (!foundItem) {
    throw new Error(`CRITICAL BUG DETECTED: Subscription ${subscriptionId} (${orgName}) was NOT returned in queue!`);
  }
  console.log(`  -> SUCCESS! Newly booked subscription found in queue:`);
  console.log(`     - Organisation: ${foundItem.organisationName}`);
  console.log(`     - Admin Email: ${foundItem.adminEmail}`);
  console.log(`     - Status: ${foundItem.status}`);
  console.log(`     - Plan: ${foundItem.planName} (${foundItem.planCode})`);
  console.log(`     - Amount: ${foundItem.amountCents} cents / paise (${foundItem.currency})`);
  console.log(`     - Payments count: ${foundItem.payments?.length || 0}`);
  if (foundItem.payments && foundItem.payments.length > 0) {
    console.log(`     - Latest Payment Ref: ${foundItem.payments[0].paymentReference}`);
    console.log(`     - Proof Document: ${foundItem.payments[0].proofDocumentName || foundItem.payments[0].proofStorageKey}`);
  }

  // Step 6: Test Platform Admin Queue Search
  console.log(`\n[Step 6] Testing Platform Admin Queue Search by Name: ?search=${orgName.slice(0, 15)}...`);
  const searchRes = await request(app)
    .get(`/api/v1/subscriptions/platform-admin/queue?search=${encodeURIComponent(orgName.slice(0, 15))}`)
    .set('Authorization', `Bearer ${platformAdminToken}`);

  console.log(`  -> Search API HTTP ${searchRes.status}, returned ${searchRes.body.data?.length} records`);
  const searchMatched = (searchRes.body.data || []).some((item) => item.id === subscriptionId);
  if (!searchMatched) {
    throw new Error(`Search failed to find subscription ${subscriptionId} with term "${orgName.slice(0, 15)}"`);
  }
  console.log(`  -> Search successfully returned the target booking.`);

  // Step 7: Test Platform Admin Queue Status Filter
  console.log(`\n[Step 7] Testing Platform Admin Queue Status Filter: ?status=PENDING_VERIFICATION...`);
  const filterRes = await request(app)
    .get('/api/v1/subscriptions/platform-admin/queue?status=PENDING_VERIFICATION')
    .set('Authorization', `Bearer ${platformAdminToken}`);

  console.log(`  -> Filter API HTTP ${filterRes.status}, returned ${filterRes.body.data?.length} records`);
  const filterMatched = (filterRes.body.data || []).some((item) => item.id === subscriptionId);
  if (!filterMatched) {
    throw new Error(`Status filter failed to include subscription ${subscriptionId}`);
  }
  console.log(`  -> Status filter PENDING_VERIFICATION successfully includes the booking.`);

  // Step 8: Platform Admin Approves the Booking & Provisions Tenant
  console.log(`\n[Step 8] Platform Admin Approves Booking ${subscriptionId} and payment ${paymentId}...`);
  const approveRes = await request(app)
    .post(`/api/v1/subscriptions/platform-admin/${subscriptionId}/verify`)
    .set('Authorization', `Bearer ${platformAdminToken}`)
    .send({
      decision: 'APPROVE',
      paymentId,
      notes: `Verified RTGS wire remittance ref ${paymentRef} against corporate treasury statement.`
    });

  console.log(`  -> Approval API HTTP ${approveRes.status}`);
  if (approveRes.status !== 200) {
    throw new Error(`Approval failed: ${JSON.stringify(approveRes.body)}`);
  }
  const approvedData = approveRes.body.data;
  console.log(`  -> Provisioning completed successfully!`);
  console.log(`     - Provisioned Organisation ID: ${approvedData.subscription?.organisationId}`);
  console.log(`     - Subscription Status: ${approvedData.subscription?.status}`);
  console.log(`     - Activation Token Generated: ${approvedData.invitationPreview ? 'YES' : 'NO'}`);
  console.log(`     - Invitation Expiry: ${approvedData.invitationPreview?.expiresAt}`);

  // Step 9: Verify Idempotency - Repeated Approval Rejection
  console.log(`\n[Step 9] Verifying Idempotency: Attempting second approval on subscription ${subscriptionId}...`);
  const repeatApproveRes = await request(app)
    .post(`/api/v1/subscriptions/platform-admin/${subscriptionId}/verify`)
    .set('Authorization', `Bearer ${platformAdminToken}`)
    .send({
      decision: 'APPROVE',
      paymentId
    });

  console.log(`  -> Repeat approval returned HTTP ${repeatApproveRes.status} (Expected 409 Conflict).`);
  if (repeatApproveRes.status !== 409) {
    throw new Error(`Expected HTTP 409 on repeat approval, got ${repeatApproveRes.status}`);
  }
  console.log(`  -> Duplicate tenant provisioning successfully prevented!`);

  // Step 10: Free Trial Registration Regression Test
  console.log(`\n[Step 10] Testing Free Trial Registration Regression...`);
  const trialOrgName = `Trial Tech Corp ${runId}`;
  const trialRes = await request(app)
    .post('/api/v1/subscriptions/trial')
    .send({
      organisationName: trialOrgName,
      organisationDomain: `trialtech-${runId}.com`,
      industry: 'Software',
      companySize: '1-10',
      adminName: 'Trial User',
      adminEmail: `trial-${runId}@example.com`
    });

  console.log(`  -> Free Trial Registration HTTP ${trialRes.status}`);
  if (trialRes.status !== 201) {
    throw new Error(`Trial registration failed: ${JSON.stringify(trialRes.body)}`);
  }
  console.log(`  -> Free trial created successfully with Status: ${trialRes.body.data?.subscription?.status}`);
  console.log(`  -> Provisioned Trial Org ID: ${trialRes.body.data?.subscription?.organisationId}`);

  // Step 11: Verify Alpha Apex Tech Data Integrity
  console.log(`\n[Step 11] Checking Existing Customer Record (Alpha Apex Tech)...`);
  const { Subscription } = getModels();
  const alphaApex = await Subscription.findOne({
    where: { organisationName: 'Alpha Apex Tech' }
  });
  if (!alphaApex) {
    throw new Error('CRITICAL ERROR: Alpha Apex Tech subscription record is missing!');
  }
  console.log(`  -> Alpha Apex Tech is intact:`);
  console.log(`     - ID: ${alphaApex.id}`);
  console.log(`     - Status: ${alphaApex.status}`);
  console.log(`     - Admin Email: ${alphaApex.adminEmail}`);
  console.log(`     - Organisation ID: ${alphaApex.organisationId}`);

  console.log('\n========================================================================');
  console.log(' ALL 11 VERIFICATION STEPS COMPLETED WITH 100% SUCCESS!');
  console.log('========================================================================\n');
  process.exit(0);
}

runBookingQueueVerification().catch((err) => {
  console.error('\n[FATAL ERROR IN QUEUE VERIFICATION]:', err);
  process.exit(1);
});
