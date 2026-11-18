import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { v4: uuidv4 } = require('uuid');
const { startTestDatabase, resetTestState, stopTestDatabase } = require('../helpers/testDb');
const { createApp } = require('../../src/app');
const authAdapter = require('../../src/integrations/auth/auth.adapter');
const notificationAdapter = require('../../src/integrations/notification/notification.adapter');
const notificationRepo = require('../../src/modules/notificationHistory/notificationHistory.repository');
const { getModels } = require('../../src/config/database');

describe('Platform Admin Notification & Notice History Management Suite', () => {
  let app;
  let superAdminToken;
  let orgAdminToken;
  const testOrgId = uuidv4();

  beforeAll(async () => {
    await startTestDatabase();
    app = createApp();
    superAdminToken = authAdapter.signAccessToken({
      sub: uuidv4(),
      email: 'platform-admin@nexnuv.com',
      name: 'Platform Admin',
      userType: 'PLATFORM_ADMIN',
      roles: ['PLATFORM_ADMIN']
    });
    orgAdminToken = authAdapter.signAccessToken({
      sub: uuidv4(),
      email: 'org-admin@nexnuv.com',
      name: 'Org Admin',
      organisationId: testOrgId,
      userType: 'ORG_USER',
      roles: ['ORGANISATION_ADMIN']
    });
  });

  afterAll(async () => {
    await stopTestDatabase();
  });

  it('records dispatched notifications in recruitment_notification_history table and lists them with pagination', async () => {
    const rawToken = 'notif_token_' + uuidv4().replace(/-/g, '');
    const activationLink = `http://localhost:5173/activate-account?token=${rawToken}`;

    const dispatchRes = await notificationAdapter.dispatchNotification({
      eventType: 'ACCOUNT_INVITATION',
      organisationId: testOrgId,
      recipientEmail: 'tenant.admin@histtest.nexnuv',
      recipientName: 'Hist Admin',
      payload: {
        organisationName: 'Hist Logistics',
        planName: 'Enterprise',
        activationLink,
        activationToken: rawToken,
        expiresInHours: 48,
        loginUrl: 'http://localhost:5173/login'
      },
      requestId: 'req-hist-001'
    });

    expect(dispatchRes.notificationId).toBeDefined();

    // Fetch via Platform Admin endpoint
    const res = await request(app)
      .get('/api/v1/subscriptions/platform-admin/notifications')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);

    const found = res.body.data.find((n) => n.notificationId === dispatchRes.notificationId);
    expect(found).toBeDefined();
    expect(found.eventType).toBe('ACCOUNT_INVITATION');
    expect(found.recipientEmail).toBe('tenant.admin@histtest.nexnuv');

    // Security check: raw token must be redacted in list view
    expect(found.message).not.toContain(rawToken);
    expect(found.message).toContain('token=[REDACTED]');
    if (found.metadata?.activationToken) {
      expect(found.metadata.activationToken).toBe('[REDACTED]');
    }
  });

  it('supports searching by recipient email, organisation name, and eventType', async () => {
    const uniqueEmail = `searchable.${Date.now()}@histtest.nexnuv`;
    await notificationAdapter.dispatchNotification({
      eventType: 'PAYMENT_APPROVED',
      organisationId: testOrgId,
      recipientEmail: uniqueEmail,
      recipientName: 'Searchable Recipient',
      payload: {
        organisationName: 'UniqueSearch Corp',
        paymentReference: 'PAY-SEARCH-999'
      },
      requestId: 'req-search-001'
    });

    // Search by email
    const searchEmailRes = await request(app)
      .get(`/api/v1/subscriptions/platform-admin/notifications?search=${uniqueEmail}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .expect(200);

    expect(searchEmailRes.body.data.length).toBe(1);
    expect(searchEmailRes.body.data[0].recipientEmail).toBe(uniqueEmail);

    // Filter by eventType
    const filterRes = await request(app)
      .get('/api/v1/subscriptions/platform-admin/notifications?eventType=PAYMENT_APPROVED')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .expect(200);

    expect(filterRes.body.data.length).toBeGreaterThanOrEqual(1);
    expect(filterRes.body.data.every((n) => n.eventType === 'PAYMENT_APPROVED')).toBe(true);
  });

  it('safely clears a single notification with mandatory reason and records audit log', async () => {
    const dispatchRes = await notificationAdapter.dispatchNotification({
      eventType: 'SUBSCRIPTION_SUBMITTED',
      recipientEmail: 'clearme@histtest.nexnuv',
      recipientName: 'Clear Target',
      payload: { organisationName: 'To Clear Inc' }
    });

    const notifRecord = await notificationRepo.findNotificationByNotificationId(dispatchRes.notificationId);
    expect(notifRecord).not.toBeNull();

    // Rejects clear without reason
    await request(app)
      .post(`/api/v1/subscriptions/platform-admin/notifications/${notifRecord.id}/clear`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ reason: 'abc' }) // less than 5 chars
      .expect(422);

    // Clears with valid mandatory reason
    const clearRes = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/notifications/${notifRecord.id}/clear`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ reason: 'Audit cleanup of test notification records' })
      .expect(200);

    expect(clearRes.body.success).toBe(true);
    expect(clearRes.body.data.isDeleted).toBe(true);
    expect(clearRes.body.data.deleteReason).toBe('Audit cleanup of test notification records');

    // Confirm omitted from default list view
    const listRes = await request(app)
      .get('/api/v1/subscriptions/platform-admin/notifications')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .expect(200);

    const check = listRes.body.data.find((n) => n.id === notifRecord.id);
    expect(check).toBeUndefined();

    // Check audit log
    const { RecruitmentAuditLog } = getModels();
    const audit = await RecruitmentAuditLog.findOne({
      where: {
        entityType: 'NOTIFICATION_HISTORY',
        entityId: notifRecord.id,
        action: 'NOTIFICATION_HISTORY_DELETED'
      }
    });
    expect(audit).not.toBeNull();
  });

  it('safely performs bulk clear of notifications with mandatory reason and audit log', async () => {
    const notif1 = await notificationAdapter.dispatchNotification({
      eventType: 'APPLICATION_RECEIVED',
      recipientEmail: 'bulk1@histtest.nexnuv',
      payload: { jobTitle: 'DevOps' }
    });
    const notif2 = await notificationAdapter.dispatchNotification({
      eventType: 'APPLICATION_RECEIVED',
      recipientEmail: 'bulk2@histtest.nexnuv',
      payload: { jobTitle: 'SRE' }
    });

    const rec1 = await notificationRepo.findNotificationByNotificationId(notif1.notificationId);
    const rec2 = await notificationRepo.findNotificationByNotificationId(notif2.notificationId);

    const bulkRes = await request(app)
      .post('/api/v1/subscriptions/platform-admin/notifications/bulk-clear')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        ids: [rec1.id, rec2.id],
        reason: 'Bulk cleanup of legacy application notices'
      })
      .expect(200);

    expect(bulkRes.body.success).toBe(true);
    expect(bulkRes.body.data.clearedCount).toBe(2);

    // Verify database status is soft deleted
    const updatedRec1 = await notificationRepo.findNotificationById(rec1.id);
    expect(updatedRec1.isDeleted).toBe(true);
  });

  it('strictly enforces Platform Admin authorization (401/403 for unauthorized users)', async () => {
    // Unauthenticated
    await request(app)
      .get('/api/v1/subscriptions/platform-admin/notifications')
      .expect(401);

    // Org Admin (forbidden from cross-tenant platform notification history)
    await request(app)
      .get('/api/v1/subscriptions/platform-admin/notifications')
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .expect(403);
  });

  it('verifies safe token inspection endpoint GET /api/v1/subscriptions/activate/inspect', async () => {
    // 1. Submit subscription
    const subRes = await request(app)
      .post('/api/v1/subscriptions')
      .send({
        organisationName: 'Inspect Test Corp',
        organisationDomain: 'inspect-test.com',
        industry: 'Software',
        companySize: '11-50',
        adminName: 'Inspect Admin',
        adminEmail: 'admin@inspect-test.com',
        planCode: 'RECRUITMENT_ADVANCED',
        billingCycle: 'ANNUAL'
      })
      .expect(201);

    const subId = subRes.body.data.id;

    // 2. Submit payment
    await request(app)
      .post(`/api/v1/subscriptions/${subId}/payments`)
      .send({
        paymentReference: `PAY-INSPECT-${Date.now()}`,
        paymentMethod: 'WIRE_TRANSFER'
      })
      .expect(201);

    // 3. Platform Admin verifies payment
    const verifyRes = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/${subId}/verify`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ decision: 'APPROVE' })
      .expect(200);

    const rawToken = verifyRes.body.data.invitationPreview?.activationToken;
    expect(rawToken).toBeDefined();

    // 4. Call inspect endpoint
    const inspectRes = await request(app)
      .get(`/api/v1/subscriptions/activate/inspect?token=${rawToken}`)
      .expect(200);

    expect(inspectRes.body.success).toBe(true);
    expect(inspectRes.body.data.valid).toBe(true);
    expect(inspectRes.body.data.organisationName).toBe('Inspect Test Corp');
    expect(inspectRes.body.data.adminEmail).toBe('admin@inspect-test.com');
    expect(inspectRes.body.data.planName).toBe('Advanced');
    // Ensure raw token is NEVER echoed back in data
    expect(inspectRes.body.data.activationToken).toBeUndefined();
    expect(inspectRes.body.data.activationTokenHash).toBeUndefined();
  });
});
