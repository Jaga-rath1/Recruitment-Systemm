import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');

const { startTestDatabase, resetTestState, stopTestDatabase } = require('../helpers/testDb');
const { createEmailCaptureHarness, registerAndVerifyCandidate } = require('../helpers/candidateAuthHelper');
const { createApp } = require('../../src/app');
const env = require('../../src/config/env');
const { getModels, setTestDatabaseUrl, disconnectDatabase } = require('../../src/config/database');
const authAdapter = require('../../src/integrations/auth/auth.adapter');
const organisationAdapter = require('../../src/integrations/organisation/organisation.adapter');
const employeeAdapter = require('../../src/integrations/employee/employee.adapter');
const emailAdapter = require('../../src/integrations/email/email.adapter');
const storageAdapter = require('../../src/integrations/storage/storage.adapter');
const { seedOrganisationRoles } = require('../../src/db/seed');
const candidateIdentityService = require('../../src/modules/candidate/candidateIdentity.service');
const {
  CANDIDATE_JWT_ISSUER,
  CANDIDATE_JWT_AUDIENCE,
  hashCandidateToken
} = require('../../src/utils/candidateSecurity');

const VALID_PDF = Buffer.from('%PDF-1.4\n%Phase4.4 Security Audit PDF\n');

async function seedPublishedOrgJob(app, name = 'ClaimOrg A', slug = 'claimorga') {
  const platformToken = authAdapter.signAccessToken({
    sub: uuidv4(),
    email: 'pa@nexnuv.com',
    name: 'Platform Admin',
    userType: 'PLATFORM_ADMIN',
    roles: ['PLATFORM_ADMIN']
  });

  const subRes = await request(app).post('/api/v1/subscriptions').send({
    organisationName: name,
    organisationDomain: `${slug}.io`,
    industry: 'Security',
    companySize: '50-200',
    adminName: `${name} Admin`,
    adminEmail: `admin@${slug}.io`
  });
  expect(subRes.status).toBe(201);
  const subId = subRes.body.data.id;

  const payRes = await request(app)
    .post(`/api/v1/subscriptions/${subId}/payments`)
    .field('paymentReference', `PAY-${subId.slice(0, 8)}`)
    .field('paymentMethod', 'WIRE_TRANSFER');
  expect(payRes.status).toBe(201);

  const verifyRes = await request(app)
    .post(`/api/v1/subscriptions/platform-admin/${subId}/verify`)
    .set('Authorization', `Bearer ${platformToken}`)
    .send({ decision: 'APPROVE' });
  expect(verifyRes.status).toBe(200);

  const activationToken = verifyRes.body.data.invitationPreview.activationToken;
  const actRes = await request(app).post('/api/v1/subscriptions/activate').send({
    activationToken,
    password: 'AdminPassword#2026'
  });
  expect(actRes.status).toBe(200);

  const orgId = actRes.body.data.user.organisationId;
  const adminToken = actRes.body.data.token;

  const jobRes = await request(app)
    .post('/api/v1/jobs')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      title: 'Principal Security Engineer',
      department: 'Security',
      location: 'Remote',
      employmentType: 'FULL_TIME',
      experienceMin: 4,
      experienceMax: 8,
      openingsCount: 1,
      description: 'Application security engineering role'
    });
  expect(jobRes.status).toBe(201);
  const jobId = jobRes.body.data.id;

  const pubRes = await request(app)
    .post(`/api/v1/jobs/${jobId}/publish`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send();
  expect(pubRes.status).toBe(200);

  return { orgId, adminToken, jobId };
}

