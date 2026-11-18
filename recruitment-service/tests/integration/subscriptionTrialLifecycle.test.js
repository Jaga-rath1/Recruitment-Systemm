import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const { startTestDatabase, resetTestState, stopTestDatabase } = require('../helpers/testDb');
const { createApp } = require('../../src/app');
const authAdapter = require('../../src/integrations/auth/auth.adapter');
const { getModels } = require('../../src/config/database');

let app;

describe('Recruitment SaaS: Three Plans & 15-Day Free Trial Lifecycle', () => {
  beforeAll(async () => {
    await startTestDatabase();
    app = createApp();
  });

  afterAll(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await resetTestState();
  });

  it('GET /api/v1/subscriptions/plans lists all 3 paid plans (Basic, Advanced, Enterprise) and Free Trial metadata', async () => {
    const res = await request(app).get('/api/v1/subscriptions/plans');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const plans = res.body.data.plans;
    expect(plans).toHaveLength(3);

    const [basic, advanced, enterprise] = plans;

    // Basic Plan Verification
    expect(basic.code).toBe('RECRUITMENT_BASIC');
    expect(basic.name).toBe('Basic');
    expect(basic.pricing.monthly.amountCents).toBe(99900);
    expect(basic.pricing.monthly.currency).toBe('INR');
    expect(basic.pricing.annual.amountCents).toBe(999900);
    expect(basic.pricing.annual.currency).toBe('INR');
    expect(basic.trialDays).toBe(15);
    expect(basic.features).toContain('Unlimited manual job postings');

    // Advanced Plan Verification
    expect(advanced.code).toBe('RECRUITMENT_ADVANCED');
    expect(advanced.name).toBe('Advanced');
    expect(advanced.isPopular).toBe(true);
    expect(advanced.pricing.monthly.amountCents).toBe(199900);
    expect(advanced.pricing.monthly.currency).toBe('INR');
    expect(advanced.pricing.annual.amountCents).toBe(1999900);
    expect(advanced.pricing.annual.currency).toBe('INR');
    expect(advanced.features).toContain('Bidirectional HRMS Requisition Sync');

    // Enterprise Plan Verification
    expect(enterprise.code).toBe('RECRUITMENT_ENTERPRISE');
    expect(enterprise.name).toBe('Enterprise');
    expect(enterprise.pricing.monthly.amountCents).toBe(499900);
    expect(enterprise.pricing.monthly.currency).toBe('INR');
    expect(enterprise.pricing.annual.amountCents).toBe(4999900);
    expect(enterprise.pricing.annual.currency).toBe('INR');
    expect(enterprise.features).toContain('Dedicated PostgreSQL Row-Level Tenant Isolation');

    // Trial metadata
    expect(res.body.data.trial.durationDays).toBe(15);
    expect(res.body.data.trial.price).toBe(0);
    expect(res.body.data.trial.currency).toBe('INR');
  });

  it('creates paid subscription requests with independently configured pricing for Basic, Advanced, and Enterprise', async () => {
    // 1. Basic Annual
    const basicRes = await request(app)
      .post('/api/v1/subscriptions')
      .send({
        organisationName: 'Seedling AI',
        organisationDomain: 'seedling.ai',
        industry: 'AI Labs',
        companySize: '11-50',
        adminName: 'Alice Green',
        adminEmail: 'alice@seedling.ai',
        planCode: 'RECRUITMENT_BASIC',
        billingCycle: 'ANNUAL'
      });
    expect(basicRes.status).toBe(201);
    expect(basicRes.body.data.amountCents).toBe(999900);
    expect(basicRes.body.data.currency).toBe('INR');
    expect(basicRes.body.data.paymentInstructions.amountFormatted).toContain('9,999');

    // 2. Advanced Monthly
    const advRes = await request(app)
      .post('/api/v1/subscriptions')
      .send({
        organisationName: 'Scale Flow',
        organisationDomain: 'scaleflow.com',
        industry: 'FinTech',
        companySize: '51-200',
        adminName: 'Bob Vance',
        adminEmail: 'bob@scaleflow.com',
        planCode: 'RECRUITMENT_ADVANCED',
        billingCycle: 'MONTHLY'
      });
    expect(advRes.status).toBe(201);
    expect(advRes.body.data.amountCents).toBe(199900);
    expect(advRes.body.data.currency).toBe('INR');
    expect(advRes.body.data.paymentInstructions.amountFormatted).toContain('1,999');

    // 3. Enterprise Annual
    const entRes = await request(app)
      .post('/api/v1/subscriptions')
      .send({
        organisationName: 'Titan Enterprise Global',
        organisationDomain: 'titan-global.com',
        industry: 'Manufacturing',
        companySize: '500+',
        adminName: 'Clara Oswald',
        adminEmail: 'clara@titan-global.com',
        planCode: 'RECRUITMENT_ENTERPRISE',
        billingCycle: 'ANNUAL'
      });
    expect(entRes.status).toBe(201);
    expect(entRes.body.data.amountCents).toBe(4999900);
    expect(entRes.body.data.currency).toBe('INR');
    expect(entRes.body.data.paymentInstructions.amountFormatted).toContain('49,999');
  });

  it('activates 15-day free trial with correct duration, timestamps, and Org Admin credentials', async () => {
    const trialRes = await request(app)
      .post('/api/v1/subscriptions/trial')
      .send({
        organisationName: 'Quantum Dynamics Inc',
        organisationDomain: 'quantumdynamics.tech',
        industry: 'Quantum Computing',
        companySize: '11-50',
        adminName: 'David Bowman',
        adminEmail: 'david@quantumdynamics.tech',
        password: 'Password123!'
      });

    expect(trialRes.status).toBe(201);
    expect(trialRes.body.success).toBe(true);

    const data = trialRes.body.data;
    expect(data.subscription.status).toBe('TRIAL');
    expect(data.subscription.amountCents).toBe(0);
    expect(data.subscription.currency).toBe('INR');
    expect(data.subscription.organisationId).toBeTruthy();

    // Verify 15-day duration math
    const startsAt = new Date(data.subscription.startsAt);
    const expiresAt = new Date(data.subscription.expiresAt);
    const diffDays = Math.round((expiresAt - startsAt) / (24 * 60 * 60 * 1000));
    expect(diffDays).toBe(15);
    expect(data.trial.daysRemaining).toBe(15);

    // Verify auth token and user
    expect(data.token).toBeTruthy();
    expect(data.user.email).toBe('david@quantumdynamics.tech');
    expect(data.user.roles).toContain('ORGANISATION_ADMIN');
  });

  it('rejects duplicate 15-day free trial activation for the same domain or email with HTTP 409', async () => {
    // First activation succeeds
    const firstRes = await request(app)
      .post('/api/v1/subscriptions/trial')
      .send({
        organisationName: 'Nebula Analytics',
        organisationDomain: 'nebulaanalytics.io',
        adminName: 'Nadia Ray',
        adminEmail: 'nadia@nebulaanalytics.io'
      });
    expect(firstRes.status).toBe(201);

    // Duplicate by same domain fails
    const dupDomainRes = await request(app)
      .post('/api/v1/subscriptions/trial')
      .send({
        organisationName: 'Nebula Analytics Different Name',
        organisationDomain: 'nebulaanalytics.io',
        adminName: 'Other Person',
        adminEmail: 'other@nebulaanalytics.io'
      });
    expect(dupDomainRes.status).toBe(409);
    expect(dupDomainRes.body.error.code).toBe('TRIAL_ALREADY_USED');

    // Duplicate by same admin email fails
    const dupEmailRes = await request(app)
      .post('/api/v1/subscriptions/trial')
      .send({
        organisationName: 'Another Org Entirely',
        organisationDomain: 'anotherorg123.com',
        adminName: 'Nadia Ray',
        adminEmail: 'nadia@nebulaanalytics.io'
      });
    expect(dupEmailRes.status).toBe(409);
    expect(dupEmailRes.body.error.code).toBe('TRIAL_ALREADY_USED');
  });

  it('enforces server-side trial expiry: active trial permits access, expired trial blocks with HTTP 403 TRIAL_EXPIRED', async () => {
    // 1. Activate trial
    const trialRes = await request(app)
      .post('/api/v1/subscriptions/trial')
      .send({
        organisationName: 'Aero Vanguard',
        organisationDomain: 'aerovanguard.org',
        adminName: 'Neil Armstrong',
        adminEmail: 'neil@aerovanguard.org'
      });
    expect(trialRes.status).toBe(201);

    const orgId = trialRes.body.data.subscription.organisationId;
    const adminToken = trialRes.body.data.token;

    // Active trial: can query current subscription status
    const currentRes = await request(app)
      .get('/api/v1/subscriptions/current')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(currentRes.status).toBe(200);
    expect(currentRes.body.data.isTrial).toBe(true);
    expect(currentRes.body.data.isExpired).toBe(false);
    expect(currentRes.body.data.daysRemaining).toBe(15);

    // Active trial: can access organisation job route
    const jobsRes = await request(app)
      .get('/api/v1/jobs')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(jobsRes.status).toBe(200);

    // 2. Simulate trial expiry in database
    const { Subscription } = getModels();
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago
    await Subscription.update(
      { expiresAt: pastDate },
      { where: { organisationId: orgId } }
    );

    // Verify current subscription reports expired
    const expiredStatusRes = await request(app)
      .get('/api/v1/subscriptions/current')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(expiredStatusRes.status).toBe(200);
    expect(expiredStatusRes.body.data.isExpired).toBe(true);
    expect(expiredStatusRes.body.data.daysRemaining).toBe(0);

    // 3. Backend authorization enforcement: tenantIsolation blocks expired trial
    const blockedJobsRes = await request(app)
      .get('/api/v1/jobs')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(blockedJobsRes.status).toBe(403);
    expect(blockedJobsRes.body.error.code).toBe('TRIAL_EXPIRED');
    expect(blockedJobsRes.body.error.message).toContain('Organisation 15-day free trial has expired');
  });

  it('validates Treasury environment configuration: safe unavailable response when unconfigured, masked details when configured, and proof blocking', async () => {
    // 1. Temporarily unset treasury configuration
    const savedTreasury = {
      bankName: process.env.TREASURY_BANK_NAME,
      accountNumber: process.env.TREASURY_ACCOUNT_NUMBER,
      ifscCode: process.env.TREASURY_IFSC_CODE,
      upiId: process.env.TREASURY_UPI_ID,
      beneficiaryName: process.env.TREASURY_BENEFICIARY_NAME
    };
    delete process.env.TREASURY_BANK_NAME;
    delete process.env.TREASURY_ACCOUNT_NUMBER;
    delete process.env.TREASURY_IFSC_CODE;
    delete process.env.TREASURY_UPI_ID;
    delete process.env.TREASURY_BENEFICIARY_NAME;

    const unconfRes = await request(app)
      .post('/api/v1/subscriptions')
      .send({
        organisationName: 'Unconfigured Treasury Corp',
        organisationDomain: 'unconfigured-treasury.io',
        industry: 'Security',
        companySize: '1-50',
        adminName: 'Victor Stone',
        adminEmail: 'victor@unconfigured-treasury.io',
        planCode: 'RECRUITMENT_BASIC',
        billingCycle: 'ANNUAL'
      });

    expect(unconfRes.status).toBe(201);
    const unconfInst = unconfRes.body.data.paymentInstructions;
    expect(unconfInst.isAvailable).toBe(false);
    expect(unconfInst.unavailableReason).toBe(
      'Payment instructions are temporarily unavailable. Please contact the platform administrator.'
    );
    expect(unconfInst.bankName).toBeUndefined();
    expect(unconfInst.accountNumberMasked).toBeUndefined();
    expect(unconfInst.ifscCode).toBeUndefined();
    expect(unconfInst.paymentMemo).toBeTruthy();

    // Verify submitting payment proof against unconfigured treasury is blocked
    const blockedProofRes = await request(app)
      .post(`/api/v1/subscriptions/${unconfRes.body.data.id}/payments`)
      .field('paymentReference', 'BLOCKED-REF-2026')
      .field('paymentMethod', 'WIRE_TRANSFER');

    expect(blockedProofRes.status).toBe(400);
    expect(blockedProofRes.body.error.code).toBe('PAYMENT_DETAILS_UNAVAILABLE');
    expect(blockedProofRes.body.error.message).toContain(
      'Payment instructions are temporarily unavailable. Please contact the platform administrator.'
    );

    // 2. Restore treasury configuration with verified values
    process.env.TREASURY_BANK_NAME = 'Axis Bank - Corporate Treasury';
    process.env.TREASURY_ACCOUNT_NUMBER = '919020048123456';
    process.env.TREASURY_IFSC_CODE = 'UTIB0000040';
    process.env.TREASURY_UPI_ID = 'nexnuv@axis';
    process.env.TREASURY_BENEFICIARY_NAME = 'NEXNUV Cloud Solutions Pvt. Ltd.';

    const confRes = await request(app)
      .post('/api/v1/subscriptions')
      .send({
        organisationName: 'Configured Treasury Corp',
        organisationDomain: 'configured-treasury.io',
        industry: 'FinTech',
        companySize: '51-200',
        adminName: 'Diana Prince',
        adminEmail: 'diana@configured-treasury.io',
        planCode: 'RECRUITMENT_ADVANCED',
        billingCycle: 'ANNUAL'
      });

    expect(confRes.status).toBe(201);
    const confInst = confRes.body.data.paymentInstructions;
    expect(confInst.isAvailable).toBe(true);
    expect(confInst.bankName).toBe('Axis Bank - Corporate Treasury');
    expect(confInst.accountName).toBe('NEXNUV Cloud Solutions Pvt. Ltd.');
    expect(confInst.accountNumberMasked).toBe('****3456');
    expect(confInst.ifscCode).toBe('UTIB0000040');
    expect(confInst.upiId).toBe('nexnuv@axis');
    expect(confInst.paymentMemo).toBeTruthy();

    // Verify status endpoint also returns safe instructions without exposing mock strings
    const statusRes = await request(app).get(`/api/v1/subscriptions/${confRes.body.data.id}`);
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.data.paymentInstructions.isAvailable).toBe(true);
    expect(statusRes.body.data.paymentInstructions.bankName).toBe('Axis Bank - Corporate Treasury');

    // Restore original env
    Object.assign(process.env, savedTreasury);
  });
});
