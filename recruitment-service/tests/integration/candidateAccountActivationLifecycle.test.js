import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const { startTestDatabase, resetTestState, stopTestDatabase } = require('../helpers/testDb');
const { createEmailCaptureHarness } = require('../helpers/candidateAuthHelper');
const { createApp } = require('../../src/app');
const env = require('../../src/config/env');
const { getModels } = require('../../src/config/database');
const authAdapter = require('../../src/integrations/auth/auth.adapter');
const candidateIdentityService = require('../../src/modules/candidate/candidateIdentity.service');
const offerRepo = require('../../src/modules/offer/offer.repository');

let app;
let emailCapture;

async function setupTenantAndJob(orgName, prefix) {
  const platformToken = authAdapter.signAccessToken({
    sub: uuidv4(),
    email: 'pa@nexnuv.com',
    name: 'Platform Admin',
    userType: 'PLATFORM_ADMIN',
    roles: ['PLATFORM_ADMIN']
  });

  const subRes = await request(app).post('/api/v1/subscriptions').send({
    organisationName: orgName,
    organisationDomain: `${prefix}.io`,
    industry: 'Engineering',
    companySize: '50-200',
    adminName: `${orgName} Admin`,
    adminEmail: `admin@${prefix}.io`
  });
  const subId = subRes.body.data.id;

  await request(app)
    .post(`/api/v1/subscriptions/${subId}/payments`)
    .field('paymentReference', `PAY-${subId.slice(0, 8)}`)
    .field('paymentMethod', 'WIRE_TRANSFER');

  const verifyRes = await request(app)
    .post(`/api/v1/subscriptions/platform-admin/${subId}/verify`)
    .set('Authorization', `Bearer ${platformToken}`)
    .send({ decision: 'APPROVE' });

  const actRes = await request(app).post('/api/v1/subscriptions/activate').send({
    activationToken: verifyRes.body.data.invitationPreview.activationToken,
    password: 'AdminPassword#2026'
  });

  const organisationId = actRes.body.data.user.organisationId;
  const adminToken = actRes.body.data.token;

  const empRes = await request(app)
    .post('/api/v1/organisations/employees')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      fullName: 'Head Recruiter',
      email: `recruiter@${prefix}.io`,
      roleCode: 'RECRUITER',
      department: 'Talent',
      designation: 'Recruiting Lead'
    });
  const recruiter = empRes.body.data;
  const recruiterToken = authAdapter.signAccessToken({
    sub: recruiter.authUserId,
    email: recruiter.email,
    name: recruiter.fullName,
    organisationId,
    employeeId: recruiter.employeeId,
    userType: 'ORG_USER',
    roles: ['RECRUITER']
  });

  // Create published job 1
  const job1Res = await request(app)
    .post('/api/v1/jobs')
    .set('Authorization', `Bearer ${recruiterToken}`)
    .send({
      title: 'Senior Software Engineer',
      description: 'Design and build resilient distributed systems.',
      department: 'Engineering',
      skills: ['Node.js', 'PostgreSQL', 'Cloud'],
      experienceMinYears: 5,
      experienceMaxYears: 10,
      salaryMin: 120000,
      salaryMax: 160000,
      location: 'Remote',
      employmentType: 'FULL_TIME',
      headcount: 2,
      publishImmediately: true
    });

  // Create published job 2
  const job2Res = await request(app)
    .post('/api/v1/jobs')
    .set('Authorization', `Bearer ${recruiterToken}`)
    .send({
      title: 'DevOps Engineer',
      description: 'Manage cloud infrastructure and CI/CD pipelines.',
      department: 'Infrastructure',
      skills: ['Docker', 'Kubernetes', 'Terraform'],
      experienceMinYears: 3,
      experienceMaxYears: 7,
      salaryMin: 110000,
      salaryMax: 140000,
      location: 'Remote',
      employmentType: 'FULL_TIME',
      headcount: 1,
      publishImmediately: true
    });

  return {
    organisationId,
    adminToken,
    recruiterToken,
    job1Id: job1Res.body.data.id,
    job2Id: job2Res.body.data.id
  };
}

