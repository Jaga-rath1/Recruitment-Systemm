import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { v4: uuidv4 } = require('uuid');
const env = require('../../src/config/env');
const notificationAdapter = require('../../src/integrations/notification/notification.adapter');

describe('Recruitment Service -> Notification Service (:4006) Live HTTP Integration Suite', () => {
  const testOrgId = uuidv4();
  let originalMode;
  let originalNotificationUrl;
  let isLiveServiceAvailable = false;

  beforeAll(async () => {
    originalMode = env.integrationMode;
    originalNotificationUrl = env.services.notificationUrl;
    env.integrationMode = 'live';
    env.services.notificationUrl = 'http://localhost:4006';
    try {
      const probe = await fetch('http://localhost:4006/health', { signal: AbortSignal.timeout(600) });
      isLiveServiceAvailable = probe.ok;
    } catch {
      isLiveServiceAvailable = false;
    }
  });

  afterAll(() => {
    env.integrationMode = originalMode;
    env.services.notificationUrl = originalNotificationUrl;
  });

  it('successfully dispatches APPLICATION_RECEIVED event to live Notification Service', async (ctx) => {
    if (!isLiveServiceAvailable) {
      ctx.skip();
      return;
    }
    const res = await notificationAdapter.dispatchNotification({
      eventType: 'APPLICATION_RECEIVED',
      organisationId: testOrgId,
      recipientUserId: 'cand-user-1',
      recipientEmail: 'cand1@isolated-test.nexnuv',
      recipientName: 'Samantha Ray',
      payload: {
        applicationReference: 'APP-LIVE-2026-001',
        jobTitle: 'Principal Systems Architect'
      },
      requestId: 'req-live-notif-001'
    });

    expect(res.requestAccepted).toBe(true);
    expect(res.mode).toBe('live');
    expect(res.notificationId).toBeDefined();
    expect(['ACCEPTED', 'SENT', 'DELIVERED']).toContain(res.deliveryStatus);

    const ledger = notificationAdapter.getDeliveryStatus(res.notificationId);
    expect(ledger).not.toBeNull();
    expect(ledger.eventType).toBe('APPLICATION_RECEIVED');
    expect(ledger.recipientEmail).toBe('cand1@isolated-test.nexnuv');
  });

  it('successfully dispatches INTERVIEW_SCHEDULED event with date payload', async (ctx) => {
    if (!isLiveServiceAvailable) {
      ctx.skip();
      return;
    }
    const res = await notificationAdapter.dispatchNotification({
      eventType: 'INTERVIEW_SCHEDULED',
      organisationId: testOrgId,
      recipientUserId: 'cand-user-2',
      recipientEmail: 'cand2@isolated-test.nexnuv',
      recipientName: 'Marcus Vance',
      payload: {
        roundType: 'TECHNICAL',
        roundNumber: 2,
        scheduledAt: '2026-11-25T14:30:00.000Z'
      },
      requestId: 'req-live-notif-002'
    });

    expect(res.requestAccepted).toBe(true);
    expect(res.mode).toBe('live');
    expect(res.notificationId).toBeDefined();
  });

  it('successfully dispatches OFFER_LETTER_SENT event with designation payload', async (ctx) => {
    if (!isLiveServiceAvailable) {
      ctx.skip();
      return;
    }
    const res = await notificationAdapter.dispatchNotification({
      eventType: 'OFFER_LETTER_SENT',
      organisationId: testOrgId,
      recipientUserId: 'cand-user-3',
      recipientEmail: 'cand3@isolated-test.nexnuv',
      recipientName: 'Kavita Rao',
      payload: {
        designation: 'Senior PostgreSQL Specialist'
      },
      requestId: 'req-live-notif-003'
    });

    expect(res.requestAccepted).toBe(true);
    expect(res.mode).toBe('live');
    expect(res.notificationId).toBeDefined();
  });

  it('successfully dispatches JOINING_CONFIRMED event', async (ctx) => {
    if (!isLiveServiceAvailable) {
      ctx.skip();
      return;
    }
    const res = await notificationAdapter.dispatchNotification({
      eventType: 'JOINING_CONFIRMED',
      organisationId: testOrgId,
      recipientUserId: 'cand-user-4',
      recipientEmail: 'cand4@isolated-test.nexnuv',
      recipientName: 'Kavita Rao',
      payload: {
        actualJoiningDate: '2026-12-01'
      },
      requestId: 'req-live-notif-004'
    });

    expect(res.requestAccepted).toBe(true);
    expect(res.mode).toBe('live');
    expect(res.notificationId).toBeDefined();
  });

  it('successfully dispatches ACCOUNT_INVITATION with 48h activation link', async (ctx) => {
    if (!isLiveServiceAvailable) {
      ctx.skip();
      return;
    }
    const res = await notificationAdapter.dispatchNotification({
      eventType: 'ACCOUNT_INVITATION',
      organisationId: testOrgId,
      recipientUserId: 'admin-user-1',
      recipientEmail: 'admin@isolated-test.nexnuv',
      recipientName: 'Tenant Admin',
      payload: {
        organisationName: 'Apex Logistics',
        planName: 'Enterprise',
        activationLink: 'http://localhost:5173/activate-account?token=abcdef123456',
        expiresInHours: 48,
        loginUrl: 'http://localhost:5173/login'
      },
      requestId: 'req-live-notif-005'
    });

    expect(res.requestAccepted).toBe(true);
    expect(res.mode).toBe('live');
    expect(res.notificationId).toBeDefined();
  });

  it('gracefully handles unreachable Notification Service without throwing exception', async () => {
    // Point to a non-existent port to simulate downstream outage
    env.services.notificationUrl = 'http://localhost:59999';

    const res = await notificationAdapter.dispatchNotification({
      eventType: 'APPLICATION_RECEIVED',
      organisationId: testOrgId,
      recipientUserId: 'cand-user-err',
      recipientEmail: 'cand-err@isolated-test.nexnuv',
      payload: { applicationReference: 'APP-FAIL-001' },
      requestId: 'req-outage-001'
    });

    expect(res.requestAccepted).toBe(false);
    expect(res.deliveryStatus).toBe('FAILED');
    expect(res.delivered).toBe(false);
    expect(res.error).toBeDefined();
  });
});