describe('Phase 4.4 — Candidate Email Verification, Account Claim Protection & Password Recovery Security', () => {
  let app;
  let activeDbUrl;

  beforeAll(async () => {
    const db = await startTestDatabase();
    activeDbUrl = db.databaseUrl;
    app = createApp();
  });

  afterAll(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await resetTestState();
    candidateIdentityService.clearCandidateCooldownsForTest();
  });

  it('A. enforces unverified signup isolation, HMAC OTP hashing, lockout, cooldown, single-use & email fail-closed behavior', async () => {
    const capture = createEmailCaptureHarness();

    // 1. Weak registration password fails validation cleanly (422)
    const weakReg = await request(app).post('/api/v1/auth/candidate/register').send({
      fullName: 'Weak Cand',
      email: 'weak.cand@example.com',
      password: 'password123'
    });
    expect(weakReg.status).toBe(422);

    // 2. Register candidate -> MUST NOT grant JWT, returns requiresEmailVerification=true
    const regRes = await request(app).post('/api/v1/auth/candidate/register').send({
      fullName: 'Jane Candidate',
      email: 'Jane.Verify@Example.COM',
      password: 'StrongPass#2026'
    });
    expect(regRes.status).toBe(201);
    expect(regRes.body.data.token).toBeUndefined();
    expect(regRes.body.data.requiresEmailVerification).toBe(true);
    expect(regRes.body.data.emailVerified).toBe(false);
    expect(regRes.body.data.user.email).toBe('jane.verify@example.com');

    // Never expose OTP in API response
    const firstOtp = capture.getLatestOtp('jane.verify@example.com');
    expect(firstOtp).toMatch(/^\d{6}$/);
    expect(JSON.stringify(regRes.body)).not.toContain(firstOtp);

    // DB stores keyed HMAC hash, never plaintext OTP
    const { CandidateAccount, RecruitmentAuditLog } = getModels();
    const acc = await CandidateAccount.findOne({ where: { email: 'jane.verify@example.com' } });
    expect(acc.emailVerified).toBe(false);
    expect(acc.verificationTokenHash).toBe(hashCandidateToken(firstOtp, 'EMAIL_VERIFY'));
    expect(acc.verificationTokenHash).not.toBe(firstOtp);

    // 3. Unverified candidate CANNOT log in (403 with right password, 401 with wrong password)
    const unverifiedRightPass = await request(app).post('/api/v1/auth/candidate/login').send({
      email: 'jane.verify@example.com',
      password: 'StrongPass#2026'
    });
    expect(unverifiedRightPass.status).toBe(403);
    expect(unverifiedRightPass.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    expect(unverifiedRightPass.body.data).toBeUndefined();

    const unverifiedWrongPass = await request(app).post('/api/v1/auth/candidate/login').send({
      email: 'jane.verify@example.com',
      password: 'WrongPassword#1'
    });
    expect(unverifiedWrongPass.status).toBe(401);

    // Even forged/legacy token for unverified account is rejected by verifyRequestAuth
    const unverifiedJwt = jwt.sign(
      {
        sub: acc.id,
        userId: acc.id,
        email: acc.email,
        userType: 'CANDIDATE',
        roles: ['CANDIDATE'],
        tokenVersion: acc.tokenVersion,
        emailVerified: true
      },
      env.jwt.candidateSecret,
      { algorithm: 'HS256', issuer: CANDIDATE_JWT_ISSUER, audience: CANDIDATE_JWT_AUDIENCE, expiresIn: '1h' }
    );
    const blockedPortal = await request(app)
      .get('/api/v1/portal/overview')
      .set('Authorization', `Bearer ${unverifiedJwt}`);
    expect(blockedPortal.status).toBe(401);

    // 4. Case-insensitive duplicate signup blocked (409)
    const dupRes = await request(app).post('/api/v1/auth/candidate/register').send({
      fullName: 'Duplicate Jane',
      email: 'JANE.verify@example.com',
      password: 'StrongPass#2026'
    });
    expect(dupRes.status).toBe(409);

    // 5. Resend verification immediately hits cooldown (429), matching unknown email behavior
    const earlyResend = await request(app)
      .post('/api/v1/auth/candidate/resend-verification')
      .send({ email: 'jane.verify@example.com' });
    expect(earlyResend.status).toBe(429);
    expect(earlyResend.body.error.code).toBe('VERIFICATION_RESEND_COOLDOWN');

    // Clear cooldown + backdate DB timestamp for test -> resend generates NEW OTP and invalidates OLD OTP
    candidateIdentityService.clearCandidateCooldownsForTest();
    await CandidateAccount.update(
      { verificationSentAt: new Date(Date.now() - 120 * 1000) },
      { where: { email: 'jane.verify@example.com' } }
    );
    const resendOk = await request(app)
      .post('/api/v1/auth/candidate/resend-verification')
      .send({ email: 'jane.verify@example.com' });
    expect(resendOk.status).toBe(200);
    const secondOtp = capture.getLatestOtp('jane.verify@example.com');
    expect(secondOtp).toMatch(/^\d{6}$/);

    // Non-existent email cooldown check (anti-enumeration: first ok 200, second rapid hit 429)
    const unknownResend1 = await request(app)
      .post('/api/v1/auth/candidate/resend-verification')
      .send({ email: 'nobody.here@example.com' });
    expect(unknownResend1.status).toBe(200);
    const unknownResend2 = await request(app)
      .post('/api/v1/auth/candidate/resend-verification')
      .send({ email: 'nobody.here@example.com' });
    expect(unknownResend2.status).toBe(429);

    // If firstOtp differs from secondOtp, firstOtp is now invalid
    if (firstOtp !== secondOtp) {
      const oldOtpRes = await request(app)
        .post('/api/v1/auth/candidate/verify-email')
        .send({ email: 'jane.verify@example.com', otp: firstOtp });
      expect(oldOtpRes.status).toBe(400);
    }

    // 6. Expired OTP rejected cleanly
    await acc.update({ verificationExpiresAt: new Date(Date.now() - 60_000) });
    const expiredVerify = await request(app)
      .post('/api/v1/auth/candidate/verify-email')
      .send({ email: 'jane.verify@example.com', otp: secondOtp });
    expect(expiredVerify.status).toBe(400);
    expect(expiredVerify.body.error.code).toBe('VERIFICATION_EXPIRED');

    // Refresh via resend -> test brute-force lockout on 5 invalid attempts
    candidateIdentityService.clearCandidateCooldownsForTest();
    await CandidateAccount.update(
      { verificationSentAt: new Date(Date.now() - 120 * 1000) },
      { where: { id: acc.id } }
    );
    const resendForLock = await request(app)
      .post('/api/v1/auth/candidate/resend-verification')
      .send({ email: 'jane.verify@example.com' });
    expect(resendForLock.status).toBe(200);
    const thirdOtp = capture.getLatestOtp('jane.verify@example.com');

    for (let i = 0; i < 4; i++) {
      const badOtp = thirdOtp === '000000' ? '000001' : '000000';
      const attemptRes = await request(app)
        .post('/api/v1/auth/candidate/verify-email')
        .send({ email: 'jane.verify@example.com', otp: badOtp });
      expect(attemptRes.status).toBe(400);
    }
    const lockAttempt = await request(app)
      .post('/api/v1/auth/candidate/verify-email')
      .send({ email: 'jane.verify@example.com', otp: '999999' });
    expect(lockAttempt.status).toBe(429);
    expect(lockAttempt.body.error.code).toBe('VERIFICATION_LOCKED');

    // Correct OTP is ALSO rejected while locked (and was invalidated!)
    const duringLock = await request(app)
      .post('/api/v1/auth/candidate/verify-email')
      .send({ email: 'jane.verify@example.com', otp: thirdOtp });
    expect(duringLock.status).toBe(429);

    // Clear verification lock -> resend fresh OTP -> test concurrent atomic single-use verify
    await CandidateAccount.update(
      {
        verificationLockedUntil: null,
        verificationAttempts: 0,
        verificationSentAt: new Date(Date.now() - 120 * 1000)
      },
      { where: { id: acc.id } }
    );
    candidateIdentityService.clearCandidateCooldownsForTest();
    const resendFinal = await request(app)
      .post('/api/v1/auth/candidate/resend-verification')
      .send({ email: 'jane.verify@example.com' });
    expect(resendFinal.status).toBe(200);
    const finalOtp = capture.getLatestOtp('jane.verify@example.com');

    const [v1, v2] = await Promise.all([
      request(app).post('/api/v1/auth/candidate/verify-email').send({ email: 'jane.verify@example.com', otp: finalOtp }),
      request(app).post('/api/v1/auth/candidate/verify-email').send({ email: 'jane.verify@example.com', otp: finalOtp })
    ]);
    expect([v1.status, v2.status].sort()).toEqual([200, 400]);

    // Replay after verify fails cleanly
    const replayVerify = await request(app)
      .post('/api/v1/auth/candidate/verify-email')
      .send({ email: 'jane.verify@example.com', otp: finalOtp });
    expect(replayVerify.status).toBe(400);

    // Verified login succeeds now!
    const okLogin = await request(app).post('/api/v1/auth/candidate/login').send({
      email: 'jane.verify@example.com',
      password: 'StrongPass#2026'
    });
    expect(okLogin.status).toBe(200);
    expect(okLogin.body.data.token).toBeTruthy();

    // 7. Failing/unconfigured email delivery must fail closed and NEVER verify account
    emailAdapter.clearTestEmailTransport();
    const failReg = await request(app).post('/api/v1/auth/candidate/register').send({
      fullName: 'Fail Delivery',
      email: 'fail.delivery@example.com',
      password: 'StrongPass#2026'
    });
    expect(failReg.status).toBe(503);
    expect(failReg.body.error.code).toBe('EMAIL_DELIVERY_UNAVAILABLE');
    expect(failReg.body.data).toBeUndefined();
    const ghostAcc = await CandidateAccount.findOne({ where: { email: 'fail.delivery@example.com' } });
    expect(ghostAcc).toBeNull();

    // Audit logs must not contain plaintext OTPs
    const audits = await RecruitmentAuditLog.findAll();
    expect(JSON.stringify(audits)).not.toContain(firstOtp);
    expect(JSON.stringify(audits)).not.toContain(finalOtp);
  });

  it('B. enforces explicit org-scoped atomic application claiming & blocks implicit email takeover and cross-org claims', async () => {
    const orgA = await seedPublishedOrgJob(app, 'Claim Org Alpha', 'claimalpha');
    const orgB = await seedPublishedOrgJob(app, 'Claim Org Beta', 'claimbeta');

    // 1. Candidate submits anonymous application to Org A BEFORE registering
    const anonApply = await request(app)
      .post(`/api/v1/applications/public/jobs/${orgA.jobId}/apply`)
      .field('fullName', 'Jordan Anon')
      .field('email', 'jordan.claim@example.com')
      .field('mobileNumber', '+1-555-2026')
      .field('location', 'Denver')
      .field('totalExperienceYears', '6')
      .attach('resume', VALID_PDF, 'jordan-cv.pdf');
    expect(anonApply.status).toBe(201);
    const anonRef = anonApply.body.data.applicationReference;

    const { Candidate, ApplicationDocument } = getModels();
    const anonCandidate = await Candidate.findOne({
      where: { organisationId: orgA.orgId, email: 'jordan.claim@example.com' }
    });
    expect(anonCandidate.authUserId).toBeNull();

    const docRow = await ApplicationDocument.findOne({ where: { applicationId: anonApply.body.data.applicationId } });
    const signedUrlForNullAuth = storageAdapter.buildSignedDownloadUrl({
      storageKey: docRow.storageKey,
      fileName: docRow.fileName,
      mimeType: docRow.mimeType,
      organisationId: orgA.orgId,
      docScope: 'APPLICATION',
      candidateEmail: 'jordan.claim@example.com',
      candidateAuthUserId: null
    });

    // 2. Jordan registers + verifies email -> BEFORE explicit claim:
    //    Portal shows ZERO apps, and document download is DENIED (no email fallback!)
    const { token: jordanToken, user: jordanUser } = await registerAndVerifyCandidate(request, app, {
      fullName: 'Jordan Claimer',
      email: 'jordan.claim@example.com',
      password: 'ClaimPass#2026'
    });

    const portalBefore = await request(app)
      .get('/api/v1/portal/overview')
      .set('Authorization', `Bearer ${jordanToken}`);
    expect(portalBefore.status).toBe(200);
    expect(portalBefore.body.data.applications).toHaveLength(0);

    const downloadBeforeClaim = await request(app)
      .get(signedUrlForNullAuth)
      .set('Authorization', `Bearer ${jordanToken}`);
    expect(downloadBeforeClaim.status).toBe(403);
    expect(downloadBeforeClaim.body.error.code).toBe('CROSS_CANDIDATE_DENIED');

    // 3. Different verified candidate CANNOT claim Jordan's application
    const { token: intruderToken } = await registerAndVerifyCandidate(request, app, {
      fullName: 'Intruder User',
      email: 'intruder.other@example.com',
      password: 'ClaimPass#2026'
    });
    const intruderClaim = await request(app)
      .post('/api/v1/portal/claims')
      .set('Authorization', `Bearer ${intruderToken}`)
      .send({ organisationId: orgA.orgId, applicationReference: anonRef });
    expect(intruderClaim.status).toBe(404);
    expect(intruderClaim.body.error.code).toBe('CLAIM_NOT_ELIGIBLE');

    // 4. Cross-organisation claim fails non-disclosingly (claiming Org A app under Org B)
    const crossOrgClaim = await request(app)
      .post('/api/v1/portal/claims')
      .set('Authorization', `Bearer ${jordanToken}`)
      .send({ organisationId: orgB.orgId, applicationReference: anonRef });
    expect(crossOrgClaim.status).toBe(404);
    expect(crossOrgClaim.body.error.code).toBe('CLAIM_NOT_ELIGIBLE');

    // 5. Concurrent claim race: only one atomic update wins; second gets 404 CLAIM_NOT_ELIGIBLE
    const [claimA, claimB] = await Promise.all([
      request(app)
        .post('/api/v1/portal/claims')
        .set('Authorization', `Bearer ${jordanToken}`)
        .send({ organisationId: orgA.orgId, applicationReference: anonRef }),
      request(app)
        .post('/api/v1/portal/claims')
        .set('Authorization', `Bearer ${jordanToken}`)
        .send({ organisationId: orgA.orgId, applicationReference: anonRef })
    ]);
    expect([claimA.status, claimB.status].sort()).toEqual([200, 404]);

    // Unauthenticated re-apply with already-claimed email on another job in same org is blocked
    const secondJobRes = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${orgA.adminToken}`)
      .send({
        title: 'Staff AppSec Architect',
        department: 'Security',
        location: 'Remote',
        employmentType: 'FULL_TIME',
        experienceMin: 5,
        experienceMax: 10,
        openingsCount: 1,
        description: 'Second job to verify unauthenticated spam protection'
      });
    expect(secondJobRes.status).toBe(201);
    const secondJobId = secondJobRes.body.data.id;
    await request(app)
      .post(`/api/v1/jobs/${secondJobId}/publish`)
      .set('Authorization', `Bearer ${orgA.adminToken}`)
      .send();

    const unauthInject = await request(app)
      .post(`/api/v1/applications/public/jobs/${secondJobId}/apply`)
      .field('fullName', 'Spoofer')
      .field('email', 'jordan.claim@example.com')
      .field('mobileNumber', '+1-555-9999')
      .field('location', 'Nowhere')
      .field('totalExperienceYears', '1')
      .attach('resume', VALID_PDF, 'spoof.pdf');
    expect(unauthInject.status).toBe(409);
    expect(unauthInject.body.error.code).toBe('CANDIDATE_ACCOUNT_SIGN_IN_REQUIRED');

    // 6. After successful claim: Jordan sees application + downloads resume cleanly; non-transferable to another account
    const portalAfter = await request(app)
      .get('/api/v1/portal/overview')
      .set('Authorization', `Bearer ${jordanToken}`);
    expect(portalAfter.status).toBe(200);
    expect(portalAfter.body.data.applications).toHaveLength(1);
    const freshDownloadUrl = portalAfter.body.data.applications[0].documents[0].downloadUrl;

    const dlAfter = await request(app)
      .get(freshDownloadUrl)
      .set('Authorization', `Bearer ${jordanToken}`);
    expect(dlAfter.status).toBe(200);
    expect(Buffer.from(dlAfter.body).equals(VALID_PDF)).toBe(true);

    const updatedCandidate = await Candidate.findByPk(anonCandidate.id);
    expect(updatedCandidate.authUserId).toBe(jordanUser.userId);
    expect(updatedCandidate.claimedAt).toBeTruthy();

    // Claim audit events recorded
    const { RecruitmentAuditLog } = getModels();
    const claimSucceeded = await RecruitmentAuditLog.findAll({
      where: { action: 'APPLICATION_CLAIM_SUCCEEDED', entityId: anonCandidate.id }
    });
    const claimRejected = await RecruitmentAuditLog.findAll({
      where: { action: 'APPLICATION_CLAIM_REJECTED' }
    });
    expect(claimSucceeded.length).toBe(1);
    expect(claimRejected.length).toBeGreaterThanOrEqual(2);
  });

  it('C. enforces login lockout, password recovery single-use, change password & immediate JWT session revocation + DB fail-closed', async () => {
    const capture = createEmailCaptureHarness();
    const { user, token: initialToken } = await registerAndVerifyCandidate(request, app, {
      fullName: 'Recovery Candidate',
      email: 'recover.me@example.com',
      password: 'OldPassword#2026',
      capture
    });

    // 1. Login lockout after 5 wrong passwords
    for (let i = 0; i < 4; i++) {
      const failLogin = await request(app).post('/api/v1/auth/candidate/login').send({
        email: 'recover.me@example.com',
        password: 'WrongPassword#0'
      });
      expect(failLogin.status).toBe(401);
    }
    const fifthFail = await request(app).post('/api/v1/auth/candidate/login').send({
      email: 'recover.me@example.com',
      password: 'WrongPassword#0'
    });
    expect(fifthFail.status).toBe(429);
    expect(fifthFail.body.error.code).toBe('ACCOUNT_LOCKED');

    // Clear login lock for recovery test
    const { CandidateAccount } = getModels();
    await CandidateAccount.update(
      { lockedUntil: null, failedLoginAttempts: 0 },
      { where: { id: user.userId } }
    );

    // 2. Forgot password returns identical generic 200 for existing AND non-existing emails; only dispatches for verified
    const forgotUnknown = await request(app)
      .post('/api/v1/auth/candidate/forgot-password')
      .send({ email: 'does.not.exist@example.com' });
    const forgotKnown = await request(app)
      .post('/api/v1/auth/candidate/forgot-password')
      .send({ email: 'recover.me@example.com' });
    expect(forgotUnknown.status).toBe(200);
    expect(forgotKnown.status).toBe(200);
    expect(forgotUnknown.body.message).toBe(forgotKnown.body.message);
    expect(capture.getLatestResetToken('does.not.exist@example.com')).toBeNull();

    const resetToken = capture.getLatestResetToken('recover.me@example.com');
    expect(resetToken).toBeTruthy();
    expect(JSON.stringify(forgotKnown.body)).not.toContain(resetToken);

    // 3. Invalid/expired reset tokens & weak password rejected
    const badReset = await request(app).post('/api/v1/auth/candidate/reset-password').send({
      token: 'invalid-tampered-reset-token-123456',
      newPassword: 'NewStrongPass#2026',
      confirmPassword: 'NewStrongPass#2026'
    });
    expect(badReset.status).toBe(400);

    const weakReset = await request(app).post('/api/v1/auth/candidate/reset-password').send({
      token: resetToken,
      newPassword: 'weak',
      confirmPassword: 'weak'
    });
    expect(weakReset.status).toBe(422);

    // 4. Successful reset revokes initialToken and consumes resetToken single-use
    const okReset = await request(app).post('/api/v1/auth/candidate/reset-password').send({
      token: resetToken,
      newPassword: 'NewStrongPass#2026',
      confirmPassword: 'NewStrongPass#2026'
    });
    expect(okReset.status).toBe(200);

    const replayReset = await request(app).post('/api/v1/auth/candidate/reset-password').send({
      token: resetToken,
      newPassword: 'AnotherPass#2026',
      confirmPassword: 'AnotherPass#2026'
    });
    expect(replayReset.status).toBe(400);

    const revokedCheck = await request(app)
      .get('/api/v1/portal/overview')
      .set('Authorization', `Bearer ${initialToken}`);
    expect(revokedCheck.status).toBe(401);
    expect(revokedCheck.body.error.code).toBe('SESSION_REVOKED');

    // Old password rejected, new password works
    const oldPassLogin = await request(app).post('/api/v1/auth/candidate/login').send({
      email: 'recover.me@example.com',
      password: 'OldPassword#2026'
    });
    expect(oldPassLogin.status).toBe(401);

    const newLogin = await request(app).post('/api/v1/auth/candidate/login').send({
      email: 'recover.me@example.com',
      password: 'NewStrongPass#2026'
    });
    expect(newLogin.status).toBe(200);
    const secondToken = newLogin.body.data.token;

    // 5. Authenticated change-password rejects wrong currentPassword & password reuse, revokes secondToken
    const badCurrPass = await request(app)
      .post('/api/v1/auth/candidate/change-password')
      .set('Authorization', `Bearer ${secondToken}`)
      .send({
        currentPassword: 'WrongCurrent#1',
        newPassword: 'ChangedPass#2026',
        confirmPassword: 'ChangedPass#2026'
      });
    expect(badCurrPass.status).toBe(400);
    expect(badCurrPass.body.error.code).toBe('INVALID_CURRENT_PASSWORD');

    const reusePass = await request(app)
      .post('/api/v1/auth/candidate/change-password')
      .set('Authorization', `Bearer ${secondToken}`)
      .send({
        currentPassword: 'NewStrongPass#2026',
        newPassword: 'NewStrongPass#2026',
        confirmPassword: 'NewStrongPass#2026'
      });
    expect(reusePass.status).toBe(400);

    const okChange = await request(app)
      .post('/api/v1/auth/candidate/change-password')
      .set('Authorization', `Bearer ${secondToken}`)
      .send({
        currentPassword: 'NewStrongPass#2026',
        newPassword: 'ChangedPass#2026',
        confirmPassword: 'ChangedPass#2026'
      });
    expect(okChange.status).toBe(200);

    const revokedAfterChange = await request(app)
      .get('/api/v1/portal/overview')
      .set('Authorization', `Bearer ${secondToken}`);
    expect(revokedAfterChange.status).toBe(401);
    expect(revokedAfterChange.body.error.code).toBe('SESSION_REVOKED');

    // 6. Deactivating account immediately revokes active sessions
    const thirdLogin = await request(app).post('/api/v1/auth/candidate/login').send({
      email: 'recover.me@example.com',
      password: 'ChangedPass#2026'
    });
    expect(thirdLogin.status).toBe(200);
    const thirdToken = thirdLogin.body.data.token;

    await candidateIdentityService.deactivateCandidateAccount({ candidateAccountId: user.userId });
    const afterDeactivate = await request(app)
      .get('/api/v1/portal/overview')
      .set('Authorization', `Bearer ${thirdToken}`);
    expect(afterDeactivate.status).toBe(401);
    expect(afterDeactivate.body.error.code).toBe('ACCOUNT_INACTIVE');

    // 7. DB-unavailable fail-closed session verification check
    await disconnectDatabase();
    try {
      const dbDownRes = await request(app)
        .get('/api/v1/portal/overview')
        .set('Authorization', `Bearer ${thirdToken}`);
      expect(dbDownRes.status).toBe(503);
      expect(dbDownRes.body.error.code).toBe('SESSION_STORE_UNAVAILABLE');
    } finally {
      await setTestDatabaseUrl(activeDbUrl);
    }
  });

  it('D. enforces email provider configuration validation, Resend/Brevo mocked HTTPS delivery, test-hook isolation & verification rate limits', async () => {
    // 1. Fail-fast config validation checks
    expect(() =>
      env.validateEmailConfiguration({ ...env.email, provider: 'FAKE_PROVIDER' }, 'development')
    ).toThrow(/Unsupported EMAIL_PROVIDER/);
    expect(() =>
      env.validateEmailConfiguration({ ...env.email, provider: 'RESEND', resend: { apiKey: '', baseUrl: 'https://api.resend.com' } }, 'production')
    ).toThrow(/RESEND_API_KEY/);
    expect(() =>
      env.validateEmailConfiguration({ ...env.email, provider: 'SMTP', smtp: { host: 'smtp.mail.test', port: 587, secure: false, requireTls: false, user: 'u', pass: 'p' } }, 'production')
    ).toThrow(/TLS/);
    expect(() =>
      env.validateEmailConfiguration({ ...env.email, provider: 'DISABLED', allowUnconfiguredInProduction: false }, 'production')
    ).toThrow(/EMAIL_PROVIDER must be configured/);

    // 2. Test email hook MUST throw outside NODE_ENV=test
    try {
      process.env.NODE_ENV = 'production';
      expect(() => emailAdapter.setTestEmailTransport(() => {})).toThrow(/restricted to NODE_ENV=test/);
    } finally {
      process.env.NODE_ENV = 'test';
    }

    // 3. Mocked external HTTPS dispatch for RESEND and BREVO (explicitly mocked HTTP transport)
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'msg-external-1', messageId: 'msg-brevo-1' })
    });
    const prevProvider = process.env.EMAIL_PROVIDER;
    const prevResendKey = process.env.RESEND_API_KEY;
    const prevBrevoKey = process.env.BREVO_API_KEY;
    const prevFrom = process.env.EMAIL_FROM;

    try {
      emailAdapter.clearTestEmailTransport();
      process.env.EMAIL_FROM = 'security@nexnuv.test';

      process.env.EMAIL_PROVIDER = 'RESEND';
      process.env.RESEND_API_KEY = 're_mock_test_key';
      const rRes = await emailAdapter.sendCandidateVerificationOtpEmail({
        to: 'check@example.com',
        fullName: 'Check',
        otp: '654321',
        expiresInMinutes: 10
      });
      expect(rRes).toMatchObject({ delivered: true, provider: 'RESEND' });
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.resend.com/emails',
        expect.objectContaining({ method: 'POST' })
      );

      process.env.EMAIL_PROVIDER = 'BREVO';
      process.env.BREVO_API_KEY = 'xkeysib-mock-test-key';
      const bRes = await emailAdapter.sendCandidateVerificationOtpEmail({
        to: 'check@example.com',
        fullName: 'Check',
        otp: '654321',
        expiresInMinutes: 10
      });
      expect(bRes).toMatchObject({ delivered: true, provider: 'BREVO' });
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.brevo.com/v3/smtp/email',
        expect.objectContaining({ method: 'POST' })
      );
    } finally {
      fetchSpy.mockRestore();
      if (prevProvider === undefined) delete process.env.EMAIL_PROVIDER;
      else process.env.EMAIL_PROVIDER = prevProvider;
      if (prevResendKey === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = prevResendKey;
      if (prevBrevoKey === undefined) delete process.env.BREVO_API_KEY;
      else process.env.BREVO_API_KEY = prevBrevoKey;
      if (prevFrom === undefined) delete process.env.EMAIL_FROM;
      else process.env.EMAIL_FROM = prevFrom;
    }

    // 4. Dedicated rate limiter test on /verify-email
    process.env.ENABLE_TEST_RATE_LIMIT = 'true';
    try {
      const testIp = '198.51.100.88';
      let lastRes = null;
      for (let i = 0; i < 13; i++) {
        lastRes = await request(app)
          .post('/api/v1/auth/candidate/verify-email')
          .set('X-Forwarded-For', testIp)
          .send({ email: 'nobody@example.com', otp: '123456' });
      }
      expect(lastRes.status).toBe(429);
      expect(lastRes.body.error.code).toBe('VERIFICATION_RATE_LIMIT_EXCEEDED');
    } finally {
      process.env.ENABLE_TEST_RATE_LIMIT = 'false';
    }
  });
});
