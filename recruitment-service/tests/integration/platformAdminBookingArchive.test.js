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
let platformAdminActorId;
let regularUserToken;

describe('Platform Admin Individual Booking History Removal & Archive Suite', () => {
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

    platformAdminActorId = uuidv4();
    platformAdminToken = authAdapter.signAccessToken({
      sub: platformAdminActorId,
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

  it('Requirement 1 & 2: Archives a specific pending booking and removes it from active history', async () => {
    // 1. Create two test bookings
    const sub1Res = await request(app)
      .post('/api/v1/subscriptions')
      .send({
        organisationName: 'Archive Test Alpha',
        organisationDomain: 'alpha-archive.test',
        industry: 'Technology',
        companySize: '11-50',
        adminName: 'Alpha Admin',
        adminEmail: 'admin@alpha-archive.test',
        planCode: 'ADVANCED',
        billingCycle: 'MONTHLY'
      });
    expect(sub1Res.status).toBe(201);
    const sub1Id = sub1Res.body.data.id;

    const sub2Res = await request(app)
      .post('/api/v1/subscriptions')
      .send({
        organisationName: 'Keep Active Beta',
        organisationDomain: 'beta-keep.test',
        industry: 'Technology',
        companySize: '11-50',
        adminName: 'Beta Admin',
        adminEmail: 'admin@beta-keep.test',
        planCode: 'ADVANCED',
        billingCycle: 'MONTHLY'
      });
    expect(sub2Res.status).toBe(201);
    const sub2Id = sub2Res.body.data.id;

    // Both should be in active queue
    const queueBefore = await request(app)
      .get('/api/v1/subscriptions/platform-admin/queue')
      .set('Authorization', `Bearer ${platformAdminToken}`);
    expect(queueBefore.status).toBe(200);
    const beforeIds = queueBefore.body.data.map((item) => item.id);
    expect(beforeIds).toContain(sub1Id);
    expect(beforeIds).toContain(sub2Id);

    // 2. Archive sub1 individually
    const archiveReason = 'Customer requested cancellation prior to wire transfer';
    const archiveRes = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/${sub1Id}/archive`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ reason: archiveReason });

    expect(archiveRes.status).toBe(200);
    expect(archiveRes.body.success).toBe(true);
    expect(archiveRes.body.data.isArchived).toBe(true);
    expect(archiveRes.body.data.archiveReason).toBe(archiveReason);
    expect(archiveRes.body.data.archivedBy).toBe(platformAdminActorId);
    expect(archiveRes.body.data.archivedAt).toBeTruthy();

    // 3. Verify only sub1 disappears from active queue
    const queueActive = await request(app)
      .get('/api/v1/subscriptions/platform-admin/queue')
      .set('Authorization', `Bearer ${platformAdminToken}`);
    expect(queueActive.status).toBe(200);
    const activeIds = queueActive.body.data.map((item) => item.id);
    expect(activeIds).not.toContain(sub1Id);
    expect(activeIds).toContain(sub2Id); // sub2 remains untouched!

    // 4. Verify sub1 appears in archived history
    const queueArchived = await request(app)
      .get('/api/v1/subscriptions/platform-admin/queue?archived=true')
      .set('Authorization', `Bearer ${platformAdminToken}`);
    expect(queueArchived.status).toBe(200);
    const archivedIds = queueArchived.body.data.map((item) => item.id);
    expect(archivedIds).toContain(sub1Id);
    expect(archivedIds).not.toContain(sub2Id);

    const archivedItem = queueArchived.body.data.find((item) => item.id === sub1Id);
    expect(archivedItem.isArchived).toBe(true);
    expect(archivedItem.archiveReason).toBe(archiveReason);
    expect(archivedItem.archivedBy).toBe(platformAdminActorId);
  });

  it('Requirement 3 & 6: Repeated archive request is handled safely and idempotently', async () => {
    const subRes = await request(app)
      .post('/api/v1/subscriptions')
      .send({
        organisationName: 'Idempotency Corp',
        organisationDomain: 'idempotent.test',
        industry: 'FinTech',
        companySize: '51-200',
        adminName: 'Idem Admin',
        adminEmail: 'admin@idempotent.test',
        planCode: 'ADVANCED',
        billingCycle: 'ANNUAL'
      });
    const subId = subRes.body.data.id;

    // First archive
    const firstRes = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/${subId}/archive`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ reason: 'Initial archive request' });
    expect(firstRes.status).toBe(200);
    expect(firstRes.body.data.isArchived).toBe(true);

    // Second archive (idempotent replay)
    const secondRes = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/${subId}/archive`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ reason: 'Attempt duplicate archival' });
    expect(secondRes.status).toBe(200);
    expect(secondRes.body.success).toBe(true);
    expect(secondRes.body.message).toContain('idempotent');
    expect(secondRes.body.data.isArchived).toBe(true);
  });

  it('Requirement 7: Rejects unauthorized requests from non-Platform Admins and unauthenticated callers', async () => {
    const subRes = await request(app)
      .post('/api/v1/subscriptions')
      .send({
        organisationName: 'Security Test Org',
        organisationDomain: 'security.test',
        industry: 'Cybersecurity',
        companySize: '1-10',
        adminName: 'Sec Admin',
        adminEmail: 'admin@security.test',
        planCode: 'BASIC',
        billingCycle: 'MONTHLY'
      });
    const subId = subRes.body.data.id;

    // Unauthenticated (no token) -> 401
    const unauthRes = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/${subId}/archive`)
      .send({ reason: 'Unauthorized attempt without token' });
    expect(unauthRes.status).toBe(401);

    // Regular recruiter user -> 403 Forbidden
    const forbiddenRes = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/${subId}/archive`)
      .set('Authorization', `Bearer ${regularUserToken}`)
      .send({ reason: 'Recruiter attempting platform admin action' });
    expect(forbiddenRes.status).toBe(403);
  });

  it('Requirement 8 & 9: Mandates valid reason (minimum 5 chars) and validates booking UUID', async () => {
    const subRes = await request(app)
      .post('/api/v1/subscriptions')
      .send({
        organisationName: 'Validation Test Org',
        organisationDomain: 'validation.test',
        industry: 'Legal',
        companySize: '11-50',
        adminName: 'Val Admin',
        adminEmail: 'admin@validation.test',
        planCode: 'BASIC',
        billingCycle: 'MONTHLY'
      });
    const subId = subRes.body.data.id;

    // Reason too short (< 5 chars) -> 422
    const shortReasonRes = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/${subId}/archive`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ reason: 'bad' });
    expect(shortReasonRes.status).toBe(422);

    // Missing reason -> 422
    const missingReasonRes = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/${subId}/archive`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({});
    expect(missingReasonRes.status).toBe(422);

    // Invalid UUID -> 422
    const invalidUuidRes = await request(app)
      .post('/api/v1/subscriptions/platform-admin/not-a-valid-uuid/archive')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ reason: 'Valid reason but bad UUID' });
    expect(invalidUuidRes.status).toBe(422);
  });

  it('Financial Safeguards: Preserves payment records, payment proofs, and subscription status intact', async () => {
    // 1. Create subscription and attach payment proof
    const subRes = await request(app)
      .post('/api/v1/subscriptions')
      .send({
        organisationName: 'Financial Safeguard Ltd',
        organisationDomain: 'financial.test',
        industry: 'Banking',
        companySize: '500+',
        adminName: 'CFO Jordan',
        adminEmail: 'cfo@financial.test',
        planCode: 'ENTERPRISE',
        billingCycle: 'ANNUAL'
      });
    const subId = subRes.body.data.id;

    const paymentRes = await request(app)
      .post(`/api/v1/subscriptions/${subId}/payments`)
      .send({
        paymentReference: 'WIRE-FIN-SAFEGUARD-001',
        paymentMethod: 'WIRE_TRANSFER',
        notes: 'Verified wire transfer record'
      });
    expect(paymentRes.status).toBe(201);
    const paymentId = paymentRes.body.data.payment.id;

    // 2. Archive booking
    const archiveRes = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/${subId}/archive`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ reason: 'Hiding from active queue for financial reconciliation' });
    expect(archiveRes.status).toBe(200);

    // 3. Directly inspect database to confirm records are preserved
    const { Subscription, SubscriptionPayment, RecruitmentAuditLog } = getModels();
    const dbSub = await Subscription.findByPk(subId);
    expect(dbSub).toBeTruthy();
    expect(dbSub.isArchived).toBe(true);
    expect(dbSub.status).toBe('PENDING_VERIFICATION'); // Subscription status unchanged!

    const dbPayment = await SubscriptionPayment.findByPk(paymentId);
    expect(dbPayment).toBeTruthy();
    expect(dbPayment.paymentReference).toBe('WIRE-FIN-SAFEGUARD-001'); // Payment record preserved!
    expect(dbPayment.status).toBe('SUBMITTED');

    // 4. Verify immutable audit log recorded
    const auditLogs = await RecruitmentAuditLog.findAll({
      where: { entityType: 'SUBSCRIPTION', entityId: subId, action: 'SUBSCRIPTION_BOOKING_ARCHIVED' }
    });
    expect(auditLogs.length).toBeGreaterThanOrEqual(1);
    expect(auditLogs[0].actorRole).toBe('PLATFORM_ADMIN');
    expect(auditLogs[0].afterState.archiveReason).toBe('Hiding from active queue for financial reconciliation');
  });

  it('Active Subscriptions Safeguard: Archiving an active booking hides it from history but preserves customer access', async () => {
    // 1. Create trial subscription (active immediately)
    const trialRes = await request(app)
      .post('/api/v1/subscriptions/trial')
      .send({
        organisationName: 'Active Workspace Corp',
        organisationDomain: 'active-corp.test',
        adminName: 'Active Admin',
        adminEmail: 'admin@active-corp.test',
        password: 'StrongPassword#2026!'
      });
    expect(trialRes.status).toBe(201);
    const subId = trialRes.body.data.subscription.id;
    const orgToken = trialRes.body.data.token;

    // Verify customer can access current subscription
    const currentBefore = await request(app)
      .get('/api/v1/subscriptions/current')
      .set('Authorization', `Bearer ${orgToken}`);
    expect(currentBefore.status).toBe(200);
    expect(currentBefore.body.data.status).toBe('TRIAL');

    // Platform admin archives the booking from history
    const archiveRes = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/${subId}/archive`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ reason: 'Admin archiving old booking from queue history' });
    expect(archiveRes.status).toBe(200);

    // Verify customer STILL has full access to workspace!
    const currentAfter = await request(app)
      .get('/api/v1/subscriptions/current')
      .set('Authorization', `Bearer ${orgToken}`);
    expect(currentAfter.status).toBe(200);
    expect(currentAfter.body.data.status).toBe('TRIAL');
    expect(currentAfter.body.data.canAccess).toBe(true);
  });
});
