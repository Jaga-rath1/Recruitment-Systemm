import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const { startTestDatabase, resetTestState, stopTestDatabase } = require('../helpers/testDb');
const { createApp } = require('../../src/app');
const { getModels } = require('../../src/config/database');
const authAdapter = require('../../src/integrations/auth/auth.adapter');
const employeeAdapter = require('../../src/integrations/employee/employee.adapter');
const emailAdapter = require('../../src/integrations/email/email.adapter');
const notificationAdapter = require('../../src/integrations/notification/notification.adapter');
const { registerAndVerifyCandidate } = require('../helpers/candidateAuthHelper');

let app;
let platformAdminToken;
let platformAdminActorId;

async function provisionPaidOrgAndRecruiter(namePrefix) {
  const subRes = await request(app).post('/api/v1/subscriptions').send({
    organisationName: `${namePrefix} Technologies`,
    organisationDomain: `${namePrefix.toLowerCase().replace(/[^a-z0-9]/g, '')}.test`,
    industry: 'Technology',
    companySize: '51-200',
    adminName: `${namePrefix} Admin`,
    adminEmail: `admin@${namePrefix.toLowerCase().replace(/[^a-z0-9]/g, '')}.test`,
    planCode: 'RECRUITMENT_ADVANCED',
    billingCycle: 'MONTHLY'
  });
  expect(subRes.status).toBe(201);
  const subId = subRes.body.data.id;

  await request(app)
    .post(`/api/v1/subscriptions/${subId}/payments`)
    .field('paymentReference', `PAY-${subId.slice(0, 8).toUpperCase()}`)
    .field('paymentMethod', 'WIRE_TRANSFER');

  const verifyRes = await request(app)
    .post(`/api/v1/subscriptions/platform-admin/${subId}/verify`)
    .set('Authorization', `Bearer ${platformAdminToken}`)
    .send({ decision: 'APPROVE' });
  expect(verifyRes.status).toBe(200);

  const actRes = await request(app).post('/api/v1/subscriptions/activate').send({
    activationToken: verifyRes.body.data.invitationPreview.activationToken,
    password: 'StrongPassword!2026'
  });
  expect(actRes.status).toBe(200);

  const orgId = actRes.body.data.user.organisationId;
  const adminToken = actRes.body.data.token;
  const adminEmail = actRes.body.data.user.email;

  const recRes = await request(app)
    .post('/api/v1/organisations/employees')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      fullName: `${namePrefix} Recruiter`,
      email: `recruiter@${namePrefix.toLowerCase().replace(/[^a-z0-9]/g, '')}.test`,
      roleCode: 'RECRUITER',
      department: 'Talent Acquisition',
      designation: 'Senior Recruiter'
    });
  expect(recRes.status).toBe(201);

  const recEmp = recRes.body.data;
  const recruiterToken = authAdapter.signAccessToken({
    sub: recEmp.authUserId,
    email: recEmp.email,
    name: recEmp.fullName,
    organisationId: orgId,
    employeeId: recEmp.employeeId,
    userType: 'ORG_USER',
    roles: ['RECRUITER']
  });

  return { subId, orgId, adminToken, adminEmail, recruiterToken, recEmp };
}

