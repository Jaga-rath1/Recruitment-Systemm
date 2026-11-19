import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const { startTestDatabase, resetTestState, stopTestDatabase } = require('../helpers/testDb');
const { createApp } = require('../../src/app');
const { getModels } = require('../../src/config/database');
const env = require('../../src/config/env');
const authAdapter = require('../../src/integrations/auth/auth.adapter');
const platformAdapter = require('../../src/integrations/platform/platform.adapter');
const organisationAdapter = require('../../src/integrations/organisation/organisation.adapter');
const notificationAdapter = require('../../src/integrations/notification/notification.adapter');
const emailAdapter = require('../../src/integrations/email/email.adapter');

let app;
let originalMode;
let originalFetch;

function makeJsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body)
  };
}

describe('Phase 1 Production Integration Remediation — Isolated Live-Mode Contract Verification', () => {
  beforeAll(async () => {
    await startTestDatabase();
    app = createApp();
  });

  afterAll(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await resetTestState();
    originalMode = env.integrationMode;
    originalFetch = global.fetch;
  });

  afterEach(() => {
    env.integrationMode = originalMode;
    global.fetch = originalFetch;
    emailAdapter.setTestEmailTransport(null);
    vi.restoreAllMocks();
  });

  it('1. Auth Adapter (live): updateOrgUserPassword & activateEmployeeAccountCredentials use provision-agent + login + setup-password (never non-existent PATCH /users/:id/password) and reject cross-org conflicts', async () => {
    env.integrationMode = 'live';
    const orgId = uuidv4();
    const authUserId = uuidv4();
    const calls = [];

    global.fetch = vi.fn(async (url, opts = {}) => {
      const u = new URL(url);
      const body = opts.body ? JSON.parse(opts.body) : null;
      calls.push({ method: opts.method, path: u.pathname, body, auth: opts.headers?.Authorization || null });

      if (u.pathname === `/api/v1/auth/internal/accounts/${authUserId}`) {
        return makeJsonResponse(200, {
          success: true,
          data: { id: authUserId, status: 'active', role: 'hr', organizationId: orgId }
        });
      }
      if (u.pathname === '/api/v1/auth/internal/provision-agent') {
        return makeJsonResponse(200, {
          success: true,
          data: {
            user: { id: authUserId, email: body.email, role: body.role, organizationId: orgId },
            tempPassword: 'TmpPassword#999'
          }
        });
      }
      if (u.pathname === '/api/v1/auth/login') {
        return makeJsonResponse(200, {
          success: true,
          token: 'temp-jwt-token',
          user: { id: authUserId, email: body.email, role: 'hr', organizationId: orgId, mustChangePassword: true }
        });
      }
      if (u.pathname === '/api/v1/auth/setup-password') {
        return makeJsonResponse(200, {
          success: true,
          token: 'final-jwt-token',
          user: { id: authUserId, email: 'recruiter@alpha.test', role: 'hr', organizationId: orgId, mustChangePassword: false }
        });
      }
      return makeJsonResponse(404, { success: false, message: `Unexpected path ${u.pathname}` });
    });

    const res = await authAdapter.updateOrgUserPassword({
      email: 'recruiter@alpha.test',
      organisationId: orgId,
      authUserId,
      fullName: 'Alpha Recruiter',
      roles: ['RECRUITER'],
      password: 'NewStrongPass!2026'
    });

    expect(res.userId).toBe(authUserId);
    expect(res.token).toBe('final-jwt-token');
    expect(calls.some((c) => c.path.includes('/password') && c.method === 'PATCH')).toBe(false);
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      `GET /api/v1/auth/internal/accounts/${authUserId}`,
      'POST /api/v1/auth/internal/provision-agent',
      'POST /api/v1/auth/login',
      'POST /api/v1/auth/setup-password'
    ]);

    // Cross-org 409 MUST fail closed (never overwrite)
    global.fetch = vi.fn(async (url) => {
      const u = new URL(url);
      if (u.pathname === '/api/v1/auth/internal/provision-agent') {
        return makeJsonResponse(409, { success: false, message: 'Email already registered with another organization' });
      }
      return makeJsonResponse(404, { success: false });
    });

    await expect(
      authAdapter.activateEmployeeAccountCredentials({
        authUserId: null,
        organisationId: orgId,
        email: 'collision@otherorg.test',
        fullName: 'Collision User',
        roleCode: 'RECRUITER',
        password: 'NewStrongPass!2026'
      })
    ).rejects.toMatchObject({ statusCode: 409, code: 'CROSS_ORG_AUTH_CONFLICT' });
  });

  it('2. Public Careers (live resilience): returns 200 OK with persisted Subscription organisationName even when Organization Service returns 404', async () => {
    const orgId = uuidv4();
    const { Subscription, JobSource, Job, JobPublication } = getModels();

    await Subscription.create({
      organisationId: orgId,
      organisationName: 'Alpha Apex Tech',
      organisationDomain: 'alphaapextech.com',
      industry: 'Technology',
      companySize: '51-200',
      adminName: 'Alpha Admin',
      adminEmail: 'admin@alphaapextech.com',
      planCode: 'RECRUITMENT_ADVANCED',
      billingCycle: 'MONTHLY',
      amountCents: 199900,
      currency: 'INR',
      status: 'ACTIVE',
      paymentInstructions: { paymentMemo: 'ALPHA-APEX-001' },
      startsAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 86400000)
    });

    const jobSource = await JobSource.create({
      organisationId: orgId,
      sourceType: 'MANUAL',
      syncStatus: 'MANUAL'
    });

    const job = await Job.create({
      organisationId: orgId,
      jobSourceId: jobSource.id,
      sourceType: 'MANUAL',
      title: 'Principal Platform Reliability Engineer',
      description: 'Lead multi-tenant reliability architecture and database observability across NEXNUV.',
      department: 'Engineering',
      skills: ['Node.js', 'PostgreSQL'],
      experienceLabel: '7-10 years',
      salaryDisplay: '₹35,00,000 - ₹45,00,000 INR',
      location: 'Bengaluru',
      employmentType: 'FULL_TIME',
      headcount: 1,
      status: 'PUBLISHED',
      isDiscarded: false
    });

    await JobPublication.create({
      organisationId: orgId,
      jobId: job.id,
      slug: `principal-platform-sre-${job.id.slice(0, 8)}`,
      isPublic: true,
      publishedAt: new Date()
    });

    // Simulate live mode where Organization Service returns 404 for legacy standalone org
    env.integrationMode = 'live';
    vi.spyOn(organisationAdapter, 'getOrganisation').mockRejectedValue(
      Object.assign(new Error('Organization not found'), { statusCode: 404 })
    );

    const listRes = await request(app).get('/api/v1/jobs/public/careers');
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBe(1);
    expect(listRes.body.data[0].organisationName).toBe('Alpha Apex Tech');

    const detailRes = await request(app).get(`/api/v1/jobs/public/careers/${job.id}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.organisationName).toBe('Alpha Apex Tech');
  });

  it('3. Platform Adapter (live): maps Recruitment plan codes + billing cycles accurately, fails closed on subscription activation error, and syncs cancellation', async () => {
    const liveCatalog = [
      { id: 'p-starter-m', code: 'RECRUITMENT_STARTER_MONTHLY', status: 'active', billingCycle: 'monthly' },
      { id: 'p-starter-y', code: 'RECRUITMENT_STARTER_YEARLY', status: 'active', billingCycle: 'yearly' },
      { id: 'p-pro-m', code: 'RECRUITMENT_PROFESSIONAL_MONTHLY', status: 'active', billingCycle: 'monthly' },
      { id: 'p-pro-y', code: 'RECRUITMENT_PROFESSIONAL_YEARLY', status: 'active', billingCycle: 'yearly' },
      { id: 'p-ent-m', code: 'RECRUITMENT_ENTERPRISE_MONTHLY', status: 'active', billingCycle: 'monthly' },
      { id: 'p-ent-y', code: 'RECRUITMENT_ENTERPRISE_YEARLY', status: 'active', billingCycle: 'yearly' }
    ];

    expect(platformAdapter.resolvePlatformPlan(liveCatalog, 'RECRUITMENT_BASIC', 'MONTHLY')?.code).toBe('RECRUITMENT_STARTER_MONTHLY');
    expect(platformAdapter.resolvePlatformPlan(liveCatalog, 'RECRUITMENT_BASIC', 'ANNUAL')?.code).toBe('RECRUITMENT_STARTER_YEARLY');
    expect(platformAdapter.resolvePlatformPlan(liveCatalog, 'RECRUITMENT_ADVANCED', 'MONTHLY')?.code).toBe('RECRUITMENT_PROFESSIONAL_MONTHLY');
    expect(platformAdapter.resolvePlatformPlan(liveCatalog, 'RECRUITMENT_ADVANCED', 'ANNUAL')?.code).toBe('RECRUITMENT_PROFESSIONAL_YEARLY');
    expect(platformAdapter.resolvePlatformPlan(liveCatalog, 'RECRUITMENT_ENTERPRISE', 'ANNUAL')?.code).toBe('RECRUITMENT_ENTERPRISE_YEARLY');

    env.integrationMode = 'live';
    const createdOrgId = uuidv4();
    const platformSubId = uuidv4();
    const seen = [];

    global.fetch = vi.fn(async (url, opts = {}) => {
      const u = new URL(url);
      const body = opts.body ? JSON.parse(opts.body) : null;
      seen.push({ method: opts.method, path: u.pathname, body });

      if (opts.method === 'POST' && u.pathname === '/api/v1/organizations') {
        return makeJsonResponse(201, { success: true, data: { id: createdOrgId, name: body.name, status: 'active' } });
      }
      if (opts.method === 'GET' && u.pathname === '/api/v1/platform/plans') {
        return makeJsonResponse(200, { success: true, data: liveCatalog });
      }
      if (opts.method === 'POST' && u.pathname === '/api/v1/platform/subscriptions') {
        return makeJsonResponse(201, { success: true, data: { id: platformSubId, organizationId: createdOrgId, planId: body.planId, status: body.status } });
      }
      if (opts.method === 'GET' && u.pathname === `/api/v1/platform/organizations/${createdOrgId}/subscription`) {
        return makeJsonResponse(200, { success: true, data: { id: platformSubId, organizationId: createdOrgId, status: 'active' } });
      }
      if (opts.method === 'PATCH' && u.pathname === `/api/v1/platform/subscriptions/${platformSubId}`) {
        return makeJsonResponse(200, { success: true, data: { id: platformSubId, status: 'cancelled' } });
      }
      return makeJsonResponse(404, { success: false });
    });

    const prov = await platformAdapter.provisionOrganisation({
      subscriptionId: uuidv4(),
      name: 'Trial Compatible Corp',
      domain: 'trialcompat.test',
      adminEmail: 'owner@trialcompat.test',
      planCode: 'RECRUITMENT_ADVANCED',
      billingCycle: 'ANNUAL',
      isTrial: false
    });
    expect(prov.organisationId).toBe(createdOrgId);
    const subCreateCall = seen.find((c) => c.method === 'POST' && c.path === '/api/v1/platform/subscriptions');
    expect(subCreateCall.body.planId).toBe('p-pro-y');

    // Sync cancellation to Platform Service
    const cancelSync = await platformAdapter.cancelOrganisationSubscription(createdOrgId);
    expect(cancelSync.synced).toBe(true);
    expect(cancelSync.alreadyCancelled).toBe(false);
    expect(seen.some((c) => c.method === 'PATCH' && c.path === `/api/v1/platform/subscriptions/${platformSubId}` && c.body.status === 'cancelled')).toBe(true);

    // Non-409 subscription creation error MUST propagate (never leave unsubscribed org silently)
    global.fetch = vi.fn(async (url, opts = {}) => {
      const u = new URL(url);
      if (opts.method === 'POST' && u.pathname === '/api/v1/organizations') {
        return makeJsonResponse(201, { success: true, data: { id: uuidv4(), name: 'Fail Org', status: 'active' } });
      }
      if (opts.method === 'GET' && u.pathname === '/api/v1/platform/plans') {
        return makeJsonResponse(200, { success: true, data: liveCatalog });
      }
      if (opts.method === 'POST' && u.pathname === '/api/v1/platform/subscriptions') {
        return makeJsonResponse(503, { success: false, message: 'Platform DB unavailable' });
      }
      return makeJsonResponse(404, { success: false });
    });

    await expect(
      platformAdapter.provisionOrganisation({
        organisationName: 'Fail Org',
        organisationDomain: 'failorg.test',
        adminEmail: 'a@failorg.test',
        planCode: 'RECRUITMENT_BASIC',
        billingCycle: 'MONTHLY'
      })
    ).rejects.toMatchObject({ statusCode: 503 });
  });

  it('4. Notification Adapter (live): sends rendered HTML + subject to Notification Service, falls back to direct SMTP for pre-tenant events, and persists recruitment_notification_history', async () => {
    env.integrationMode = 'live';
    const orgId = uuidv4();
    const sentDirectEmails = [];
    const sentNotifPayloads = [];

    emailAdapter.setTestEmailTransport(async (payload) => {
      sentDirectEmails.push(payload);
      return { delivered: true, provider: 'TEST', messageId: 'direct-msg-1' };
    });

    global.fetch = vi.fn(async (url, opts = {}) => {
      const u = new URL(url);
      const body = opts.body ? JSON.parse(opts.body) : null;
      sentNotifPayloads.push({ path: u.pathname, body });
      return makeJsonResponse(201, {
        success: true,
        data: { id: uuidv4(), emailDelivery: { sent: true, delivered: true, messageId: 'notif-svc-1' } }
      });
    });

    // 4a. Pre-tenant event (organisationId: null) -> falls back to direct email instead of silently dropping!
    const preTenantRes = await notificationAdapter.dispatchNotification({
      eventType: 'SUBSCRIPTION_SUBMITTED',
      organisationId: null,
      recipientEmail: 'founder@neworg.test',
      recipientName: 'Founder',
      payload: { organisationName: 'NewOrg Labs', paymentInstructions: { paymentMemo: 'MEMO-123' } }
    });
    expect(preTenantRes.requestAccepted).toBe(true);
    expect(preTenantRes.fallbackChannel).toBe('DIRECT_EMAIL');
    expect(sentDirectEmails.length).toBe(1);
    expect(sentDirectEmails[0].to).toBe('founder@neworg.test');

    // 4b. Tenant-scoped password reset event -> sends HTML + subject to Notification Service AND persists DB history
    const tenantRes = await notificationAdapter.dispatchNotification({
      eventType: 'PASSWORD_RESET_REQUESTED',
      organisationId: orgId,
      recipientEmail: 'admin@alpha.test',
      recipientName: 'Alpha Admin',
      payload: {
        organisationName: 'Alpha Apex Tech',
        roleLabel: 'Organisation Admin',
        resetLink: 'http://localhost:5173/reset-password?token=abc123&portal=org',
        loginUrl: 'http://localhost:5173/org-login',
        expiresInMinutes: 60
      }
    });
    expect(tenantRes.requestAccepted).toBe(true);
    expect(sentNotifPayloads.length).toBe(1);
    expect(sentNotifPayloads[0].body.subject).toContain('Reset Your NEXNUV Organisation Admin Password');
    expect(sentNotifPayloads[0].body.html).toContain('Set New Password');
    expect(sentNotifPayloads[0].body.html).toContain('token=abc123');

    const { RecruitmentNotificationHistory } = getModels();
    const persistedCount = await RecruitmentNotificationHistory.count();
    expect(persistedCount).toBe(2);
  });
});