describe('Candidate Account Activation & Login Email Bug Fix Lifecycle', () => {
  beforeAll(async () => {
    await startTestDatabase();
    app = createApp();
  });

  afterAll(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await resetTestState();
    emailCapture = createEmailCaptureHarness();
    candidateIdentityService.clearCandidateCooldownsForTest();
  });

  it('1-3: automatically provisions candidate account and dispatches activation email with correct username, portal URL, and token', async () => {
    const tenant = await setupTenantAndJob('Acme Tech', 'acmetech');

    const candidateEmail = 'sarah.connor@sky.net';
    const candidateName = 'Sarah Connor';

    const applyRes = await request(app)
      .post(`/api/v1/applications/public/jobs/${tenant.job1Id}/apply`)
      .field('fullName', candidateName)
      .field('email', candidateEmail)
      .field('mobileNumber', '+1-555-0101')
      .field('location', 'Los Angeles, CA')
      .field('totalExperienceYears', '6')
      .field('currentCompany', 'Cyberdyne')
      .field('skills', 'Security,Node.js')
      .attach('resume', Buffer.from('%PDF-1.4 Sarah Connor Resume'), {
        filename: 'sarah_resume.pdf',
        contentType: 'application/pdf'
      });

    expect(applyRes.status).toBe(201);
    expect(applyRes.body.data.applicationReference).toBeDefined();

    // Verify 1: CandidateAccount created in DB with pending activation
    const { CandidateAccount, Candidate } = getModels();
    const account = await CandidateAccount.findOne({ where: { email: candidateEmail } });
    expect(account).not.toBeNull();
    expect(account.fullName).toBe(candidateName);
    expect(account.emailVerified).toBe(false);
    expect(account.isActive).toBe(true);
    expect(account.verificationTokenHash).not.toBeNull();
    expect(account.verificationExpiresAt).not.toBeNull();
    expect(new Date(account.verificationExpiresAt).getTime()).toBeGreaterThan(Date.now());

    // Verify Candidate row in recruitment DB was created with authUserId = null until activation
    const candidateRow = await Candidate.findOne({ where: { email: candidateEmail } });
    expect(candidateRow).not.toBeNull();
    expect(candidateRow.authUserId).toBeNull();

    // Verify 2 & 3: Activation email was generated and dispatched
    const activationEmail = emailCapture.getLatestFor(candidateEmail, 'CANDIDATE_ACCOUNT_ACTIVATION') ||
                           emailCapture.getLatestFor(candidateEmail, 'NOTIFICATION_CANDIDATE_ACCOUNT_ACTIVATION');
    expect(activationEmail).not.toBeNull();

    // Verify Username, Candidate Portal login URL, and Activation URL
    expect(activationEmail.text).toContain(candidateEmail);
    expect(activationEmail.text).toContain('/login');
    expect(activationEmail.text).toContain('/activate-candidate?token=');
    expect(activationEmail.text).toContain('expires in 48 hours');

    // Token extraction helper works
    const token = emailCapture.getLatestActivationToken(candidateEmail);
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThanOrEqual(20);
  });

  it('4-7: enforces token expiry, single-use invalidation, password setup, and enables candidate login & portal overview', async () => {
    const tenant = await setupTenantAndJob('Stark Labs', 'starklabs');
    const { CandidateAccount, Candidate } = getModels();

    const candidateEmail = 'peter.parker@dailybugle.com';
    await request(app)
      .post(`/api/v1/applications/public/jobs/${tenant.job1Id}/apply`)
      .field('fullName', 'Peter Parker')
      .field('email', candidateEmail)
      .field('mobileNumber', '+1-555-0102')
      .field('location', 'Queens, NY')
      .field('totalExperienceYears', '4')
      .field('skills', 'Web,Photography')
      .attach('resume', Buffer.from('%PDF-1.4 Peter Parker Resume'), {
        filename: 'peter_resume.pdf',
        contentType: 'application/pdf'
      });

    const token = emailCapture.getLatestActivationToken(candidateEmail);
    expect(token).not.toBeNull();

    // Inspect token endpoint works
    const inspectRes = await request(app)
      .get(`/api/v1/auth/candidate/activate/inspect?token=${encodeURIComponent(token)}`);
    expect(inspectRes.status).toBe(200);
    expect(inspectRes.body.data.email).toBe(candidateEmail);
    expect(inspectRes.body.data.fullName).toBe('Peter Parker');

    // Requirement 4: Test Token Expiry
    const now = new Date();
    await CandidateAccount.update(
      { verificationExpiresAt: new Date(now.getTime() - 60000) },
      { where: { email: candidateEmail } }
    );

    const expiredActivateRes = await request(app)
      .post('/api/v1/auth/candidate/activate')
      .send({
        token,
        password: 'ValidPassword#2026',
        confirmPassword: 'ValidPassword#2026'
      });
    expect(expiredActivateRes.status).toBe(400);
    expect(expiredActivateRes.body.error.code).toBe('INVALID_ACTIVATION_TOKEN');

    // Restore expiration for valid activation
    await CandidateAccount.update(
      { verificationExpiresAt: new Date(now.getTime() + 48 * 3600 * 1000) },
      { where: { email: candidateEmail } }
    );

    // Reject weak password (fails zod schema validation -> 422)
    const weakPassRes = await request(app)
      .post('/api/v1/auth/candidate/activate')
      .send({
        token,
        password: 'weak',
        confirmPassword: 'weak'
      });
    expect([400, 422]).toContain(weakPassRes.status);

    // Requirement 6: Successful password setup
    const newPassword = 'SecretCandidatePass#2026';
    const activateRes = await request(app)
      .post('/api/v1/auth/candidate/activate')
      .send({
        token,
        password: newPassword,
        confirmPassword: newPassword
      });
    expect(activateRes.status).toBe(200);
    expect(activateRes.body.data.activated).toBe(true);

    const refreshedAccount = await CandidateAccount.findOne({ where: { email: candidateEmail } });
    expect(refreshedAccount.emailVerified).toBe(true);
    expect(refreshedAccount.verificationTokenHash).toBeNull();
    expect(refreshedAccount.verificationExpiresAt).toBeNull();

    // Verify candidate row is atomically claimed and bound to account.id upon activation
    const candidateRowAfter = await Candidate.findOne({ where: { email: candidateEmail } });
    expect(candidateRowAfter.authUserId).toBe(refreshedAccount.id);

    // Requirement 5: Single-use token enforcement
    const reusedActivateRes = await request(app)
      .post('/api/v1/auth/candidate/activate')
      .send({
        token,
        password: 'AnotherPassword#2026',
        confirmPassword: 'AnotherPassword#2026'
      });
    expect(reusedActivateRes.status).toBe(400);
    expect(reusedActivateRes.body.error.code).toBe('INVALID_ACTIVATION_TOKEN');

    // Requirement 7: Candidate logs in at /candidate/login with newly set password
    const loginRes = await request(app)
      .post('/api/v1/auth/candidate/login')
      .send({
        email: candidateEmail,
        password: newPassword
      });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.token).toBeDefined();
    expect(loginRes.body.data.user.email).toBe(candidateEmail);
    expect(loginRes.body.data.user.userType).toBe('CANDIDATE');

    const candidateToken = loginRes.body.data.token;

    // Candidate accesses Candidate Portal overview and sees their submitted application
    const portalRes = await request(app)
      .get('/api/v1/portal/overview')
      .set('Authorization', `Bearer ${candidateToken}`);
    expect(portalRes.status).toBe(200);
    expect(portalRes.body.data.applications).toHaveLength(1);
    expect(portalRes.body.data.applications[0].job.title).toBe('Senior Software Engineer');
  });

  it('8: preserves password and avoids duplicate activation email when an already active candidate applies again', async () => {
    const tenant = await setupTenantAndJob('Wayne Corp', 'waynecorp');
    const { CandidateAccount } = getModels();

    const candidateEmail = 'bruce.wayne@wayne.com';
    const originalPassword = 'DarkKnightPass#2026';

    // 1. Initial application
    await request(app)
      .post(`/api/v1/applications/public/jobs/${tenant.job1Id}/apply`)
      .field('fullName', 'Bruce Wayne')
      .field('email', candidateEmail)
      .field('mobileNumber', '+1-555-0999')
      .field('location', 'Gotham City')
      .field('totalExperienceYears', '10')
      .field('skills', 'Martial Arts,Strategy')
      .attach('resume', Buffer.from('%PDF-1.4 Bruce Wayne Resume'), {
        filename: 'bruce_resume.pdf',
        contentType: 'application/pdf'
      });

    const token = emailCapture.getLatestActivationToken(candidateEmail);
    await request(app)
      .post('/api/v1/auth/candidate/activate')
      .send({
        token,
        password: originalPassword,
        confirmPassword: originalPassword
      });

    const accountBefore = await CandidateAccount.findOne({ where: { email: candidateEmail } });
    const originalHash = accountBefore.passwordHash;
    expect(accountBefore.emailVerified).toBe(true);

    emailCapture.clear();

    // 2. Unauthenticated attempt by someone to apply with already claimed candidate email requires sign in (CANDIDATE_ACCOUNT_SIGN_IN_REQUIRED)
    const unauthApplyRes = await request(app)
      .post(`/api/v1/applications/public/jobs/${tenant.job2Id}/apply`)
      .field('fullName', 'Bruce Wayne')
      .field('email', candidateEmail)
      .field('mobileNumber', '+1-555-0999')
      .field('location', 'Gotham City')
      .field('totalExperienceYears', '10')
      .field('skills', 'DevOps,Security')
      .attach('resume', Buffer.from('%PDF-1.4 Bruce Wayne Resume 2'), {
        filename: 'bruce_resume_2.pdf',
        contentType: 'application/pdf'
      });
    expect(unauthApplyRes.status).toBe(409);
    expect(unauthApplyRes.body.error.code).toBe('CANDIDATE_ACCOUNT_SIGN_IN_REQUIRED');

    // Candidate signs in with existing password and submits second application
    const preLoginRes = await request(app)
      .post('/api/v1/auth/candidate/login')
      .send({ email: candidateEmail, password: originalPassword });
    expect(preLoginRes.status).toBe(200);
    const candidateToken = preLoginRes.body.data.token;

    const secondApplyRes = await request(app)
      .post(`/api/v1/applications/public/jobs/${tenant.job2Id}/apply`)
      .set('Authorization', `Bearer ${candidateToken}`)
      .field('fullName', 'Bruce Wayne')
      .field('email', candidateEmail)
      .field('mobileNumber', '+1-555-0999')
      .field('location', 'Gotham City')
      .field('totalExperienceYears', '10')
      .field('skills', 'DevOps,Security')
      .attach('resume', Buffer.from('%PDF-1.4 Bruce Wayne Resume 2'), {
        filename: 'bruce_resume_2.pdf',
        contentType: 'application/pdf'
      });

    expect(secondApplyRes.status).toBe(201);

    // Verify password is NOT overwritten
    const accountAfter = await CandidateAccount.findOne({ where: { email: candidateEmail } });
    expect(accountAfter.passwordHash).toBe(originalHash);

    // Verify NO activation email was dispatched
    const secondActivationEmail = emailCapture.getLatestFor(candidateEmail, 'CANDIDATE_ACCOUNT_ACTIVATION') ||
                                 emailCapture.getLatestFor(candidateEmail, 'NOTIFICATION_CANDIDATE_ACCOUNT_ACTIVATION');
    expect(secondActivationEmail).toBeNull();

    // Verify APPLICATION_RECEIVED was dispatched
    const appReceivedEmail = emailCapture.getLatestFor(candidateEmail, 'APPLICATION_RECEIVED') ||
                             emailCapture.getLatestFor(candidateEmail, 'NOTIFICATION_APPLICATION_RECEIVED');
    expect(appReceivedEmail).not.toBeNull();

    // Original password STILL logs in
    const loginRes = await request(app)
      .post('/api/v1/auth/candidate/login')
      .send({ email: candidateEmail, password: originalPassword });
    expect(loginRes.status).toBe(200);

    // Candidate Portal overview shows BOTH applications
    const portalRes = await request(app)
      .get('/api/v1/portal/overview')
      .set('Authorization', `Bearer ${loginRes.body.data.token}`);
    expect(portalRes.status).toBe(200);
    expect(portalRes.body.data.applications).toHaveLength(2);
  });

  it('9: safely refreshes activation token and allows resend for existing inactive candidate', async () => {
    const tenant = await setupTenantAndJob('Cyber Corp', 'cybercorp');
    const candidateEmail = 'clark.kent@dailyplanet.com';

    // 1. Initial application, but candidate does NOT activate
    await request(app)
      .post(`/api/v1/applications/public/jobs/${tenant.job1Id}/apply`)
      .field('fullName', 'Clark Kent')
      .field('email', candidateEmail)
      .field('mobileNumber', '+1-555-0333')
      .field('location', 'Metropolis')
      .field('totalExperienceYears', '7')
      .field('skills', 'Journalism,Investigative')
      .attach('resume', Buffer.from('%PDF-1.4 Clark Kent Resume'), {
        filename: 'clark_resume.pdf',
        contentType: 'application/pdf'
      });

    const firstToken = emailCapture.getLatestActivationToken(candidateEmail);
    expect(firstToken).not.toBeNull();

    emailCapture.clear();
    candidateIdentityService.clearCandidateCooldownsForTest();

    // 2. Candidate requests resend activation
    const resendRes = await request(app)
      .post('/api/v1/auth/candidate/resend-activation')
      .send({ email: candidateEmail });
    expect(resendRes.status).toBe(200);
    expect(resendRes.body.data.accepted).toBe(true);

    const refreshedToken = emailCapture.getLatestActivationToken(candidateEmail);
    expect(refreshedToken).not.toBeNull();
    expect(refreshedToken).not.toBe(firstToken);

    // Activating with the refreshed token succeeds
    const activateRes = await request(app)
      .post('/api/v1/auth/candidate/activate')
      .send({
        token: refreshedToken,
        password: 'SupermanPass#2026',
        confirmPassword: 'SupermanPass#2026'
      });
    expect(activateRes.status).toBe(200);
    expect(activateRes.body.data.activated).toBe(true);

    // Can log in now
    const loginRes = await request(app)
      .post('/api/v1/auth/candidate/login')
      .send({ email: candidateEmail, password: 'SupermanPass#2026' });
    expect(loginRes.status).toBe(200);
  });

  it('10: prevents duplicate application to the exact same job and preserves account state', async () => {
    const tenant = await setupTenantAndJob('Nova Dynamics', 'novadynamics');
    const candidateEmail = 'diana.prince@themyscira.gov';

    // 1. First application
    const firstRes = await request(app)
      .post(`/api/v1/applications/public/jobs/${tenant.job1Id}/apply`)
      .field('fullName', 'Diana Prince')
      .field('email', candidateEmail)
      .field('mobileNumber', '+1-555-0777')
      .field('location', 'Washington, DC')
      .field('totalExperienceYears', '10')
      .field('skills', 'Leadership,Diplomacy')
      .attach('resume', Buffer.from('%PDF-1.4 Diana Prince Resume'), {
        filename: 'diana_resume.pdf',
        contentType: 'application/pdf'
      });
    expect(firstRes.status).toBe(201);

    // 2. Duplicate application to the exact same job
    const duplicateRes = await request(app)
      .post(`/api/v1/applications/public/jobs/${tenant.job1Id}/apply`)
      .field('fullName', 'Diana Prince')
      .field('email', candidateEmail)
      .field('mobileNumber', '+1-555-0777')
      .field('location', 'Washington, DC')
      .field('totalExperienceYears', '10')
      .field('skills', 'Leadership,Diplomacy')
      .attach('resume', Buffer.from('%PDF-1.4 Diana Prince Resume Duplicate'), {
        filename: 'diana_resume_dup.pdf',
        contentType: 'application/pdf'
      });
    expect(duplicateRes.status).toBe(409);
    expect(duplicateRes.body.error.code).toBe('DUPLICATE_APPLICATION');
  });

  it('11: email delivery failure during apply does not invalidate saved application, allowing safe retry/resend', async () => {
    const tenant = await setupTenantAndJob('Oscorp', 'oscorp');
    const emailAdapter = require('../../src/integrations/email/email.adapter');

    const candidateEmail = 'norman.osborn@oscorp.com';

    // Mock email transport to fail
    emailAdapter.setTestEmailTransport(async () => {
      throw new Error('Downstream SMTP connection timeout');
    });

    // Submitting application succeeds even though email transport threw
    const applyRes = await request(app)
      .post(`/api/v1/applications/public/jobs/${tenant.job1Id}/apply`)
      .field('fullName', 'Norman Osborn')
      .field('email', candidateEmail)
      .field('mobileNumber', '+1-555-0888')
      .field('location', 'New York, NY')
      .field('totalExperienceYears', '15')
      .field('skills', 'Chemistry,Executive')
      .attach('resume', Buffer.from('%PDF-1.4 Norman Osborn Resume'), {
        filename: 'norman_resume.pdf',
        contentType: 'application/pdf'
      });

    expect(applyRes.status).toBe(201);
    expect(applyRes.body.data.applicationId).toBeDefined();

    // Verify DB records exist
    const { CandidateAccount, Application } = getModels();
    const account = await CandidateAccount.findOne({ where: { email: candidateEmail } });
    expect(account).not.toBeNull();
    const application = await Application.findByPk(applyRes.body.data.applicationId);
    expect(application).not.toBeNull();

    // Restore working transport and resend activation
    emailCapture = createEmailCaptureHarness();
    candidateIdentityService.clearCandidateCooldownsForTest();

    const resendRes = await request(app)
      .post('/api/v1/auth/candidate/resend-activation')
      .send({ email: candidateEmail });
    expect(resendRes.status).toBe(200);

    const token = emailCapture.getLatestActivationToken(candidateEmail);
    expect(token).not.toBeNull();

    // Activate successfully
    const actRes = await request(app)
      .post('/api/v1/auth/candidate/activate')
      .send({
        token,
        password: 'GoblinPass#2026',
        confirmPassword: 'GoblinPass#2026'
      });
    expect(actRes.status).toBe(200);
  });

  it('12: enforces strict cross-candidate isolation and IDOR rejection', async () => {
    const tenant = await setupTenantAndJob('Shield Tech', 'shieldtech');

    // Create Candidate A
    const emailA = 'natasha.romanoff@shield.gov';
    await request(app)
      .post(`/api/v1/applications/public/jobs/${tenant.job1Id}/apply`)
      .field('fullName', 'Natasha Romanoff')
      .field('email', emailA)
      .field('mobileNumber', '+1-555-0195')
      .field('location', 'Budapest')
      .field('totalExperienceYears', '8')
      .field('skills', 'Infiltration,Security')
      .attach('resume', Buffer.from('%PDF-1.4 Natasha Resume'), {
        filename: 'natasha.pdf',
        contentType: 'application/pdf'
      });
    const tokenA = emailCapture.getLatestActivationToken(emailA);
    await request(app).post('/api/v1/auth/candidate/activate').send({
      token: tokenA,
      password: 'NatashaPass#2026',
      confirmPassword: 'NatashaPass#2026'
    });
    const loginARes = await request(app)
      .post('/api/v1/auth/candidate/login')
      .send({ email: emailA, password: 'NatashaPass#2026' });
    const jwtA = loginARes.body.data.token;

    // Create Candidate B
    const emailB = 'clint.barton@shield.gov';
    const applyBRes = await request(app)
      .post(`/api/v1/applications/public/jobs/${tenant.job1Id}/apply`)
      .field('fullName', 'Clint Barton')
      .field('email', emailB)
      .field('mobileNumber', '+1-555-0196')
      .field('location', 'Waverly, IA')
      .field('totalExperienceYears', '7')
      .field('skills', 'Archery,Precision')
      .attach('resume', Buffer.from('%PDF-1.4 Clint Resume'), {
        filename: 'clint.pdf',
        contentType: 'application/pdf'
      });
    const appBId = applyBRes.body.data.applicationId;
    const tokenB = emailCapture.getLatestActivationToken(emailB);
    await request(app).post('/api/v1/auth/candidate/activate').send({
      token: tokenB,
      password: 'HawkeyePass#2026',
      confirmPassword: 'HawkeyePass#2026'
    });
    const loginBRes = await request(app)
      .post('/api/v1/auth/candidate/login')
      .send({ email: emailB, password: 'HawkeyePass#2026' });
    const jwtB = loginBRes.body.data.token;

    // Create an Offer for Candidate B
    const offerB = await offerRepo.createOffer({
      organisationId: tenant.organisationId,
      applicationId: appBId,
      offeredSalary: '135000',
      salaryCurrency: 'USD',
      designation: 'Senior Marksman',
      department: 'Tactical',
      joiningDate: new Date('2026-12-01'),
      offerValidUntil: new Date('2027-01-01'),
      status: 'SENT',
      sentAt: new Date()
    });

    // 1. Candidate A overview only contains Candidate A's applications, NOT Candidate B's
    const overviewARes = await request(app)
      .get('/api/v1/portal/overview')
      .set('Authorization', `Bearer ${jwtA}`);
    expect(overviewARes.status).toBe(200);
    const appIdsA = overviewARes.body.data.applications.map((a) => a.id);
    expect(appIdsA).not.toContain(appBId);

    // 2. Candidate A cannot accept Candidate B's offer (IDOR rejected with 404)
    const crossOfferRes = await request(app)
      .post(`/api/v1/portal/offers/${offerB.id}/respond`)
      .set('Authorization', `Bearer ${jwtA}`)
      .send({ decision: 'ACCEPT', note: 'Attempting IDOR takeover' });
    expect(crossOfferRes.status).toBe(404);

    // 3. Candidate B can respond to their own offer
    const legitimateOfferRes = await request(app)
      .post(`/api/v1/portal/offers/${offerB.id}/respond`)
      .set('Authorization', `Bearer ${jwtB}`)
      .send({ decision: 'ACCEPT', note: 'Accepted legitimate offer' });
    expect(legitimateOfferRes.status).toBe(200);
  });

  it('supports candidate account activation via /candidate/reset-password endpoint fallback', async () => {
    const tenant = await setupTenantAndJob('Horizon Media', 'horizonmedia');
    const candidateEmail = 'steve.rogers@avengers.io';

    await request(app)
      .post(`/api/v1/applications/public/jobs/${tenant.job1Id}/apply`)
      .field('fullName', 'Steve Rogers')
      .field('email', candidateEmail)
      .field('mobileNumber', '+1-555-0199')
      .field('location', 'Brooklyn, NY')
      .field('totalExperienceYears', '12')
      .field('skills', 'Tactics,Leadership')
      .attach('resume', Buffer.from('%PDF-1.4 Steve Rogers Resume'), {
        filename: 'steve.pdf',
        contentType: 'application/pdf'
      });

    const token = emailCapture.getLatestActivationToken(candidateEmail);
    expect(token).not.toBeNull();

    // Submit activation token to /candidate/reset-password endpoint
    const resetRes = await request(app)
      .post('/api/v1/auth/candidate/reset-password')
      .send({
        token,
        newPassword: 'CaptainAmericaPass#2026',
        confirmPassword: 'CaptainAmericaPass#2026'
      });

    expect(resetRes.status).toBe(200);
    expect(resetRes.body.data.resetCompleted).toBe(true);

    // Verify login works with the password
    const loginRes = await request(app)
      .post('/api/v1/auth/candidate/login')
      .send({
        email: candidateEmail,
        password: 'CaptainAmericaPass#2026'
      });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.token).toBeDefined();
  });

  it('13: confirms Application Submitted and Shortlisted notifications remain fully functional and enriched', async () => {
    const tenant = await setupTenantAndJob('Omega Corp', 'omegacorp');
    const candidateEmail = 'wanda.maximoff@avengers.io';

    emailCapture.clear();

    const applyRes = await request(app)
      .post(`/api/v1/applications/public/jobs/${tenant.job1Id}/apply`)
      .field('fullName', 'Wanda Maximoff')
      .field('email', candidateEmail)
      .field('mobileNumber', '+1-555-0991')
      .field('location', 'Westview, NJ')
      .field('totalExperienceYears', '5')
      .field('skills', 'Reality,Chaos')
      .attach('resume', Buffer.from('%PDF-1.4 Wanda Resume'), {
        filename: 'wanda.pdf',
        contentType: 'application/pdf'
      });
    expect(applyRes.status).toBe(201);
    const appId = applyRes.body.data.applicationId;

    // Verify APPLICATION_RECEIVED notification was captured
    const appReceived = emailCapture.getLatestFor(candidateEmail, 'APPLICATION_RECEIVED') ||
                        emailCapture.getLatestFor(candidateEmail, 'NOTIFICATION_APPLICATION_RECEIVED');
    expect(appReceived).not.toBeNull();
    expect(appReceived.subject).toContain('Application Received');
    expect(appReceived.text).toContain('has been received');
    expect(appReceived.text).toContain(candidateEmail);
    expect(appReceived.text).toContain('/login');

    emailCapture.clear();

    // Recruiter shortlists the candidate
    const screenRes = await request(app)
      .post(`/api/v1/applications/${appId}/screen`)
      .set('Authorization', `Bearer ${tenant.recruiterToken}`)
      .send({
        decision: 'SHORTLIST',
        notes: 'Exceptional capabilities and experience.'
      });
    expect(screenRes.status).toBe(200);

    // Verify CANDIDATE_SHORTLISTED notification was captured
    const shortlistedNotif = emailCapture.getLatestFor(candidateEmail, 'CANDIDATE_SHORTLISTED') ||
                             emailCapture.getLatestFor(candidateEmail, 'NOTIFICATION_CANDIDATE_SHORTLISTED');
    expect(shortlistedNotif).not.toBeNull();
    expect(shortlistedNotif.subject).toContain('Application Shortlisted');
    expect(shortlistedNotif.text).toContain('/login');
  });
});