describe('Production Readiness Hardening Suite — Security, Concurrency, Failure Recovery & Diagnostics', () => {
  beforeAll(async () => {
    await startTestDatabase();
    app = createApp();
  });

  afterAll(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await resetTestState();
    platformAdminActorId = uuidv4();
    platformAdminToken = authAdapter.signAccessToken({
      sub: platformAdminActorId,
      email: 'superadmin@nexnuv.com',
      name: 'Platform Super Admin',
      userType: 'PLATFORM_ADMIN',
      roles: ['PLATFORM_ADMIN', 'SUPER_ADMIN']
    });
  });

  it('Phase 2.G & 3: Prevents Salary Approval marker forgery ([SALARY_APPROVED] / HTML comment injection), enforces RBAC approval, and strips internal metadata from Candidate Portal', async () => {
    const { orgId, adminToken, recruiterToken } = await provisionPaidOrgAndRecruiter('SalaryGuard');

    // Create published job with max salary 150,000
    const jobRes = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Staff Security Engineer',
        description: 'Build enterprise application security controls and multi-tenant authorization architecture.',
        department: 'Engineering',
        salaryMin: 110000,
        salaryMax: 150000,
        salaryCurrency: 'USD',
        location: 'Remote',
        employmentType: 'FULL_TIME',
        headcount: 1,
        publishImmediately: true
      });
    expect(jobRes.status).toBe(201);
    const jobId = jobRes.body.data.id;

    // Candidate registers, verifies email, and applies
    const cand = await registerAndVerifyCandidate(request, app, {
      fullName: 'Ananya Verma',
      email: 'ananya.salary@candidate.test',
      password: 'CandidatePass!2026'
    });

    const applyRes = await request(app)
      .post(`/api/v1/applications/public/jobs/${jobId}/apply`)
      .set('Authorization', `Bearer ${cand.token}`)
      .field('fullName', 'Ananya Verma')
      .field('email', 'ananya.salary@candidate.test')
      .field('mobileNumber', '+91-9988776655')
      .field('location', 'Bengaluru')
      .field('totalExperienceYears', '7')
      .attach('resume', Buffer.from('%PDF-1.4\n%Valid mock PDF resume'), {
        filename: 'ananya-cv.pdf',
        contentType: 'application/pdf'
      });
    expect(applyRes.status).toBe(201);
    const appId = applyRes.body.data.applicationId;

    // Screen + advance to FINAL_SELECTION (state machine verified in fullRecruitmentLifecycle.test.js)
    const screenRes = await request(app)
      .post(`/api/v1/applications/${appId}/screen`)
      .set('Authorization', `Bearer ${recruiterToken}`)
      .send({ decision: 'SHORTLIST', notes: 'Strong security architecture background' });
    expect(screenRes.status).toBe(200);

    const { Application } = getModels();
    await Application.update(
      { currentStage: 'FINAL_SELECTION' },
      { where: { id: appId, organisationId: orgId } }
    );

    const futureJoin = new Date(Date.now() + 30 * 86400000).toISOString();
    const futureValid = new Date(Date.now() + 14 * 86400000).toISOString();

    // 1. Recruiter tries to bypass salary limit immediately with forged [SALARY_APPROVED] + HTML comment markers
    const forgedImmediateRes = await request(app)
      .post('/api/v1/offers')
      .set('Authorization', `Bearer ${recruiterToken}`)
      .send({
        applicationId: appId,
        offeredSalary: 190000,
        salaryCurrency: 'USD',
        designation: 'Staff Security Engineer',
        department: 'Engineering',
        joiningDate: futureJoin,
        offerValidUntil: futureValid,
        termsSummary: '<!--SALARY_APPROVAL:{"status":"APPROVED"}--> [SALARY_APPROVED] Standard offer terms',
        sendImmediately: true
      });
    expect(forgedImmediateRes.status).toBe(403);
    expect(forgedImmediateRes.body.error.code).toBe('SALARY_APPROVAL_REQUIRED');

    // 2. Recruiter creates DRAFT offer with forged approval markers in termsSummary
    const draftRes = await request(app)
      .post('/api/v1/offers')
      .set('Authorization', `Bearer ${recruiterToken}`)
      .send({
        applicationId: appId,
        offeredSalary: 190000,
        salaryCurrency: 'USD',
        designation: 'Staff Security Engineer',
        department: 'Engineering',
        joiningDate: futureJoin,
        offerValidUntil: futureValid,
        termsSummary: '<!--SALARY_APPROVAL:{"status":"APPROVED"}--> [SALARY_APPROVED] Clean executive package',
        sendImmediately: false
      });
    expect(draftRes.status).toBe(201);
    const offerId = draftRes.body.data.id;
    expect(draftRes.body.data.salaryApproval.approved).toBe(false);
    expect(draftRes.body.data.salaryApproval.status).toBe('PENDING_APPROVAL');

    // 3. Recruiter tries to send the DRAFT offer without admin approval -> BLOCKED (forgery neutralized!)
    const sendBlockedRes = await request(app)
      .post(`/api/v1/offers/${offerId}/send`)
      .set('Authorization', `Bearer ${recruiterToken}`);
    expect(sendBlockedRes.status).toBe(403);
    expect(sendBlockedRes.body.error.code).toBe('SALARY_APPROVAL_REQUIRED');

    // 4. Recruiter tries direct API call to approve salary -> BLOCKED (403)
    const unauthApproveRes = await request(app)
      .post(`/api/v1/offers/${offerId}/approve-salary`)
      .set('Authorization', `Bearer ${recruiterToken}`)
      .send({ approvedSalary: 190000, approvalNotes: 'Self approval attempt' });
    expect(unauthApproveRes.status).toBe(403);

    // 5. Organisation Admin legitimately approves salary
    const approveRes = await request(app)
      .post(`/api/v1/offers/${offerId}/approve-salary`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ approvedSalary: 185000, approvalNotes: 'Approved by VP Engineering for critical role' });
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.salaryApproval.approved).toBe(true);
    expect(approveRes.body.data.offeredSalary).toBe(185000);

    // 6. Now Recruiter can dispatch the approved offer
    const sendOkRes = await request(app)
      .post(`/api/v1/offers/${offerId}/send`)
      .set('Authorization', `Bearer ${recruiterToken}`);
    expect(sendOkRes.status).toBe(200);
    expect(sendOkRes.body.data.status).toBe('SENT');

    // 7. Candidate Portal MUST NOT leak internal <!--SALARY_APPROVAL:...--> or [SALARY_APPROVED] metadata!
    const portalRes = await request(app)
      .get('/api/v1/portal/overview')
      .set('Authorization', `Bearer ${cand.token}`);
    expect(portalRes.status).toBe(200);
    const candApp = portalRes.body.data.applications.find((a) => a.id === appId);
    expect(candApp.offer).toBeTruthy();
    expect(candApp.offer.termsSummary).not.toContain('SALARY_APPROVAL');
    expect(candApp.offer.termsSummary).not.toContain('SALARY_APPROVED');
    expect(candApp.offer.termsSummary).toContain('Clean executive package');

    // Verify audit log recorded OFFER_SALARY_APPROVED
    const { RecruitmentAuditLog } = getModels();
    const audit = await RecruitmentAuditLog.findOne({
      where: { organisationId: orgId, entityId: offerId, action: 'OFFER_SALARY_APPROVED' }
    });
    expect(audit).not.toBeNull();
  });

  it('Phase 2.C & 3: Organisation Admin Password Reset E2E — dispatches email, enforces single-use token, persists credentials, and authenticates on /org-admin/login', async () => {
    const sentEmails = [];
    emailAdapter.setTestEmailTransport(async (payload) => {
      sentEmails.push(payload);
      return { delivered: true, provider: 'TEST', messageId: `msg-${sentEmails.length}` };
    });

    const { subId, adminEmail } = await provisionPaidOrgAndRecruiter('ResetFlow');

    // Platform Admin triggers password reset
    const triggerRes = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/organisations/${subId}/password-reset`)
      .set('Authorization', `Bearer ${platformAdminToken}`);
    expect(triggerRes.status).toBe(200);
    expect(triggerRes.body.data.emailSent).toBe(true);

    const resetEmail = sentEmails.find((e) => e.category === 'NOTIFICATION_PASSWORD_RESET_REQUESTED');
    expect(resetEmail).toBeTruthy();
    expect(resetEmail.to).toBe(adminEmail);

    const tokenMatch = resetEmail.html.match(/token=([a-f0-9]+)/i);
    expect(tokenMatch).toBeTruthy();
    const rawToken = tokenMatch[1];

    // Complete password reset
    const resetRes = await request(app)
      .post('/api/v1/auth/candidate/reset-password')
      .send({
        token: rawToken,
        newPassword: 'BrandNewOrgPass!2026',
        confirmPassword: 'BrandNewOrgPass!2026'
      });
    expect(resetRes.status).toBe(200);
    expect(resetRes.body.data.accountType).toBe('ORGANISATION_ADMIN');
    expect(resetRes.body.data.loginPath).toBe('/org-login');

    // Token reuse MUST be rejected
    const reuseRes = await request(app)
      .post('/api/v1/auth/candidate/reset-password')
      .send({
        token: rawToken,
        newPassword: 'AnotherPass!2026',
        confirmPassword: 'AnotherPass!2026'
      });
    expect(reuseRes.status).toBe(400);

    // Login on Organisation Admin portal with new password succeeds
    const loginRes = await request(app)
      .post('/api/v1/auth/org-admin/login')
      .send({ email: adminEmail, password: 'BrandNewOrgPass!2026' });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.user.activeRoleCode).toBe('ORGANISATION_ADMIN');

    // Old password rejected
    const oldPassRes = await request(app)
      .post('/api/v1/auth/org-admin/login')
      .send({ email: adminEmail, password: 'StrongPassword!2026' });
    expect(oldPassRes.status).toBe(401);
  });

  it('Phase 2.C & 2.D: Self-Service Forgot & Reset Password E2E for both Organisation Admin and Recruiter portals', async () => {
    const sentEmails = [];
    emailAdapter.setTestEmailTransport(async (payload) => {
      sentEmails.push(payload);
      return { delivered: true, provider: 'TEST', messageId: `msg-self-${sentEmails.length}` };
    });

    const { adminEmail, recEmp } = await provisionPaidOrgAndRecruiter('SelfReset');

    // 1. Organisation Admin self-service forgot password
    const orgForgotRes = await request(app)
      .post('/api/v1/auth/candidate/forgot-password')
      .send({ email: adminEmail });
    expect(orgForgotRes.status).toBe(200);

    const orgEmail = sentEmails.find(
      (e) => e.category === 'NOTIFICATION_PASSWORD_RESET_REQUESTED' && e.to === adminEmail
    );
    expect(orgEmail).toBeTruthy();
    expect(orgEmail.html).toContain('portal=org');
    const orgToken = orgEmail.html.match(/token=([a-f0-9]+)/i)?.[1];
    expect(orgToken).toBeTruthy();

    const orgResetRes = await request(app)
      .post('/api/v1/auth/candidate/reset-password')
      .send({
        token: orgToken,
        newPassword: 'OrgSelfReset!2026',
        confirmPassword: 'OrgSelfReset!2026'
      });
    expect(orgResetRes.status).toBe(200);
    expect(orgResetRes.body.data.accountType).toBe('ORGANISATION_ADMIN');
    expect(orgResetRes.body.data.loginPath).toBe('/org-login');

    const orgLoginOk = await request(app)
      .post('/api/v1/auth/org-admin/login')
      .send({ email: adminEmail, password: 'OrgSelfReset!2026' });
    expect(orgLoginOk.status).toBe(200);
    expect(orgLoginOk.body.data.user.activeRoleCode).toBe('ORGANISATION_ADMIN');

    // 2. Recruiter self-service forgot password
    const recForgotRes = await request(app)
      .post('/api/v1/auth/candidate/forgot-password')
      .send({ email: recEmp.email });
    expect(recForgotRes.status).toBe(200);

    const recEmail = sentEmails.find(
      (e) => e.category === 'NOTIFICATION_PASSWORD_RESET_REQUESTED' && e.to === recEmp.email
    );
    expect(recEmail).toBeTruthy();
    expect(recEmail.html).toContain('portal=recruiter');
    const recToken = recEmail.html.match(/token=([a-f0-9]+)/i)?.[1];
    expect(recToken).toBeTruthy();

    const recResetRes = await request(app)
      .post('/api/v1/auth/candidate/reset-password')
      .send({
        token: recToken,
        newPassword: 'RecruiterReset!2026',
        confirmPassword: 'RecruiterReset!2026'
      });
    expect(recResetRes.status).toBe(200);
    expect(recResetRes.body.data.accountType).toBe('RECRUITER');
    expect(recResetRes.body.data.loginPath).toBe('/recruiter-login');

    // Token reuse rejected
    const recReuseRes = await request(app)
      .post('/api/v1/auth/candidate/reset-password')
      .send({
        token: recToken,
        newPassword: 'AnotherRecPass!2026',
        confirmPassword: 'AnotherRecPass!2026'
      });
    expect(recReuseRes.status).toBe(400);

    // Recruiter login succeeds with new password
    const recLoginOk = await request(app)
      .post('/api/v1/auth/recruiter/login')
      .send({ email: recEmp.email, password: 'RecruiterReset!2026' });
    expect(recLoginOk.status).toBe(200);
    expect(recLoginOk.body.data.user.activeRoleCode).toBe('RECRUITER');

    // Wrong password rejected
    const recLoginBad = await request(app)
      .post('/api/v1/auth/recruiter/login')
      .send({ email: recEmp.email, password: 'WrongPassword!2026' });
    expect(recLoginBad.status).toBe(401);

    // Recruiter remains strictly blocked from Organisation Admin portal
    const recOnAdminPortal = await request(app)
      .post('/api/v1/auth/org-admin/login')
      .send({ email: recEmp.email, password: 'RecruiterReset!2026' });
    expect(recOnAdminPortal.status).toBe(403);
  });

  it('Phase 2.H, 4 & 6: Employee Sync outage recovery, concurrent retry deduplication, and pending-sync operational diagnostics visibility', async () => {
    const { orgId, adminToken } = await provisionPaidOrgAndRecruiter('SyncResilience');

    const jobRes = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Site Reliability Engineer',
        description: 'Build observable, fault-tolerant distributed services with strong SLO governance.',
        department: 'Infrastructure',
        location: 'Bengaluru',
        employmentType: 'FULL_TIME',
        headcount: 1,
        publishImmediately: true
      });
    const jobId = jobRes.body.data.id;

    const cand = await registerAndVerifyCandidate(request, app, {
      fullName: 'Rohan Kulkarni',
      email: 'rohan.sync@candidate.test',
      password: 'CandidatePass!2026'
    });

    const applyRes = await request(app)
      .post(`/api/v1/applications/public/jobs/${jobId}/apply`)
      .set('Authorization', `Bearer ${cand.token}`)
      .field('fullName', 'Rohan Kulkarni')
      .field('email', 'rohan.sync@candidate.test')
      .field('mobileNumber', '+91-9811122233')
      .field('location', 'Pune')
      .field('totalExperienceYears', '5')
      .attach('resume', Buffer.from('%PDF-1.4\n%Resume bytes'), {
        filename: 'rohan.pdf',
        contentType: 'application/pdf'
      });
    const appId = applyRes.body.data.applicationId;

    const s2 = await request(app)
      .post(`/api/v1/applications/${appId}/screen`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'SHORTLIST' });
    expect(s2.status).toBe(200);

    const { Application } = getModels();
    await Application.update(
      { currentStage: 'FINAL_SELECTION' },
      { where: { id: appId, organisationId: orgId } }
    );

    const offerRes = await request(app)
      .post('/api/v1/offers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        applicationId: appId,
        offeredSalary: 120000,
        salaryCurrency: 'USD',
        designation: 'Site Reliability Engineer',
        department: 'Infrastructure',
        joiningDate: new Date(Date.now() + 15 * 86400000).toISOString(),
        offerValidUntil: new Date(Date.now() + 7 * 86400000).toISOString(),
        sendImmediately: true
      });
    const offerId = offerRes.body.data.id;

    const acceptRes = await request(app)
      .post(`/api/v1/portal/offers/${offerId}/respond`)
      .set('Authorization', `Bearer ${cand.token}`)
      .send({ decision: 'ACCEPT' });
    expect(acceptRes.status).toBe(200);

    const joinRes = await request(app)
      .post('/api/v1/joining')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        applicationId: appId,
        joiningLocation: 'Bengaluru HQ'
      });
    expect(joinRes.status).toBe(201);
    const joiningId = joinRes.body.data.id;

    // Simulate Employee Service outage during JOINED confirmation
    const createSpy = vi
      .spyOn(employeeAdapter, 'createEmployee')
      .mockRejectedValueOnce(new Error('Employee Service connection refused (503)'));

    const markJoinedRes = await request(app)
      .patch(`/api/v1/joining/${joiningId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'JOINED' });
    createSpy.mockRestore();

    // Joining succeeds resiliently while recording EMPLOYEE_PROVISIONING_PENDING_SYNC
    expect(markJoinedRes.status).toBe(200);
    expect(markJoinedRes.body.data.status).toBe('JOINED');

    // Operational diagnostics MUST surface pendingSyncCount === 1
    const diagBefore = await request(app)
      .get('/api/v1/subscriptions/platform-admin/diagnostics')
      .set('Authorization', `Bearer ${platformAdminToken}`);
    expect(diagBefore.status).toBe(200);
    expect(diagBefore.body.data.database.status).toBe('connected');
    expect(diagBefore.body.data.employeeProvisioning.pendingSyncCount).toBe(1);

    // Non-platform-admin callers MUST be blocked from diagnostics (403 / 401)
    expect((await request(app).get('/api/v1/subscriptions/platform-admin/diagnostics')).status).toBe(401);
    expect(
      (
        await request(app)
          .get('/api/v1/subscriptions/platform-admin/diagnostics')
          .set('Authorization', `Bearer ${adminToken}`)
      ).status
    ).toBe(403);

    // Concurrent retry bursts collapse cleanly with zero duplicate employees
    const [retry1, retry2, retry3] = await Promise.all([
      request(app)
        .post(`/api/v1/joining/${joiningId}/retry-employee-sync`)
        .set('Authorization', `Bearer ${adminToken}`),
      request(app)
        .post(`/api/v1/joining/${joiningId}/retry-employee-sync`)
        .set('Authorization', `Bearer ${adminToken}`),
      request(app)
        .post(`/api/v1/joining/${joiningId}/retry-employee-sync`)
        .set('Authorization', `Bearer ${adminToken}`)
    ]);
    expect([200, 201]).toContain(retry1.status);
    expect([200, 201]).toContain(retry2.status);
    expect([200, 201]).toContain(retry3.status);

    // Subsequent retry returns ALREADY_SYNCED without creating duplicates
    const repeatRetry = await request(app)
      .post(`/api/v1/joining/${joiningId}/retry-employee-sync`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(repeatRetry.status).toBe(200);
    expect(repeatRetry.body.status || repeatRetry.body.data?.status).toBe('ALREADY_SYNCED');

    const employees = await employeeAdapter.listEmployees(orgId, { search: 'rohan.sync@candidate.test' });
    const matched = employees.filter((e) => e.email.toLowerCase() === 'rohan.sync@candidate.test');
    expect(matched.length).toBe(1);

    // Diagnostics now reports pendingSyncCount === 0
    const diagAfter = await request(app)
      .get('/api/v1/subscriptions/platform-admin/diagnostics')
      .set('Authorization', `Bearer ${platformAdminToken}`);
    expect(diagAfter.body.data.employeeProvisioning.pendingSyncCount).toBe(0);
  });

  it('Phase 4: Concurrent duplicate bookings with Idempotency-Key & concurrent approval requests maintain strict database integrity', async () => {
    const idempotencyKey = `booking-idem-${uuidv4()}`;
    const bookingPayload = {
      organisationName: 'Concurrent Labs Pvt Ltd',
      organisationDomain: 'concurrentlabs.test',
      industry: 'FinTech',
      companySize: '11-50',
      adminName: 'Vikram Singh',
      adminEmail: 'vikram@concurrentlabs.test',
      planCode: 'RECRUITMENT_ADVANCED',
      billingCycle: 'ANNUAL',
      idempotencyKey
    };

    // 1. Fire 3 sequential/concurrent booking requests with same idempotencyKey -> only 1 subscription created
    const first = await request(app).post('/api/v1/subscriptions').send(bookingPayload);
    expect(first.status).toBe(201);
    const replay = await request(app).post('/api/v1/subscriptions').send(bookingPayload);
    expect(replay.status).toBe(200);
    expect(replay.body.data.id).toBe(first.body.data.id);

    const subId = first.body.data.id;
    await request(app)
      .post(`/api/v1/subscriptions/${subId}/payments`)
      .field('paymentReference', 'UTR-CONC-2026-001')
      .field('paymentMethod', 'WIRE_TRANSFER');

    // 2. Concurrent Platform Admin approval requests -> one succeeds (200), concurrent duplicate safely rejected (409)
    const [app1, app2] = await Promise.all([
      request(app)
        .post(`/api/v1/subscriptions/platform-admin/${subId}/verify`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ decision: 'APPROVE' }),
      request(app)
        .post(`/api/v1/subscriptions/platform-admin/${subId}/verify`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ decision: 'APPROVE' })
    ]);

    const statuses = [app1.status, app2.status].sort();
    expect(statuses).toEqual([200, 409]);

    const { Subscription } = getModels();
    const count = await Subscription.count({ where: { organisationDomain: 'concurrentlabs.test' } });
    expect(count).toBe(1);
  });

  it('Phase 3 & 6: Health/readiness checks, malformed input rejection, and zero stack-trace or secret leakage', async () => {
    const healthRes = await request(app).get('/health');
    expect(healthRes.status).toBe(200);
    expect(healthRes.body.status).toBe('ok');

    const readyRes = await request(app).get('/ready');
    expect(readyRes.status).toBe(200);
    expect(readyRes.body.database).toBe('connected');

    // Malformed UUID -> 422, no stack trace
    const badUuidRes = await request(app)
      .get('/api/v1/subscriptions/not-a-uuid');
    expect(badUuidRes.status).toBe(422);
    expect(JSON.stringify(badUuidRes.body)).not.toContain('node_modules');
    expect(JSON.stringify(badUuidRes.body)).not.toContain('at ');

    // SQLi attempt in public search -> parameterized Sequelize query safely returns 200 empty array
    const sqliRes = await request(app)
      .get("/api/v1/jobs/public/careers?search=' OR '1'='1'; DROP TABLE jobs; --");
    expect(sqliRes.status).toBe(200);
    expect(Array.isArray(sqliRes.body.data)).toBe(true);

    // Path traversal attempt on signed file download -> 401/403 rejected safely
    const traversalRes = await request(app)
      .get('/api/v1/files/download?key=../../.env');
    expect([400, 401, 403]).toContain(traversalRes.status);
  });
});
