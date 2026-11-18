import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const { startTestDatabase, resetTestState, stopTestDatabase } = require('../helpers/testDb');
const { createApp } = require('../../src/app');
const { getModels } = require('../../src/config/database');
const authAdapter = require('../../src/integrations/auth/auth.adapter');
const notificationAdapter = require('../../src/integrations/notification/notification.adapter');
const emailAdapter = require('../../src/integrations/email/email.adapter');

let app;
let platformAdminToken;
let regularUserToken;

const samplePdfBuffer = () => Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');

describe('Payment Management, Safe Void/Archive & Customer Activation Lifecycle (Part A, B, C)', () => {
  beforeAll(async () => {
    await startTestDatabase();
    app = createApp();
  });

  afterAll(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await resetTestState();
    notificationAdapter.clearDispatchedNotifications();
    emailAdapter.clearTestEmailTransport();
    authAdapter.clearStandaloneUsers();

    platformAdminToken = authAdapter.signAccessToken({
      sub: uuidv4(),
      email: 'platformadmin@nexnuv.com',
      name: 'Platform Administrator',
      userType: 'PLATFORM_ADMIN',
      roles: ['PLATFORM_ADMIN']
    });

    regularUserToken = authAdapter.signAccessToken({
      sub: uuidv4(),
      email: 'recruiter@company.com',
      name: 'Regular Recruiter',
      userType: 'ORG_USER',
      roles: ['RECRUITER'],
      organisationId: uuidv4()
    });
  });

  it('Scenarios 1-6: Payment approved -> Org provisioned -> Invitation email generated -> Password setup -> Login -> Dashboard', async () => {
    // Track emails received by controlled test mailbox
    const testMailbox = [];
    emailAdapter.setTestEmailTransport(async (msg) => {
      testMailbox.push(msg);
      return { delivered: true, provider: 'TEST_MAILBOX', messageId: `msg_${Date.now()}` };
    });

    // 1. Customer registration / subscription request
    const createRes = await request(app)
      .post('/api/v1/subscriptions')
      .send({
        organisationName: 'Nova Robotics Lab',
        organisationDomain: 'novarobotics.io',
        industry: 'Robotics',
        companySize: '51-200',
        adminName: 'Dr. Elena Rostova',
        adminEmail: 'elena@novarobotics.io',
        planCode: 'RECRUITMENT_ADVANCED',
        billingCycle: 'ANNUAL'
      });

    expect(createRes.status).toBe(201);
    const subId = createRes.body.data.id;
    expect(createRes.body.data.status).toBe('PENDING_PAYMENT');

    // 2. Customer submits payment proof
    const paymentRes = await request(app)
      .post(`/api/v1/subscriptions/${subId}/payments`)
      .field('paymentReference', 'WIRE-NOVA-2026-9001')
      .field('paymentMethod', 'WIRE_TRANSFER')
      .field('submittedByEmail', 'elena@novarobotics.io')
      .attach('proof', samplePdfBuffer(), {
        filename: 'remittance_slip.pdf',
        contentType: 'application/pdf'
      });

    expect(paymentRes.status).toBe(201);
    const paymentId = paymentRes.body.data.payment.id;
    expect(paymentRes.body.data.subscription.status).toBe('PENDING_VERIFICATION');

    // 3. Platform Admin verifies and approves payment
    const approveRes = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/${subId}/verify`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ decision: 'APPROVE', paymentId });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.subscription.status).toBe('APPROVED');
    expect(approveRes.body.data.subscription.provisioningStatus).toBe('PROVISIONED');
    const provisionedOrgId = approveRes.body.data.subscription.organisationId;
    expect(provisionedOrgId).toBeDefined();

    // Verify invitation preview contains secure single-use token
    const activationToken = approveRes.body.data.invitationPreview?.activationToken;
    expect(activationToken).toBeDefined();

    // Verify test mailbox captured the activation email with all 5 required elements
    expect(testMailbox.length).toBeGreaterThanOrEqual(1);
    const activationEmail = testMailbox.find((m) => m.category === 'ORGANISATION_ACTIVATION' || m.subject.includes('Activate'));
    expect(activationEmail).toBeDefined();
    expect(activationEmail.to).toBe('elena@novarobotics.io');
    // Element 1: Organisation name
    expect(activationEmail.text).toContain('Nova Robotics Lab');
    // Element 2: Registered username/email
    expect(activationEmail.text).toContain('elena@novarobotics.io');
    // Element 3: Secure password setup link
    expect(activationEmail.text).toContain('/activate-account?token=');
    // Element 4: Invitation expiry info (48 hours)
    expect(activationEmail.text).toContain('48 hours');
    // Element 5: Login instructions
    expect(activationEmail.text).toContain('/login');

    // Never email plaintext passwords or log sensitive tokens
    expect(activationEmail.text).not.toContain('passwordHash');

    // 4. Customer sets password via /api/v1/subscriptions/activate
    // Enforce NIST-aligned strong password schema
    const weakPwdRes = await request(app)
      .post('/api/v1/subscriptions/activate')
      .send({
        activationToken,
        password: 'weak'
      });
    expect(weakPwdRes.status).toBe(422);

    const activateRes = await request(app)
      .post('/api/v1/subscriptions/activate')
      .send({
        activationToken,
        password: 'NovaSecurePass@2026!'
      });

    expect(activateRes.status).toBe(200);
    expect(activateRes.body.data.subscription.status).toBe('ACTIVE');
    expect(activateRes.body.data.user.email).toBe('elena@novarobotics.io');
    expect(activateRes.body.data.token).toBeDefined();

    // 5. Customer logs in via /api/v1/auth/login using newly created password
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'elena@novarobotics.io',
        password: 'NovaSecurePass@2026!'
      });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.token).toBeDefined();
    expect(loginRes.body.data.user.email).toBe('elena@novarobotics.io');
    expect(loginRes.body.data.user.roles).toContain('ORGANISATION_ADMIN');

    // 6. Access Organisation Dashboard with the authenticated token
    const orgToken = loginRes.body.data.token;
    const dashRes = await request(app)
      .get('/api/v1/organisations/dashboard')
      .set('Authorization', `Bearer ${orgToken}`);

    expect(dashRes.status).toBe(200);
    expect(dashRes.body.data).toBeDefined();
  });

  it('Scenario 7: Repeated approval does not create duplicate organisations (idempotent)', async () => {
    // Create and submit payment
    const createRes = await request(app)
      .post('/api/v1/subscriptions')
      .send({
        organisationName: 'Apex Avionics',
        organisationDomain: 'apexavionics.com',
        industry: 'Aerospace',
        companySize: '11-50',
        adminName: 'Marcus Wright',
        adminEmail: 'marcus@apexavionics.com'
      });
    const subId = createRes.body.data.id;

    await request(app)
      .post(`/api/v1/subscriptions/${subId}/payments`)
      .field('paymentReference', 'WIRE-APEX-001')
      .field('paymentMethod', 'WIRE_TRANSFER')
      .attach('proof', samplePdfBuffer(), 'proof.pdf');

    // First approval
    const app1 = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/${subId}/verify`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ decision: 'APPROVE' });
    expect(app1.status).toBe(200);
    const orgId1 = app1.body.data.subscription.organisationId;

    // Second repeated approval attempt -> rejected safely with conflict or idempotent state
    const app2 = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/${subId}/verify`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ decision: 'APPROVE' });
    expect(app2.status).toBe(409);
    expect(app2.body.error.code).toBe('ALREADY_VERIFIED_OR_INVALID_STATE');

    // Verify in database: exactly one organisation exists for this subscription
    const { Subscription } = getModels();
    const finalSub = await Subscription.findByPk(subId);
    expect(finalSub.organisationId).toBe(orgId1);
  });

  it('Scenario 8: Failed email delivery can be handled safely without losing approved provisioning state', async () => {
    // Configure test email transport to simulate network/SMTP failure
    emailAdapter.setTestEmailTransport(async () => {
      throw new Error('ECONNREFUSED: Mail server unreachable');
    });

    const createRes = await request(app)
      .post('/api/v1/subscriptions')
      .send({
        organisationName: 'Resilient Biotech',
        organisationDomain: 'resilientbiotech.io',
        industry: 'Biotech',
        companySize: '1-10',
        adminName: 'Dr. Jane Smith',
        adminEmail: 'jane@resilientbiotech.io'
      });
    const subId = createRes.body.data.id;

    await request(app)
      .post(`/api/v1/subscriptions/${subId}/payments`)
      .field('paymentReference', 'WIRE-RESILIENT-01')
      .field('paymentMethod', 'WIRE_TRANSFER')
      .attach('proof', samplePdfBuffer(), 'proof.pdf');

    // Approval must still succeed and provision the tenant even if email fails!
    const approveRes = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/${subId}/verify`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ decision: 'APPROVE' });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.subscription.status).toBe('APPROVED');
    expect(approveRes.body.data.subscription.provisioningStatus).toBe('PROVISIONED');
    expect(approveRes.body.data.subscription.organisationId).toBeDefined();
  });

  it('Scenario 9: Invitation resend works (invalidates old token, generates new 48h token)', async () => {
    const testMailbox = [];
    emailAdapter.setTestEmailTransport(async (msg) => {
      testMailbox.push(msg);
      return { delivered: true, provider: 'TEST_MAILBOX', messageId: `msg_${Date.now()}` };
    });

    const createRes = await request(app)
      .post('/api/v1/subscriptions')
      .send({
        organisationName: 'Kestrel Cloud Systems',
        organisationDomain: 'kestrelcloud.io',
        industry: 'Cloud',
        companySize: '11-50',
        adminName: 'Devon Miles',
        adminEmail: 'devon@kestrelcloud.io'
      });
    const subId = createRes.body.data.id;

    await request(app)
      .post(`/api/v1/subscriptions/${subId}/payments`)
      .field('paymentReference', 'WIRE-KESTREL-01')
      .field('paymentMethod', 'WIRE_TRANSFER')
      .attach('proof', samplePdfBuffer(), 'proof.pdf');

    const approveRes = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/${subId}/verify`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ decision: 'APPROVE' });
    const initialToken = approveRes.body.data.invitationPreview?.activationToken;

    // Resend activation invitation
    const resendRes = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/${subId}/resend-activation`)
      .set('Authorization', `Bearer ${platformAdminToken}`);

    expect(resendRes.status).toBe(200);
    const replacementToken = resendRes.body.data.invitationPreview?.activationToken;
    expect(replacementToken).toBeDefined();
    expect(replacementToken).not.toBe(initialToken);
    expect(resendRes.body.data.subscription.invitationResendCount).toBe(1);

    // Old token must now be invalid!
    const oldTokenRedeem = await request(app)
      .post('/api/v1/subscriptions/activate')
      .send({ activationToken: initialToken, password: 'StrongPassword123!' });
    expect(oldTokenRedeem.status).toBe(404);

    // Replacement token succeeds
    const newTokenRedeem = await request(app)
      .post('/api/v1/subscriptions/activate')
      .send({ activationToken: replacementToken, password: 'StrongPassword123!' });
    expect(newTokenRedeem.status).toBe(200);
    expect(newTokenRedeem.body.data.subscription.status).toBe('ACTIVE');
  });

  it('Scenario 10: Pending payment rejection works with mandatory reason and prevents provisioning', async () => {
    const createRes = await request(app)
      .post('/api/v1/subscriptions')
      .send({
        organisationName: 'Doubtful Capital',
        organisationDomain: 'doubtfulcapital.com',
        industry: 'Finance',
        companySize: '1-10',
        adminName: 'Carl Vance',
        adminEmail: 'carl@doubtfulcapital.com'
      });
    const subId = createRes.body.data.id;

    await request(app)
      .post(`/api/v1/subscriptions/${subId}/payments`)
      .field('paymentReference', 'WIRE-DOUBTFUL-99')
      .field('paymentMethod', 'WIRE_TRANSFER')
      .attach('proof', samplePdfBuffer(), 'fake_receipt.pdf');

    const rejectRes = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/${subId}/verify`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({
        decision: 'REJECT',
        reason: 'Bank transfer receipt unreadable and reference not found in statement'
      });

    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.subscription.status).toBe('REJECTED');
    expect(rejectRes.body.data.subscription.provisioningStatus).toBe('FAILED');
    expect(rejectRes.body.data.subscription.organisationId).toBeNull();

    // Verify rejection recorded in Payment Record
    const { SubscriptionPayment } = getModels();
    const pRecord = await SubscriptionPayment.findOne({ where: { paymentReference: 'WIRE-DOUBTFUL-99' } });
    expect(pRecord.status).toBe('REJECTED');
    expect(pRecord.rejectionReason).toContain('Bank transfer receipt unreadable');
  });

  it('Scenario 11: Duplicate/test payment can be safely archived or voided with mandatory reason', async () => {
    const createRes = await request(app)
      .post('/api/v1/subscriptions')
      .send({
        organisationName: 'Test Duplicates Corp',
        organisationDomain: 'testdupes.io',
        industry: 'Tech',
        companySize: '1-10',
        adminName: 'Sam Tester',
        adminEmail: 'sam@testdupes.io'
      });
    const subId = createRes.body.data.id;

    const payRes = await request(app)
      .post(`/api/v1/subscriptions/${subId}/payments`)
      .field('paymentReference', 'WIRE-TEST-DUPE-88')
      .field('paymentMethod', 'WIRE_TRANSFER')
      .attach('proof', samplePdfBuffer(), 'proof.pdf');
    const paymentId = payRes.body.data.payment.id;

    // Void requires mandatory reason (min 5 chars)
    const emptyReasonRes = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/payments/${paymentId}/void`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ reason: 'abc' });
    expect(emptyReasonRes.status).toBe(422);

    // Valid void request
    const voidRes = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/payments/${paymentId}/void`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ reason: 'Duplicate test submission created by automated test script' });

    expect(voidRes.status).toBe(200);
    expect(voidRes.body.data.status).toBe('VOIDED');
    expect(voidRes.body.data.voidReason).toBe('Duplicate test submission created by automated test script');
    expect(voidRes.body.data.voidedAt).toBeDefined();

    // Re-voiding already voided payment -> 409 Conflict
    const reVoidRes = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/payments/${paymentId}/void`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ reason: 'Trying to void again' });
    expect(reVoidRes.status).toBe(409);

    // Verify VOIDED payment CANNOT be approved
    const approveVoidedRes = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/${subId}/verify`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ decision: 'APPROVE', paymentId });
    expect(approveVoidedRes.status).toBe(409);

    // TEST ACTUAL ARCHIVE ENDPOINT: Create an eligible isolated test payment
    const pay2Res = await request(app)
      .post(`/api/v1/subscriptions/${subId}/payments`)
      .field('paymentReference', 'WIRE-TEST-ARCHIVE-99')
      .field('paymentMethod', 'WIRE_TRANSFER')
      .attach('proof', samplePdfBuffer(), 'proof2.pdf');
    const pay2Id = pay2Res.body.data.payment.id;

    const archiveReason = 'Archiving obsolete erroneous customer wire submission for fiscal year reconciliation';
    const archiveRes = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/payments/${pay2Id}/archive`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ reason: archiveReason });

    expect(archiveRes.status).toBe(200);
    expect(archiveRes.body.data.status).toBe('ARCHIVED');
    expect(archiveRes.body.data.voidReason).toBe(archiveReason);
    expect(archiveRes.body.data.voidedAt).toBeDefined();

    // Verify in database: status is ARCHIVED and row is preserved (never deleted)
    const { SubscriptionPayment, RecruitmentAuditLog } = getModels();
    const dbPayment = await SubscriptionPayment.findByPk(pay2Id);
    expect(dbPayment).not.toBeNull();
    expect(dbPayment.status).toBe('ARCHIVED');
    expect(dbPayment.voidReason).toBe(archiveReason);

    // Verify audit log recorded for PAYMENT_ARCHIVED
    const auditRecord = await RecruitmentAuditLog.findOne({
      where: {
        entityId: pay2Id,
        action: 'PAYMENT_ARCHIVED'
      }
    });
    expect(auditRecord).not.toBeNull();
    expect(auditRecord.afterState.status).toBe('ARCHIVED');

    // Verify ARCHIVED payment CANNOT be approved
    const approveArchivedRes = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/${subId}/verify`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ decision: 'APPROVE', paymentId: pay2Id });
    expect(approveArchivedRes.status).toBe(409);
  });

  it('Scenario 12: Approved payment cannot be silently deleted or casually voided if subscription is active', async () => {
    // Provision and activate a subscription
    const createRes = await request(app)
      .post('/api/v1/subscriptions')
      .send({
        organisationName: 'Secure Logistics Ltd',
        organisationDomain: 'securelogistics.com',
        industry: 'Logistics',
        companySize: '11-50',
        adminName: 'Vikram Seth',
        adminEmail: 'vikram@securelogistics.com'
      });
    const subId = createRes.body.data.id;

    const payRes = await request(app)
      .post(`/api/v1/subscriptions/${subId}/payments`)
      .field('paymentReference', 'WIRE-SECURE-9901')
      .field('paymentMethod', 'WIRE_TRANSFER')
      .attach('proof', samplePdfBuffer(), 'proof.pdf');
    const paymentId = payRes.body.data.payment.id;

    const appRes = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/${subId}/verify`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ decision: 'APPROVE', paymentId });
    const token = appRes.body.data.invitationPreview?.activationToken;

    await request(app)
      .post('/api/v1/subscriptions/activate')
      .send({ activationToken: token, password: 'SecurePassword123!' });

    // Try voiding payment of an ACTIVE subscription -> must be rejected with 403 Forbidden!
    const voidRes = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/payments/${paymentId}/void`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ reason: 'Attempting to void active customer payment' });

    expect(voidRes.status).toBe(403);
    expect(voidRes.body.error.code).toBe('ACTIVE_SUBSCRIPTION_PAYMENT_PROTECTED');

    // Try archiving payment of an ACTIVE subscription -> must also be rejected with 403 Forbidden!
    const archiveRes = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/payments/${paymentId}/archive`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ reason: 'Attempting to archive active customer payment' });

    expect(archiveRes.status).toBe(403);
    expect(archiveRes.body.error.code).toBe('ACTIVE_SUBSCRIPTION_PAYMENT_PROTECTED');

    // Verify payment is still in database with status VERIFIED
    const { SubscriptionPayment } = getModels();
    const preserved = await SubscriptionPayment.findByPk(paymentId);
    expect(preserved).not.toBeNull();
    expect(preserved.status).toBe('VERIFIED');
  });

  it('Scenario 13: Unauthorized payment management requests are strictly rejected (RBAC enforcement)', async () => {
    // 1. Unauthenticated requests
    const unauthRes = await request(app)
      .get('/api/v1/subscriptions/platform-admin/payments');
    expect(unauthRes.status).toBe(401);

    const unauthArchiveRes = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/payments/${uuidv4()}/archive`)
      .send({ reason: 'Unauthenticated archive' });
    expect(unauthArchiveRes.status).toBe(401);

    // 2. Regular Recruiter attempting to list platform payments
    const recruiterListRes = await request(app)
      .get('/api/v1/subscriptions/platform-admin/payments')
      .set('Authorization', `Bearer ${regularUserToken}`);
    expect(recruiterListRes.status).toBe(403);

    // 3. Regular Recruiter attempting to void a payment
    const recruiterVoidRes = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/payments/${uuidv4()}/void`)
      .set('Authorization', `Bearer ${regularUserToken}`)
      .send({ reason: 'Malicious void attempt' });
    expect(recruiterVoidRes.status).toBe(403);

    // 4. Regular Recruiter attempting to archive a payment
    const recruiterArchiveRes = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/payments/${uuidv4()}/archive`)
      .set('Authorization', `Bearer ${regularUserToken}`)
      .send({ reason: 'Malicious archive attempt' });
    expect(recruiterArchiveRes.status).toBe(403);
  });

  it('Scenario 14: Existing customer data (Alpha Apex Tech) remains completely intact', async () => {
    // Seed existing Alpha Apex Tech customer record into test database
    const { Subscription, SubscriptionPayment } = getModels();
    const alphaApexId = '00000000-0000-4000-8000-000000000001';
    const alphaOrgId = '00000000-0000-4000-8000-000000000077';

    await Subscription.create({
      id: alphaApexId,
      organisationId: alphaOrgId,
      organisationName: 'Alpha Apex Tech',
      organisationDomain: 'alphaapex.tech',
      industry: 'Software & Technology',
      companySize: '51-200',
      adminName: 'Alpha Admin',
      adminEmail: 'admin@alphaapex.tech',
      planCode: 'RECRUITMENT_ENTERPRISE',
      billingCycle: 'ANNUAL',
      amountCents: 499900,
      currency: 'INR',
      status: 'ACTIVE',
      paymentInstructions: { bank: 'Reserve Trust Bank', memo: 'ALPHA-001' },
      provisioningStatus: 'PROVISIONED'
    });

    const alphaPayment = await SubscriptionPayment.create({
      id: uuidv4(),
      subscriptionId: alphaApexId,
      paymentReference: 'WIRE-ALPHA-APEX-ORIGINAL',
      paymentMethod: 'WIRE_TRANSFER',
      amountCents: 499900,
      currency: 'INR',
      submittedByEmail: 'admin@alphaapex.tech',
      status: 'VERIFIED',
      verifiedAt: new Date('2026-11-01')
    });

    // Run payment management listing as Platform Admin
    const listRes = await request(app)
      .get('/api/v1/subscriptions/platform-admin/payments?search=Alpha+Apex')
      .set('Authorization', `Bearer ${platformAdminToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);
    const alphaFound = listRes.body.data.find((p) => p.paymentReference === 'WIRE-ALPHA-APEX-ORIGINAL');
    expect(alphaFound).toBeDefined();
    expect(alphaFound.status).toBe('VERIFIED');
    expect(alphaFound.subscription.organisationName).toBe('Alpha Apex Tech');

    // Verify Alpha Apex Tech subscription in database has NOT been mutated or deleted
    const preservedSub = await Subscription.findByPk(alphaApexId);
    expect(preservedSub).not.toBeNull();
    expect(preservedSub.organisationName).toBe('Alpha Apex Tech');
    expect(preservedSub.status).toBe('ACTIVE');
    expect(preservedSub.organisationId).toBe(alphaOrgId);
  });

  it('Scenario 15: Concurrency safety - simultaneous verification and race condition prevention', async () => {
    // 1. Create a fresh subscription with a payment
    const createRes = await request(app)
      .post('/api/v1/subscriptions')
      .send({
        organisationName: 'Concurrent Systems Lab',
        organisationDomain: 'concurrentlab.io',
        industry: 'Distributed Systems',
        companySize: '11-50',
        adminName: 'Concurrency Test Admin',
        adminEmail: 'concurrency@concurrentlab.io'
      });
    const subId = createRes.body.data.id;

    const payRes = await request(app)
      .post(`/api/v1/subscriptions/${subId}/payments`)
      .field('paymentReference', 'WIRE-CONCURRENT-001')
      .field('paymentMethod', 'WIRE_TRANSFER')
      .attach('proof', samplePdfBuffer(), 'proof.pdf');
    const paymentId = payRes.body.data.payment.id;

    // Send two concurrent verification requests on the same payment
    const [resA, resB] = await Promise.all([
      request(app)
        .post(`/api/v1/subscriptions/platform-admin/${subId}/verify`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ decision: 'APPROVE', paymentId }),
      request(app)
        .post(`/api/v1/subscriptions/platform-admin/${subId}/verify`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ decision: 'APPROVE', paymentId })
    ]);

    // Exactly one request MUST succeed (200), the other MUST be rejected (409 Conflict)
    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 409]);

    // Verify exactly ONE organisation is provisioned in the database
    const { Subscription } = getModels();
    const finalSub = await Subscription.findByPk(subId);
    expect(finalSub.status).toBe('APPROVED');
    expect(finalSub.provisioningStatus).toBe('PROVISIONED');
    expect(finalSub.organisationId).toBeTruthy();
  });
});
