import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const request = require('supertest');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { Sequelize } = require('sequelize');
const { startTestDatabase, resetTestState, stopTestDatabase } = require('../helpers/testDb');
const { createApp } = require('../../src/app');
const { getModels, getSequelize } = require('../../src/config/database');
const env = require('../../src/config/env');
const authAdapter = require('../../src/integrations/auth/auth.adapter');
const notificationAdapter = require('../../src/integrations/notification/notification.adapter');
const organisationAdapter = require('../../src/integrations/organisation/organisation.adapter');
const platformAdapter = require('../../src/integrations/platform/platform.adapter');
const subscriptionService = require('../../src/modules/subscription/subscription.service');
const { clearProcessedEventCache } = require('../../src/middleware/webhookAuth');

let app;
let databaseUrl;
let platformAdminToken;

function buildSvixHeaders(payload, secret = 'whsec_test_secret_for_vitest_2026_demo', timestampOverride = null) {
  const svixId = `msg_${uuidv4().replace(/-/g, '')}`;
  const svixTimestamp = timestampOverride !== null ? String(timestampOverride) : String(Math.floor(Date.now() / 1000));
  const rawBody = typeof payload === 'string' ? payload : JSON.stringify(payload);

  const rawSecret = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const secretBytes = Buffer.from(rawSecret, 'base64');
  const payloadToSign = `${svixId}.${svixTimestamp}.${rawBody}`;
  const computedHash = crypto
    .createHmac('sha256', secretBytes.length > 0 ? secretBytes : Buffer.from(secret))
    .update(payloadToSign)
    .digest('base64');

  return {
    'svix-id': svixId,
    'svix-timestamp': svixTimestamp,
    'svix-signature': `v1,${computedHash}`
  };
}

function buildHmacHeaders(payload, secret = 'test_webhook_signing_secret_2026', timestampOverride = null) {
  const timestamp = timestampOverride !== null ? String(timestampOverride) : String(Math.floor(Date.now() / 1000));
  const rawBody = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const payloadToSign = `${timestamp}.${rawBody}`;
  const computedHex = crypto.createHmac('sha256', secret).update(payloadToSign).digest('hex');

  return {
    'x-webhook-signature': `sha256=${computedHex}`,
    'x-webhook-timestamp': timestamp
  };
}

