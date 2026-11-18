import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const http = require('http');
const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const { startTestDatabase, resetTestState, stopTestDatabase } = require('../helpers/testDb');
const { registerAndVerifyCandidate } = require('../helpers/candidateAuthHelper');
const { createApp } = require('../../src/app');
const env = require('../../src/config/env');
const { getModels, withTransaction } = require('../../src/config/database');
const authAdapter = require('../../src/integrations/auth/auth.adapter');
const notificationAdapter = require('../../src/integrations/notification/notification.adapter');
const { seedOrganisationRoles } = require('../../src/db/seed');

let app;

async function setupOrgAndStaff(orgName, prefix) {
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
    industry: 'SaaS',
    companySize: '50-200',
    adminName: `${orgName} Admin`,
    adminEmail: `admin@${prefix}.io`
  });
  const subId = subRes.body.data.id;

  await request(app)
    .post(`/api/v1/subscriptions/${subId}/payments`)
    .field('paymentReference', `PAY-${subId.slice(0, 8)}`)
    .field('paymentMethod', 'ACH');

  const verifyRes = await request(app)
    .post(`/api/v1/subscriptions/platform-admin/${subId}/verify`)
    .set('Authorization', `Bearer ${platformToken}`)
    .send({ decision: 'APPROVE' });

  const actRes = await request(app).post('/api/v1/subscriptions/activate').send({
    activationToken: verifyRes.body.data.invitationPreview.activationToken,
    password: 'Password!2026'
  });

  const organisationId = actRes.body.data.user.organisationId;
  const adminToken = actRes.body.data.token;

  const hire = async (name, email, roleCode) => {
    const res = await request(app)
      .post('/api/v1/organisations/employees')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ fullName: name, email, roleCode, department: 'Eng', designation: roleCode });
    const emp = res.body.data;
    const token = authAdapter.signAccessToken({
      sub: emp.authUserId,
      email: emp.email,
      name: emp.fullName,
      organisationId,
      employeeId: emp.employeeId,
      userType: 'ORG_USER',
      roles: [roleCode]
    });
    return { ...emp, token };
  };

  const recruiter = await hire('Recruiter One', `rec@${prefix}.io`, 'RECRUITER');
  const tech = await hire('Tech One', `tech@${prefix}.io`, 'TECHNICAL_INTERVIEWER');
  const senior = await hire('Senior One', `senior@${prefix}.io`, 'SENIOR_INTERVIEWER');

  return { subId, organisationId, adminToken, platformToken, recruiter, tech, senior };
}