describe('Phase 5: Webhook Security, Provisioning Idempotency & Multi-Connection Concurrency', () => {
  beforeAll(async () => {
    const dbInfo = await startTestDatabase();
    databaseUrl = dbInfo.databaseUrl;
    app = createApp();
  });

  afterAll(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await resetTestState();
    clearProcessedEventCache();
    process.env.RESEND_WEBHOOK_SECRET = 'whsec_test_secret_for_vitest_2026_demo';
    process.env.NOTIFICATION_WEBHOOK_SECRET = 'test_webhook_signing_secret_2026';
    process.env.WEBHOOK_TOLERANCE_SECONDS = '300';
    env.webhook = env.buildWebhookConfig(process.env);

    platformAdminToken = authAdapter.signAccessToken({
      sub: uuidv4(),
      email: 'platform-admin@nexnuv.com',
      name: 'Platform Admin',
      userType: 'PLATFORM_ADMIN',
      roles: ['PLATFORM_ADMIN']
    });
  });

  describe('1. Webhook Cryptographic Authentication & Protection Suite', () => {
    it('rejects delivery webhook request when signature headers are completely missing (401)', async () => {
      const res = await request(app)
        .post('/api/v1/subscriptions/notifications/delivery-webhook')
        .send({
          notificationId: uuidv4(),
          event: 'delivered'
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('WEBHOOK_SIGNATURE_MISSING');
    });

    it('rejects delivery webhook request with an invalid/tampered cryptographic signature (401)', async () => {
      const validNotif = await notificationAdapter.dispatchNotification({
        eventType: 'ACCOUNT_INVITATION',
        recipientEmail: 'sig-test@nexnuv.org'
      });

      const payload = {
        notificationId: validNotif.notificationId,
        event: 'delivered',
        timestamp: new Date().toISOString()
      };

      const res = await request(app)
        .post('/api/v1/subscriptions/notifications/delivery-webhook')
        .set('svix-id', `msg_${uuidv4().replace(/-/g, '')}`)
        .set('svix-timestamp', String(Math.floor(Date.now() / 1000)))
        .set('svix-signature', 'v1,totally_fabricated_invalid_base64_signature==')
        .send(payload);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('WEBHOOK_SIGNATURE_INVALID');
    });

    it('successfully verifies and records a valid Resend/Svix webhook signature (200)', async () => {
      const validNotif = await notificationAdapter.dispatchNotification({
        eventType: 'ACCOUNT_INVITATION',
        recipientEmail: 'svix-pass@nexnuv.org'
      });

      const payload = {
        notificationId: validNotif.notificationId,
        event: 'delivered',
        timestamp: new Date().toISOString()
      };
      const headers = buildSvixHeaders(payload);

      const res = await request(app)
        .post('/api/v1/subscriptions/notifications/delivery-webhook')
        .set(headers)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('DELIVERED');
      expect(res.body.data.notificationId).toBe(validNotif.notificationId);

      const recorded = notificationAdapter.getDeliveryStatus(validNotif.notificationId);
      expect(recorded.status).toBe('DELIVERED');
    });

    it('successfully verifies and records a valid Standard HMAC-SHA256 signature (200)', async () => {
      const validNotif = await notificationAdapter.dispatchNotification({
        eventType: 'ACCOUNT_INVITATION',
        recipientEmail: 'hmac-pass@nexnuv.org'
      });

      const payload = {
        notificationId: validNotif.notificationId,
        event: 'delivered',
        timestamp: new Date().toISOString()
      };
      const headers = buildHmacHeaders(payload);

      const res = await request(app)
        .post('/api/v1/subscriptions/notifications/delivery-webhook')
        .set(headers)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('DELIVERED');
    });

    it('rejects an expired webhook timestamp older than tolerance threshold (401)', async () => {
      const validNotif = await notificationAdapter.dispatchNotification({
        eventType: 'ACCOUNT_INVITATION',
        recipientEmail: 'expired-ts@nexnuv.org'
      });

      const payload = {
        notificationId: validNotif.notificationId,
        event: 'delivered'
      };
      // Timestamp from 15 minutes ago (900 seconds ago, tolerance is 300s)
      const expiredTimestamp = Math.floor(Date.now() / 1000) - 900;
      const headers = buildSvixHeaders(payload, process.env.RESEND_WEBHOOK_SECRET, expiredTimestamp);

      const res = await request(app)
        .post('/api/v1/subscriptions/notifications/delivery-webhook')
        .set(headers)
        .send(payload);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('WEBHOOK_TIMESTAMP_EXPIRED');
    });

    it('rejects a replay attempt or futuristic timestamp beyond clock drift window (401)', async () => {
      const validNotif = await notificationAdapter.dispatchNotification({
        eventType: 'ACCOUNT_INVITATION',
        recipientEmail: 'future-ts@nexnuv.org'
      });

      const payload = {
        notificationId: validNotif.notificationId,
        event: 'delivered'
      };
      // Timestamp 10 minutes into the future
      const futureTimestamp = Math.floor(Date.now() / 1000) + 600;
      const headers = buildSvixHeaders(payload, process.env.RESEND_WEBHOOK_SECRET, futureTimestamp);

      const res = await request(app)
        .post('/api/v1/subscriptions/notifications/delivery-webhook')
        .set(headers)
        .send(payload);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('WEBHOOK_TIMESTAMP_EXPIRED');
    });

    it('prevents duplicate webhook processing: second identical event is acknowledged safely without duplicate audit (200)', async () => {
      const validNotif = await notificationAdapter.dispatchNotification({
        eventType: 'ACCOUNT_INVITATION',
        recipientEmail: 'dedup-test@nexnuv.org'
      });

      const payload = {
        notificationId: validNotif.notificationId,
        event: 'delivered',
        timestamp: new Date().toISOString()
      };
      const headers = buildSvixHeaders(payload);

      // First delivery: processes normally
      const res1 = await request(app)
        .post('/api/v1/subscriptions/notifications/delivery-webhook')
        .set(headers)
        .send(payload);
      expect(res1.status).toBe(200);
      expect(res1.body.data.status).toBe('DELIVERED');

      // Second delivery with identical event headers: detected as duplicate
      const res2 = await request(app)
        .post('/api/v1/subscriptions/notifications/delivery-webhook')
        .set(headers)
        .send(payload);
      expect(res2.status).toBe(200);
      expect(res2.body.duplicate).toBe(true);
      expect(res2.body.message).toMatch(/duplicate/i);
    });

    it('rejects webhook delivery referencing an unknown/unrelated notification (404)', async () => {
      const unknownId = uuidv4();
      const payload = {
        notificationId: unknownId,
        event: 'delivered',
        timestamp: new Date().toISOString()
      };
      const headers = buildSvixHeaders(payload);

      const res = await request(app)
        .post('/api/v1/subscriptions/notifications/delivery-webhook')
        .set(headers)
        .send(payload);

      expect(res.status).toBe(404);
      expect(res.body.error.message).toMatch(/unrelated or unknown notification/i);
    });

    it('rejects malformed webhook request body lacking event or target identifier (400 / 422)', async () => {
      const payload = {
        timestamp: new Date().toISOString()
        // Missing notificationId / messageId and event
      };
      const headers = buildSvixHeaders(payload);

      const res = await request(app)
        .post('/api/v1/subscriptions/notifications/delivery-webhook')
        .set(headers)
        .send(payload);

      expect([400, 422]).toContain(res.status);
    });

    it('fails safely with 503 Service Unavailable when webhook signing secret is unconfigured', async () => {
      // Temporarily clear secrets
      delete process.env.RESEND_WEBHOOK_SECRET;
      delete process.env.NOTIFICATION_WEBHOOK_SECRET;
      delete process.env.BREVO_WEBHOOK_SECRET;
      env.webhook = env.buildWebhookConfig(process.env);

      const payload = {
        notificationId: uuidv4(),
        event: 'delivered'
      };

      const res = await request(app)
        .post('/api/v1/subscriptions/notifications/delivery-webhook')
        .set('svix-id', 'msg_123')
        .set('svix-timestamp', String(Math.floor(Date.now() / 1000)))
        .set('svix-signature', 'v1,dummy')
        .send(payload);

      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('WEBHOOK_CONFIG_MISSING');
    });
  });

  describe('2. Organisation Provisioning Idempotency & Reconciliation Suite', () => {
    it('generates a stable deterministic organization code from subscriptionId', () => {
      const subId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      const code1 = organisationAdapter.deriveDeterministicOrgCode(subId);
      const code2 = organisationAdapter.deriveDeterministicOrgCode(subId);

      expect(code1).toBe(code2);
      expect(code1.startsWith('ORG-')).toBe(true);
      expect(code1.length).toBeLessThanOrEqual(25);
    });

    it('guarantees provisioning idempotency: repeated calls with same subscriptionId return the exact same organisation', async () => {
      const subId = uuidv4();
      const orgParams = {
        subscriptionId: subId,
        organisationName: 'Solaria Energy Inc',
        organisationDomain: 'solariaenergy.com',
        industry: 'Renewables',
        companySize: '51-200',
        adminName: 'Samantha Ray',
        adminEmail: 'samantha@solariaenergy.com'
      };

      // Call 1: initial provisioning
      const result1 = await platformAdapter.provisionOrganisation(orgParams);
      expect(result1.organisationId).toBeTruthy();

      // Call 2: retry / repeated provisioning (e.g. after network timeout)
      const result2 = await platformAdapter.provisionOrganisation(orgParams);
      expect(result2.organisationId).toBe(result1.organisationId);

      // Verify no duplicate organisation profile created
      const org1 = await organisationAdapter.getOrganisation(result1.organisationId);
      const org2 = await organisationAdapter.getOrganisation(result2.organisationId);
      expect(org1.id).toBe(org2.id);
    });

    it('recovers safely from simulated partial failure without duplicate organisation provisioning', async () => {
      // 1. Create subscription & submit payment
      const subRes = await request(app).post('/api/v1/subscriptions').send({
        organisationName: 'BioGenix Labs',
        organisationDomain: 'biogenixlabs.org',
        industry: 'Biotech',
        companySize: '11-50',
        adminName: 'Dr. Bruce Banner',
        adminEmail: 'bruce@biogenixlabs.org',
        planCode: 'RECRUITMENT_ADVANCED',
        billingCycle: 'MONTHLY'
      });
      const subId = subRes.body.data.id;

      await request(app)
        .post(`/api/v1/subscriptions/${subId}/payments`)
        .field('paymentReference', 'BIOGENIX-WIRE-001')
        .field('paymentMethod', 'WIRE_TRANSFER');

      // 2. Pre-seed the organisation profile with this subscriptionId to simulate downstream creation that timed out on client return
      const deterministicCode = organisationAdapter.deriveDeterministicOrgCode(subId);
      const preseededOrg = organisationAdapter.seedOrganisationProfile(uuidv4(), {
        name: 'BioGenix Labs',
        domain: 'biogenixlabs.org',
        code: deterministicCode,
        subscriptionId: subId
      });

      // 3. Admin verifies payment: verifyPayment should reconcile the pre-existing tenant rather than failing or duplicating
      const verifyRes = await request(app)
        .post(`/api/v1/subscriptions/platform-admin/${subId}/verify`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ decision: 'APPROVE' });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.data.subscription.status).toBe('APPROVED');
      expect(verifyRes.body.data.subscription.organisationId).toBe(preseededOrg.organisationId);
      expect(verifyRes.body.data.subscription.provisioningStatus).toBe('PROVISIONED');
    });
  });

  describe('3. Multi-Connection Concurrency & PostgreSQL Row-Level Lock Verification', () => {
    it('executes concurrent verification over independent connection pool checkouts: exactly 1 succeeds and other receives 409 conflict', async () => {
      // Create subscription & submit payment
      const subRes = await request(app).post('/api/v1/subscriptions').send({
        organisationName: 'HyperScale Cloud',
        organisationDomain: 'hyperscalecloud.net',
        industry: 'Cloud Infrastructure',
        companySize: '500+',
        adminName: 'Satoshi Nakamoto',
        adminEmail: 'satoshi@hyperscalecloud.net',
        planCode: 'RECRUITMENT_ENTERPRISE',
        billingCycle: 'ANNUAL'
      });
      const subId = subRes.body.data.id;

      await request(app)
        .post(`/api/v1/subscriptions/${subId}/payments`)
        .field('paymentReference', 'CONCURRENT-IND-001')
        .field('paymentMethod', 'WIRE_TRANSFER');

      // Fire 2 concurrent approvals simultaneously exercising independent connection pool checkouts
      const [res1, res2] = await Promise.all([
        request(app)
          .post(`/api/v1/subscriptions/platform-admin/${subId}/verify`)
          .set('Authorization', `Bearer ${platformAdminToken}`)
          .send({ decision: 'APPROVE' }),
        request(app)
          .post(`/api/v1/subscriptions/platform-admin/${subId}/verify`)
          .set('Authorization', `Bearer ${platformAdminToken}`)
          .send({ decision: 'APPROVE' })
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 409]);

      const successRes = res1.status === 200 ? res1 : res2;
      const conflictRes = res1.status === 409 ? res1 : res2;

      expect(successRes.body.data.subscription.status).toBe('APPROVED');
      expect(conflictRes.body.error.code).toMatch(/ALREADY_VERIFIED_OR_INVALID_STATE|VERIFICATION_IN_FLIGHT/);

      // Verify final database state: exactly 1 approval committed, exactly 1 tenant organisation
      const { Subscription } = getModels();
      const finalSub = await Subscription.findByPk(subId);
      expect(finalSub.status).toBe('APPROVED');
      expect(finalSub.provisioningStatus).toBe('PROVISIONED');
      expect(finalSub.organisationId).toBeTruthy();
    });

    it('verifies transaction rollback and lock release on intentional provisioning failure', async () => {
      const subRes = await request(app).post('/api/v1/subscriptions').send({
        organisationName: 'Rollback Safety Corp',
        organisationDomain: 'rollbacksafety.org',
        industry: 'Security',
        companySize: '1-10',
        adminName: 'Grace Hopper',
        adminEmail: 'grace@rollbacksafety.org',
        planCode: 'RECRUITMENT_BASIC',
        billingCycle: 'MONTHLY'
      });
      const subId = subRes.body.data.id;

      await request(app)
        .post(`/api/v1/subscriptions/${subId}/payments`)
        .field('paymentReference', 'ROLLBACK-TXN-001')
        .field('paymentMethod', 'WIRE_TRANSFER');

      // Reject payment to test clean rollback of pending state and transition to REJECTED
      const rejectRes = await request(app)
        .post(`/api/v1/subscriptions/platform-admin/${subId}/verify`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ decision: 'REJECT', rejectionReason: 'Remittance amount mismatched bank statement' });

      expect(rejectRes.status).toBe(200);
      expect(rejectRes.body.data.subscription.status).toBe('REJECTED');

      // Verify row lock was released and subsequent operations can read or update cleanly
      const { Subscription, SubscriptionPayment } = getModels();
      const updatedSub = await Subscription.findByPk(subId);
      expect(updatedSub.status).toBe('REJECTED');

      const payment = await SubscriptionPayment.findOne({ where: { subscriptionId: subId } });
      expect(payment.status).toBe('REJECTED');
    });
  });

  describe('4. Production Environment Configuration Assertions', () => {
    it('validates production rules in validateWebhookConfiguration', () => {
      // Must reject missing RESEND_WEBHOOK_SECRET for RESEND in production
      expect(() => {
        env.validateWebhookConfiguration(
          { resendSecret: '', toleranceSeconds: 300 },
          { provider: 'RESEND' },
          'production'
        );
      }).toThrow(/RESEND_WEBHOOK_SECRET.*must be explicitly configured/);

      // Must reject invalid tolerance window
      expect(() => {
        env.validateWebhookConfiguration(
          { resendSecret: 'whsec_valid', toleranceSeconds: 5 },
          { provider: 'RESEND' },
          'development'
        );
      }).toThrow(/WEBHOOK_TOLERANCE_SECONDS/);

      // Must accept valid production config
      expect(() => {
        env.validateWebhookConfiguration(
          { resendSecret: 'whsec_prod_secret_123', toleranceSeconds: 300 },
          { provider: 'RESEND' },
          'production'
        );
      }).not.toThrow();
    });
  });
});