describe('Phase 4 Comprehensive Security, Tenant, RBAC, File & Integrity Regression Suite', () => {
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

  it('enforces authentication boundaries across org, platform-admin, and candidate token types', async () => {
    const tenant = await setupOrgAndStaff('AuthGuard Corp', 'authguard');

    const { token: candToken } = await registerAndVerifyCandidate(request, app, {
      fullName: 'Alice Candidate',
      email: 'alice.cand@example.com',
      password: 'CandPassword#2026'
    });

    // Candidate token rejected across all org & platform-admin routes
    for (const path of ['/api/v1/jobs', '/api/v1/candidates', '/api/v1/offers', '/api/v1/reports/summary', '/api/v1/audit-logs']) {
      const res = await request(app).get(path).set('Authorization', `Bearer ${candToken}`);
      expect(res.status).toBe(403);
    }

    // Org employee & platform-admin tokens rejected on Candidate Portal routes
    const orgOnPortal = await request(app)
      .get('/api/v1/portal/overview')
      .set('Authorization', `Bearer ${tenant.recruiter.token}`);
    expect(orgOnPortal.status).toBe(403);

    const paOnPortal = await request(app)
      .get('/api/v1/portal/overview')
      .set('Authorization', `Bearer ${tenant.platformToken}`);
    expect(paOnPortal.status).toBe(403);

    // Recruiter rejected on Platform Admin & Role Management routes
    const recOnPlatform = await request(app)
      .get('/api/v1/subscriptions/platform-admin/queue')
      .set('Authorization', `Bearer ${tenant.recruiter.token}`);
    expect(recOnPlatform.status).toBe(403);

    // Platform Admin rejected on tenant employee routes
    const paOnTenantJobs = await request(app)
      .get('/api/v1/jobs')
      .set('Authorization', `Bearer ${tenant.platformToken}`);
    expect(paOnTenantJobs.status).toBe(403);
  });

  it('blocks all cross-tenant reads, updates, deletes, nested accesses, and cross-candidate offer actions', async () => {
    const tenantA = await setupOrgAndStaff('Alpha Org', 'alphaorg');
    const tenantB = await setupOrgAndStaff('Beta Org', 'betaorg');

    const jobRes = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${tenantA.recruiter.token}`)
      .send({
        title: 'Tenant A Exclusive Role',
        description: 'Architect multi-tenant isolation guarantees and secure service boundaries.',
        department: 'Security',
        location: 'Remote',
        publishImmediately: true
      });
    expect(jobRes.status).toBe(201);
    const jobIdA = jobRes.body.data.id;

    // Candidate A & B registration, email verification + Candidate A application
    const { token: candAToken } = await registerAndVerifyCandidate(request, app, {
      fullName: 'Cand A',
      email: 'canda@example.com',
      password: 'Password#2026'
    });
    const { token: candBToken } = await registerAndVerifyCandidate(request, app, {
      fullName: 'Cand B',
      email: 'candb@example.com',
      password: 'Password#2026'
    });

    const applyRes = await request(app)
      .post(`/api/v1/applications/public/jobs/${jobIdA}/apply`)
      .set('Authorization', `Bearer ${candAToken}`)
      .field('fullName', 'Cand A')
      .field('email', 'canda@example.com')
      .field('mobileNumber', '+1-555-0144')
      .field('location', 'Denver')
      .field('totalExperienceYears', '6')
      .attach('resume', Buffer.from('%PDF-1.4 Cand A Resume'), {
        filename: 'cand_a.pdf',
        contentType: 'application/pdf'
      });
    expect(applyRes.status).toBe(201);
    const appIdA = applyRes.body.data.applicationId;

    // Cross-tenant GET & PATCH on jobs & applications
    expect(
      (await request(app).get(`/api/v1/jobs/${jobIdA}`).set('Authorization', `Bearer ${tenantB.recruiter.token}`)).status
    ).toBe(404);
    expect(
      (
        await request(app)
          .patch(`/api/v1/jobs/${jobIdA}`)
          .set('Authorization', `Bearer ${tenantB.recruiter.token}`)
          .send({ location: 'Tampered' })
      ).status
    ).toBe(404);
    expect(
      (
        await request(app)
          .post(`/api/v1/applications/${appIdA}/screen`)
          .set('Authorization', `Bearer ${tenantB.recruiter.token}`)
          .send({ decision: 'SHORTLIST' })
      ).status
    ).toBe(404);
    // Query parameter tampering cannot override JWT tenant
    expect(
      (
        await request(app)
          .get(`/api/v1/applications/${appIdA}?organisationId=${tenantA.organisationId}`)
          .set('Authorization', `Bearer ${tenantB.recruiter.token}`)
      ).status
    ).toBe(404);

    // Move to offer stage to test RBAC salary isolation, file download scoping, and cross-candidate offer denial
    await request(app)
      .post(`/api/v1/applications/${appIdA}/screen`)
      .set('Authorization', `Bearer ${tenantA.recruiter.token}`)
      .send({
        decision: 'SHORTLIST',
        technicalInterviewerEmployeeId: tenantA.tech.employeeId,
        scheduledAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        meetingMode: 'VIDEO',
        meetingLinkOrLocation: 'https://meet.nexnuv.io/a'
      });

    const techList = await request(app)
      .get('/api/v1/interviews/assigned/technical')
      .set('Authorization', `Bearer ${tenantA.tech.token}`);
    const techIvId = techList.body.data[0].id;

    // Technical Interviewer CANNOT create/modify salary offers or view audit logs
    const techCreateOffer = await request(app)
      .post('/api/v1/offers')
      .set('Authorization', `Bearer ${tenantA.tech.token}`)
      .field('applicationId', appIdA)
      .field('offeredSalary', '999999')
      .field('designation', 'Hack')
      .field('department', 'Eng')
      .field('joiningDate', new Date(Date.now() + 20 * 24 * 3600 * 1000).toISOString())
      .field('offerValidUntil', new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString());
    expect(techCreateOffer.status).toBe(403);

    await request(app)
      .post(`/api/v1/interviews/${techIvId}/feedback`)
      .set('Authorization', `Bearer ${tenantA.tech.token}`)
      .send({
        overallRating: 9,
        technicalSkillsRating: 9,
        strengths: 'Strong',
        weaknesses: 'None',
        detailedFeedback: 'SECRET_EVALUATION_NOTE',
        recommendation: 'SELECTED'
      });

    await request(app)
      .post(`/api/v1/applications/${appIdA}/final-decision`)
      .set('Authorization', `Bearer ${tenantA.recruiter.token}`)
      .send({ decision: 'SELECTED', notes: 'Approved' });

    const offerRes = await request(app)
      .post('/api/v1/offers')
      .set('Authorization', `Bearer ${tenantA.recruiter.token}`)
      .field('applicationId', appIdA)
      .field('offeredSalary', '145000')
      .field('designation', 'Senior Engineer')
      .field('department', 'Security')
      .field('joiningDate', new Date(Date.now() + 20 * 24 * 3600 * 1000).toISOString())
      .field('offerValidUntil', new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString())
      .field('sendImmediately', 'true')
      .attach('offerLetter', Buffer.from('%PDF-1.4 Confidential Offer'), {
        filename: 'offer.pdf',
        contentType: 'application/pdf'
      });
    expect(offerRes.status).toBe(201);
    const offerIdA = offerRes.body.data.id;
    const offerDownloadUrl = offerRes.body.data.documents[0].downloadUrl;

    // Cross-candidate offer response denied & Candidate B sees zero applications
    const candBPortal = await request(app).get('/api/v1/portal/overview').set('Authorization', `Bearer ${candBToken}`);
    expect(candBPortal.status).toBe(200);
    expect(candBPortal.body.data.applications).toHaveLength(0);

    const candBRespond = await request(app)
      .post(`/api/v1/portal/offers/${offerIdA}/respond`)
      .set('Authorization', `Bearer ${candBToken}`)
      .send({ decision: 'ACCEPT' });
    expect(candBRespond.status).toBe(404);

    // File download authorization checks:
    // 1. Unauthenticated -> 401
    expect((await request(app).get(offerDownloadUrl)).status).toBe(401);
    // 2. Cross-tenant -> 403
    expect(
      (await request(app).get(offerDownloadUrl).set('Authorization', `Bearer ${tenantB.recruiter.token}`)).status
    ).toBe(403);
    // 3. Cross-candidate -> 403
    expect((await request(app).get(offerDownloadUrl).set('Authorization', `Bearer ${candBToken}`)).status).toBe(403);
    // 4. Technical interviewer lacks offer:view -> 403
    expect((await request(app).get(offerDownloadUrl).set('Authorization', `Bearer ${tenantA.tech.token}`)).status).toBe(403);
    // 5. Owning Candidate A & Recruiter A succeed -> 200
    expect((await request(app).get(offerDownloadUrl).set('Authorization', `Bearer ${candAToken}`)).status).toBe(200);
    expect(
      (await request(app).get(offerDownloadUrl).set('Authorization', `Bearer ${tenantA.recruiter.token}`)).status
    ).toBe(200);
  });

  it('rejects malicious uploads (extension spoofing, magic-byte mismatch, oversize), tampered amounts, unsafe URIs, and expired subs', async () => {
    const tenant = await setupOrgAndStaff('FileSec Corp', 'filesec');
    const jobRes = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${tenant.recruiter.token}`)
      .send({
        title: 'FileSec Engineer',
        description: 'Enforce strict upload validation, MIME signature checks, and expiration guards.',
        department: 'Sec',
        location: 'Remote',
        publishImmediately: true
      });
    const jobId = jobRes.body.data.id;

    // 1. Fake HTML script disguised as application/pdf with .pdf extension -> 400 INVALID_FILE_SIGNATURE
    const htmlSpoof = await request(app)
      .post(`/api/v1/applications/public/jobs/${jobId}/apply`)
      .field('fullName', 'Spoofer')
      .field('email', 'spoof1@example.com')
      .field('mobileNumber', '555-1111')
      .field('location', 'NYC')
      .field('totalExperienceYears', '3')
      .attach('resume', Buffer.from('<script>alert(1)</script>'), {
        filename: 'evil.pdf',
        contentType: 'application/pdf'
      });
    expect(htmlSpoof.status).toBe(400);
    expect(htmlSpoof.body.error.code).toBe('INVALID_FILE_SIGNATURE');

    // 2. Dangerous .exe extension with spoofed application/pdf Content-Type -> 400 UNSUPPORTED_FILE_EXTENSION
    const extSpoof = await request(app)
      .post(`/api/v1/applications/public/jobs/${jobId}/apply`)
      .field('fullName', 'Spoofer Two')
      .field('email', 'spoof2@example.com')
      .field('mobileNumber', '555-2222')
      .field('location', 'NYC')
      .field('totalExperienceYears', '3')
      .attach('resume', Buffer.from('%PDF-1.4 payload'), {
        filename: 'payload.exe',
        contentType: 'application/pdf'
      });
    expect(extSpoof.status).toBe(400);
    expect(extSpoof.body.error.code).toBe('UNSUPPORTED_FILE_EXTENSION');

    // 3. Oversized file (> env.storage.maxUploadSizeMb) -> 400 FILE_UPLOAD_ERROR
    const oversizedBuf = Buffer.concat([Buffer.from('%PDF-1.4 '), Buffer.alloc((env.storage.maxUploadSizeMb + 1) * 1024 * 1024, 0x41)]);
    const oversizeRes = await request(app)
      .post(`/api/v1/applications/public/jobs/${jobId}/apply`)
      .field('fullName', 'Large File')
      .field('email', 'large@example.com')
      .field('mobileNumber', '555-3333')
      .field('location', 'NYC')
      .field('totalExperienceYears', '3')
      .attach('resume', oversizedBuf, {
        filename: 'huge.pdf',
        contentType: 'application/pdf'
      });
    expect(oversizeRes.status).toBe(400);
    expect(oversizeRes.body.error.code).toBe('FILE_UPLOAD_ERROR');

    // 4. Reject javascript: URI in linkedinUrl & prototype pollution keys in recruitmentConfig
    const jsUrlRes = await request(app)
      .post(`/api/v1/applications/public/jobs/${jobId}/apply`)
      .field('fullName', 'XSS Attempt')
      .field('email', 'xss@example.com')
      .field('mobileNumber', '555-4444')
      .field('location', 'NYC')
      .field('totalExperienceYears', '3')
      .field('linkedinUrl', 'javascript:alert(1)')
      .attach('resume', Buffer.from('%PDF-1.4 resume'), { filename: 'cv.pdf', contentType: 'application/pdf' });
    expect(jsUrlRes.status).toBe(422);

    const protoRes = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${tenant.recruiter.token}`)
      .set('Content-Type', 'application/json')
      .send('{"title":"Proto Test","description":"Verify prototype pollution keys rejected cleanly.","department":"Sec","location":"Remote","recruitmentConfig":{"__proto__":{"admin":true}}}');
    expect(protoRes.status).toBe(422);

    // 5. Tampered payment amount rejected
    const badPaySub = await request(app).post('/api/v1/subscriptions').send({
      organisationName: 'Cheapskate Ltd',
      organisationDomain: 'cheap.io',
      industry: 'SaaS',
      companySize: '10-50',
      adminName: 'Bob',
      adminEmail: 'bob@cheap.io'
    });
    const payTamper = await request(app)
      .post(`/api/v1/subscriptions/${badPaySub.body.data.id}/payments`)
      .field('paymentReference', 'TAMPER-001')
      .field('paymentMethod', 'WIRE')
      .field('amountCents', '1');
    expect(payTamper.status).toBe(400);

    // 6. Transaction rollback leaves zero dangling jobs when failure happens inside tx
    const { Job } = getModels();
    const jobsBefore = await Job.count({ where: { organisationId: tenant.organisationId } });
    await expect(
      withTransaction(async (tx) => {
        await Job.create(
          {
            organisationId: tenant.organisationId,
            jobSourceId: jobRes.body.data.jobSourceId,
            sourceType: 'MANUAL',
            title: 'Should Rollback',
            description: 'Must not persist when subsequent FK fails',
            department: 'Sec',
            experienceLabel: '2+ years',
            salaryDisplay: 'Competitive',
            location: 'Remote',
            employmentType: 'FULL_TIME',
            status: 'DRAFT'
          },
          { transaction: tx }
        );
        // Invalid FK violates constraint and forces full rollback
        await Job.create(
          {
            organisationId: tenant.organisationId,
            jobSourceId: uuidv4(),
            sourceType: 'MANUAL',
            title: 'Broken FK',
            description: 'Triggers FK violation',
            department: 'Sec',
            experienceLabel: '2+ years',
            salaryDisplay: 'Competitive',
            location: 'Remote',
            employmentType: 'FULL_TIME',
            status: 'DRAFT'
          },
          { transaction: tx }
        );
      })
    ).rejects.toThrow();
    const jobsAfter = await Job.count({ where: { organisationId: tenant.organisationId } });
    expect(jobsAfter).toBe(jobsBefore);

    // 7. Expired local Subscription expiresAt blocks API even when status === ACTIVE
    const { Subscription } = getModels();
    await Subscription.update(
      { expiresAt: new Date(Date.now() - 60 * 1000) },
      { where: { id: tenant.subId } }
    );
    const expiredAccess = await request(app)
      .get('/api/v1/jobs')
      .set('Authorization', `Bearer ${tenant.recruiter.token}`);
    expect(expiredAccess.status).toBe(403);
    expect(expiredAccess.body.error.code).toBe('SUBSCRIPTION_INACTIVE');
  });

  it('distinguishes Notification Service ACCEPTED, DELIVERED, UNKNOWN (timeout) and FAILED, and fails closed when employee deleted in live mode', async () => {
    const origMode = env.integrationMode;
    const origNotifUrl = env.services.notificationUrl;
    const origEmpUrl = env.services.employeeUrl;
    const origTimeout = env.services.requestTimeoutMs;
    const servers = [];

    try {
      await seedOrganisationRoles('11111111-1111-4111-8111-111111111111');
      const startServer = (fn) =>
        new Promise((resolve) => {
          const s = http.createServer(fn);
          s.listen(0, '127.0.0.1', () => {
            servers.push(s);
            resolve(`http://127.0.0.1:${s.address().port}`);
          });
        });

      let notifMode = 'delivered';
      env.integrationMode = 'live';
      env.services.requestTimeoutMs = 150;
      env.services.notificationUrl = await startServer((_req, res) => {
        if (notifMode === 'timeout') return; // intentionally hang
        if (notifMode === 'accepted') {
          res.writeHead(201, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, data: { id: uuidv4() } }));
        }
        res.writeHead(201, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, data: { id: uuidv4(), emailDelivery: { sent: true, delivered: true } } }));
      });

      const deliveredRes = await notificationAdapter.dispatchNotification({
        eventType: 'APPLICATION_RECEIVED',
        organisationId: '11111111-1111-4111-8111-111111111111',
        recipientEmail: 'cand@example.com'
      });
      expect(deliveredRes.deliveryStatus).toBe('DELIVERED');
      expect(deliveredRes.delivered).toBe(true);

      notifMode = 'accepted';
      const acceptedRes = await notificationAdapter.dispatchNotification({
        eventType: 'APPLICATION_RECEIVED',
        organisationId: '11111111-1111-4111-8111-111111111111',
        recipientEmail: 'cand@example.com'
      });
      expect(acceptedRes.deliveryStatus).toBe('ACCEPTED');
      expect(acceptedRes.requestAccepted).toBe(true);
      expect(acceptedRes.delivered).toBe(false);

      notifMode = 'timeout';
      const unknownRes = await notificationAdapter.dispatchNotification({
        eventType: 'APPLICATION_RECEIVED',
        organisationId: '11111111-1111-4111-8111-111111111111',
        recipientEmail: 'cand@example.com'
      });
      expect(unknownRes.deliveryStatus).toBe('UNKNOWN');
      expect(unknownRes.delivered).toBe(false);

      // Deleted employee in live Employee Service -> ACCESS_REVOKED (403)
      env.services.employeeUrl = await startServer((_req, res) => {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Employee not found' }));
      });
      env.services.getRetryAttempts = 1;
      const empAdapter = require('../../src/integrations/employee/employee.adapter');
      const { resolveEffectivePermissions } = require('../../src/middleware/rbac');
      const roles = await seedOrganisationRoles('aaaaaaaa-1111-4111-8111-111111111111');
      const { EmployeeRoleAssignment } = getModels();
      await EmployeeRoleAssignment.create({
        organisationId: 'aaaaaaaa-1111-4111-8111-111111111111',
        employeeId: '22222222-2222-4222-8222-222222222222',
        authUserId: '33333333-3333-4333-8333-333333333333',
        roleId: roles.RECRUITER.id,
        isActive: true
      });
      expect(await empAdapter.getEmployeeById('aaaaaaaa-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222')).toBeNull();
      const resolved = await resolveEffectivePermissions({
        userId: '33333333-3333-4333-8333-333333333333',
        employeeId: '22222222-2222-4222-8222-222222222222',
        organisationId: 'aaaaaaaa-1111-4111-8111-111111111111',
        userType: 'ORG_USER'
      });
      expect(resolved).toBeNull();
    } finally {
      env.integrationMode = origMode;
      env.services.notificationUrl = origNotifUrl;
      env.services.employeeUrl = origEmpUrl;
      env.services.requestTimeoutMs = origTimeout;
      await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
    }
  });
});

