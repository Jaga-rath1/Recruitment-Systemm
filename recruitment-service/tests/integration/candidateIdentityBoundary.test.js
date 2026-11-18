import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const http = require('http');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const { startTestDatabase, resetTestState, stopTestDatabase } = require('../helpers/testDb');
const { createEmailCaptureHarness, registerAndVerifyCandidate } = require('../helpers/candidateAuthHelper');
const { createApp } = require('../../src/app');
const env = require('../../src/config/env');
const { getModels } = require('../../src/config/database');
const authAdapter = require('../../src/integrations/auth/auth.adapter');
const { seedOrganisationRoles } = require('../../src/db/seed');

let app;

async function provisionTenant(orgName, prefix) {
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
    industry: 'Technology',
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

  const activationToken = verifyRes.body.data.invitationPreview.activationToken;
  const actRes = await request(app).post('/api/v1/subscriptions/activate').send({
    activationToken,
    password: 'AdminPassword#2026'
  });

  const organisationId = actRes.body.data.user.organisationId;
  const adminToken = actRes.body.data.token;

  const empRes = await request(app)
    .post('/api/v1/organisations/employees')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      fullName: 'Interviewer One',
      email: `tech@${prefix}.io`,
      roleCode: 'TECHNICAL_INTERVIEWER',
      department: 'Engineering',
      designation: 'Senior Engineer'
    });
  const techEmp = empRes.body.data;
  const techToken = authAdapter.signAccessToken({
    sub: techEmp.authUserId,
    email: techEmp.email,
    name: techEmp.fullName,
    organisationId,
    employeeId: techEmp.employeeId,
    userType: 'ORG_USER',
    roles: ['TECHNICAL_INTERVIEWER']
  });

  return {
    subId,
    organisationId,
    adminToken,
    platformToken,
    activationToken,
    techEmp,
    techToken
  };
}

describe('Phase 4.2 — Candidate Identity & Authentication Boundary Audit Suite', () => {
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

  it('Section A: validates Candidate JWT cryptography, secret separation, boundaries, and disabled-account revocation', async () => {
    const tenant = await provisionTenant('BoundaryAlpha', 'boundaryalpha');
    expect(env.jwt.candidateSecret).not.toBe(env.jwt.secret);

    const { registerRes, token: candToken, user: candUser } = await registerAndVerifyCandidate(request, app, {
      fullName: 'Alice Candidate',
      email: 'alice.cand@example.com',
      password: 'CandidatePass#2026'
    });
    expect(registerRes.status).toBe(201);
    expect(registerRes.body.data.token).toBeUndefined();
    const candId = candUser.userId;

    // 1. Valid candidate token works on /auth/me and /portal/overview
    const meRes = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${candToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.user.userType).toBe('CANDIDATE');
    expect(meRes.body.data.user.activeRoleCode).toBe('CANDIDATE');
    expect(meRes.body.data.user.organisationId).toBeNull();

    const portalRes = await request(app)
      .get('/api/v1/portal/overview')
      .set('Authorization', `Bearer ${candToken}`);
    expect(portalRes.status).toBe(200);

    // 2. Expired candidate token rejected (401)
    const expiredCandToken = jwt.sign(
      {
        sub: candId,
        userId: candId,
        email: 'alice.cand@example.com',
        organisationId: null,
        employeeId: null,
        userType: 'CANDIDATE',
        roles: ['CANDIDATE']
      },
      env.jwt.candidateSecret,
      {
        algorithm: 'HS256',
        issuer: 'nexnuv-recruitment-candidate',
        audience: 'nexnuv-candidate-portal',
        expiresIn: -30
      }
    );
    const expRes = await request(app)
      .get('/api/v1/portal/overview')
      .set('Authorization', `Bearer ${expiredCandToken}`);
    expect(expRes.status).toBe(401);

    // 3. Wrong-signature token (including signed with JWT_SECRET instead of CANDIDATE_JWT_SECRET) & alg:none rejected (401)
    const wrongKeyCandToken = jwt.sign(
      {
        sub: candId,
        userId: candId,
        email: 'alice.cand@example.com',
        userType: 'CANDIDATE',
        roles: ['CANDIDATE']
      },
      env.jwt.secret,
      {
        algorithm: 'HS256',
        issuer: 'nexnuv-recruitment-candidate',
        audience: 'nexnuv-candidate-portal',
        expiresIn: '1h'
      }
    );
    expect(
      (await request(app).get('/api/v1/portal/overview').set('Authorization', `Bearer ${wrongKeyCandToken}`)).status
    ).toBe(401);

    const forgedClaimsCandToken = jwt.sign(
      {
        sub: candId,
        organisationId: tenant.organisationId,
        userType: 'ORG_USER',
        roles: ['ORGANISATION_ADMIN']
      },
      env.jwt.candidateSecret,
      {
        algorithm: 'HS256',
        issuer: 'nexnuv-recruitment-candidate',
        audience: 'nexnuv-candidate-portal',
        expiresIn: '1h'
      }
    );
    expect(
      (await request(app).get('/api/v1/portal/overview').set('Authorization', `Bearer ${forgedClaimsCandToken}`)).status
    ).toBe(401);

    const algNoneToken = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${Buffer.from(
      JSON.stringify({
        sub: candId,
        userType: 'CANDIDATE',
        iss: 'nexnuv-recruitment-candidate',
        aud: 'nexnuv-candidate-portal'
      })
    ).toString('base64url')}.`;
    expect(
      (await request(app).get('/api/v1/portal/overview').set('Authorization', `Bearer ${algNoneToken}`)).status
    ).toBe(401);

    // 4 & 5. Candidate token blocked on Admin, Recruiter, Employee & Integration routes (403)
    const blockedRoutes = [
      ['get', '/api/v1/subscriptions/platform-admin/queue'],
      ['get', '/api/v1/organisations/profile'],
      ['get', '/api/v1/organisations/employees'],
      ['get', '/api/v1/roles'],
      ['get', '/api/v1/jobs'],
      ['get', '/api/v1/candidates'],
      ['get', '/api/v1/applications'],
      ['get', '/api/v1/interviews'],
      ['get', '/api/v1/offers'],
      ['get', '/api/v1/joining'],
      ['get', '/api/v1/reports/summary'],
      ['get', '/api/v1/audit-logs'],
      ['post', '/api/v1/jobs/hrms/sync']
    ];
    for (const [method, url] of blockedRoutes) {
      const res = await request(app)[method](url).set('Authorization', `Bearer ${candToken}`);
      expect(res.status).toBe(403);
    }

    // Spoofed gateway headers alongside candidate or no bearer cannot mint admin access
    const spoofRes = await request(app)
      .get('/api/v1/organisations/profile')
      .set('x-internal-token', 'wrong-secret')
      .set('x-user-id', uuidv4())
      .set('x-user-role', 'org_admin')
      .set('x-organization-id', tenant.organisationId);
    expect(spoofRes.status).toBe(401);

    // 6. Cross-candidate ownership protection: Candidate B cannot claim Victim A's public apply or download docs
    const jobRes = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${tenant.adminToken}`)
      .send({
        title: 'Security Architect',
        description: 'Verify candidate profile isolation and ownership protection.',
        department: 'Security',
        location: 'Remote',
        publishImmediately: true
      });
    const jobId = jobRes.body.data.id;

    // Victim applies publicly without logging in (authUserId = null)
    const victimApply = await request(app)
      .post(`/api/v1/applications/public/jobs/${jobId}/apply`)
      .field('fullName', 'Victim Applicant')
      .field('email', 'victim.public@example.com')
      .field('mobileNumber', '+1-555-0188')
      .field('location', 'Seattle')
      .field('totalExperienceYears', '5')
      .attach('resume', Buffer.from('%PDF-1.4 Victim Resume'), { filename: 'victim.pdf', contentType: 'application/pdf' });
    expect(victimApply.status).toBe(201);

    // Attacker (Alice Candidate, alice.cand@example.com) applies while authenticated with Alice's Bearer token
    // attempting to specify Victim's email in the form body!
    const hijackJobRes = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${tenant.adminToken}`)
      .send({
        title: 'Platform Engineer',
        description: 'Ensure mismatched authenticated email cannot link someone else record.',
        department: 'Engineering',
        location: 'Remote',
        publishImmediately: true
      });
    const secondJobId = hijackJobRes.body.data.id;

    const hijackApply = await request(app)
      .post(`/api/v1/applications/public/jobs/${secondJobId}/apply`)
      .set('Authorization', `Bearer ${candToken}`)
      .field('fullName', 'Overwritten By Attacker')
      .field('email', 'victim.public@example.com')
      .field('mobileNumber', '+1-555-9999')
      .field('location', 'Nowhere')
      .field('totalExperienceYears', '1')
      .attach('resume', Buffer.from('%PDF-1.4 Hijack'), { filename: 'hijack.pdf', contentType: 'application/pdf' });
    expect(hijackApply.status).toBe(201);

    // Verify Alice does NOT see Victim's applications in Alice's Candidate Portal!
    const alicePortal = await request(app)
      .get('/api/v1/portal/overview')
      .set('Authorization', `Bearer ${candToken}`);
    expect(alicePortal.status).toBe(200);
    expect(alicePortal.body.data.applications).toHaveLength(0);

    // Verify Victim's Candidate row was NOT linked to Alice's authUserId!
    const { Candidate, CandidateAccount } = getModels();
    const victimRow = await Candidate.findOne({ where: { email: 'victim.public@example.com' } });
    expect(victimRow.authUserId).toBeNull();

    // Disable Alice CandidateAccount -> existing JWT immediately rejected (401)
    await CandidateAccount.update({ isActive: false }, { where: { id: candId } });
    const afterDisable = await request(app)
      .get('/api/v1/portal/overview')
      .set('Authorization', `Bearer ${candToken}`);
    expect(afterDisable.status).toBe(401);
  });

  it('Section B: enforces Employee & Admin JWT boundaries, role denials, inactive/deleted revocation, and non-linking on public apply', async () => {
    const tenant = await provisionTenant('BoundaryBeta', 'boundarybeta');

    // 1. Valid employee token succeeds on assigned least-privilege route (/interviews/assigned/technical), denied on /jobs
    const validEmpTech = await request(app)
      .get('/api/v1/interviews/assigned/technical')
      .set('Authorization', `Bearer ${tenant.techToken}`);
    expect(validEmpTech.status).toBe(200);

    const deniedTechJobs = await request(app)
      .get('/api/v1/jobs')
      .set('Authorization', `Bearer ${tenant.techToken}`);
    expect(deniedTechJobs.status).toBe(403);

    // 2. Expired employee token rejected (401)
    const expiredEmpToken = jwt.sign(
      {
        sub: tenant.techEmp.authUserId,
        email: tenant.techEmp.email,
        organisationId: tenant.organisationId,
        employeeId: tenant.techEmp.employeeId,
        userType: 'ORG_USER',
        roles: ['TECHNICAL_INTERVIEWER']
      },
      env.jwt.secret,
      {
        algorithm: 'HS256',
        issuer: env.jwt.issuer,
        audience: env.jwt.audience,
        expiresIn: -60
      }
    );
    expect(
      (await request(app).get('/api/v1/jobs').set('Authorization', `Bearer ${expiredEmpToken}`)).status
    ).toBe(401);

    // 3. Employee & Platform Admin tokens rejected on Candidate Portal routes (403)
    expect(
      (await request(app).get('/api/v1/portal/overview').set('Authorization', `Bearer ${tenant.techToken}`)).status
    ).toBe(403);
    expect(
      (
        await request(app)
          .patch('/api/v1/portal/profile')
          .set('Authorization', `Bearer ${tenant.adminToken}`)
          .send({ headline: 'Tamper' })
      ).status
    ).toBe(403);
    expect(
      (
        await request(app)
          .post(`/api/v1/portal/offers/${uuidv4()}/respond`)
          .set('Authorization', `Bearer ${tenant.platformToken}`)
          .send({ decision: 'ACCEPT' })
      ).status
    ).toBe(403);

    // Employee applying publicly with Employee Bearer token does NOT store Employee authUserId in candidates.auth_user_id
    const jobRes = await request(app)
      .post('/api/v1/jobs')
      .set('Authorization', `Bearer ${tenant.adminToken}`)
      .send({
        title: 'Internal Referrer Job',
        description: 'Employee public apply must not pollute candidate authUserId.',
        department: 'Engineering',
        location: 'Remote',
        publishImmediately: true
      });
    const empPublicApply = await request(app)
      .post(`/api/v1/applications/public/jobs/${jobRes.body.data.id}/apply`)
      .set('Authorization', `Bearer ${tenant.techToken}`)
      .field('fullName', 'Tech Staff')
      .field('email', tenant.techEmp.email)
      .field('mobileNumber', '+1-555-0102')
      .field('location', 'NYC')
      .field('totalExperienceYears', '7')
      .attach('resume', Buffer.from('%PDF-1.4 Emp Resume'), { filename: 'emp.pdf', contentType: 'application/pdf' });
    expect(empPublicApply.status).toBe(201);

    const { Candidate } = getModels();
    const empAsCandRow = await Candidate.findOne({ where: { email: tenant.techEmp.email } });
    expect(empAsCandRow.authUserId).toBeNull();

    // 4. Wrong role checks: Tech Interviewer denied Offer/Employee/Platform endpoints
    expect(
      (await request(app).get('/api/v1/offers').set('Authorization', `Bearer ${tenant.techToken}`)).status
    ).toBe(403);
    expect(
      (await request(app).get('/api/v1/organisations/employees').set('Authorization', `Bearer ${tenant.techToken}`)).status
    ).toBe(403);
    expect(
      (
        await request(app)
          .post('/api/v1/organisations/employees')
          .set('Authorization', `Bearer ${tenant.adminToken}`)
          .send({ fullName: 'Fake Role', email: 'fakerole@boundarybeta.io', roleCode: 'CANDIDATE' })
      ).status
    ).toBe(400);

    // 5. Deactivated employee assignment immediately revoked (403 ACCESS_REVOKED)
    const deactRes = await request(app)
      .patch(`/api/v1/organisations/employees/${tenant.techEmp.employeeId}/deactivate`)
      .set('Authorization', `Bearer ${tenant.adminToken}`);
    expect(deactRes.status).toBe(200);

    const blockedTech = await request(app)
      .get('/api/v1/interviews/assigned/technical')
      .set('Authorization', `Bearer ${tenant.techToken}`);
    expect(blockedTech.status).toBe(403);
    expect(blockedTech.body.error.code).toBe('ACCESS_REVOKED');

    // 6. Live-mode inactive/deleted Employee Service check via isolated HTTP contract harness
    const empIdLive = 'aaaaaaaa-2222-4222-8222-222222222222';
    const userIdLive = 'bbbbbbbb-3333-4333-8333-333333333333';
    const orgIdLive = tenant.organisationId;
    await seedOrganisationRoles(orgIdLive);
    const { RecruitmentRole, EmployeeRoleAssignment } = getModels();
    const techRole = await RecruitmentRole.findOne({
      where: { organisationId: orgIdLive, code: 'TECHNICAL_INTERVIEWER' }
    });
    await EmployeeRoleAssignment.create({
      organisationId: orgIdLive,
      employeeId: empIdLive,
      authUserId: userIdLive,
      roleId: techRole.id,
      isActive: true
    });

    let liveEmployeeState = 'inactive';
    const mockAuthSrv = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/api/v1/auth/me') {
        res.statusCode = 200;
        return res.end(
          JSON.stringify({
            user: {
              id: userIdLive,
              employeeId: empIdLive,
              email: 'live.tech@boundarybeta.io',
              role: 'employee',
              organizationId: orgIdLive,
              mustChangePassword: false
            }
          })
        );
      }
      res.statusCode = 404;
      return res.end(JSON.stringify({ message: 'Not found' }));
    });
    const mockOrgSrv = http.createServer((_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      res.end(JSON.stringify({ data: { id: orgIdLive, name: 'BoundaryBeta', status: 'active' } }));
    });
    const mockPlatSrv = http.createServer((_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      res.end(JSON.stringify({ data: { active: true } }));
    });
    const mockEmpSrv = http.createServer((_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (liveEmployeeState === 'deleted') {
        res.statusCode = 404;
        return res.end(JSON.stringify({ message: 'Employee not found' }));
      }
      res.statusCode = 200;
      return res.end(
        JSON.stringify({
          data: {
            id: empIdLive,
            organizationId: orgIdLive,
            email: 'live.tech@boundarybeta.io',
            status: liveEmployeeState
          }
        })
      );
    });

    await Promise.all([
      new Promise((r) => mockAuthSrv.listen(0, '127.0.0.1', r)),
      new Promise((r) => mockOrgSrv.listen(0, '127.0.0.1', r)),
      new Promise((r) => mockPlatSrv.listen(0, '127.0.0.1', r)),
      new Promise((r) => mockEmpSrv.listen(0, '127.0.0.1', r))
    ]);

    const origMode = env.integrationMode;
    const origAuth = env.services.authUrl;
    const origOrg = env.services.organisationUrl;
    const origPlat = env.services.platformUrl;
    const origEmp = env.services.employeeUrl;

    try {
      env.integrationMode = 'live';
      env.services.authUrl = `http://127.0.0.1:${mockAuthSrv.address().port}`;
      env.services.organisationUrl = `http://127.0.0.1:${mockOrgSrv.address().port}`;
      env.services.platformUrl = `http://127.0.0.1:${mockPlatSrv.address().port}`;
      env.services.employeeUrl = `http://127.0.0.1:${mockEmpSrv.address().port}`;

      const externalOpaqueJwt = jwt.sign(
        { userId: userIdLive, organizationId: orgIdLive, role: 'employee' },
        'external-auth-service-secret-not-shared-with-recruitment'
      );

      liveEmployeeState = 'active';
      const activeLiveRes = await request(app)
        .get('/api/v1/interviews/assigned/technical')
        .set('Authorization', `Bearer ${externalOpaqueJwt}`);
      expect(activeLiveRes.status).toBe(200);

      liveEmployeeState = 'inactive';
      const inactiveLiveRes = await request(app)
        .get('/api/v1/interviews/assigned/technical')
        .set('Authorization', `Bearer ${externalOpaqueJwt}`);
      expect(inactiveLiveRes.status).toBe(403);
      expect(inactiveLiveRes.body.error.code).toBe('ACCESS_REVOKED');

      liveEmployeeState = 'deleted';
      const deletedLiveRes = await request(app)
        .get('/api/v1/interviews/assigned/technical')
        .set('Authorization', `Bearer ${externalOpaqueJwt}`);
      expect(deletedLiveRes.status).toBe(403);
      expect(deletedLiveRes.body.error.code).toBe('ACCESS_REVOKED');
    } finally {
      env.integrationMode = origMode;
      env.services.authUrl = origAuth;
      env.services.organisationUrl = origOrg;
      env.services.platformUrl = origPlat;
      env.services.employeeUrl = origEmp;
      await Promise.all([
        new Promise((r) => mockAuthSrv.close(r)),
        new Promise((r) => mockOrgSrv.close(r)),
        new Promise((r) => mockPlatSrv.close(r)),
        new Promise((r) => mockEmpSrv.close(r))
      ]);
    }
  });

  it('Section C: prevents duplicate accounts, handles concurrent creation, isolates same-email candidate vs employee, and blocks cross-org linking', async () => {
    const orgA = await provisionTenant('IdentityOrgA', 'identityorga');
    const orgB = await provisionTenant('IdentityOrgB', 'identityorgb');

    // 1. Concurrent candidate registration with same normalized email -> 1x 201, 1x 409 (no duplicate rows)
    createEmailCaptureHarness();
    const [r1, r2] = await Promise.all([
      request(app).post('/api/v1/auth/candidate/register').send({
        fullName: 'Race Candidate',
        email: 'Race.User@Example.COM',
        password: 'RacePassword#2026'
      }),
      request(app).post('/api/v1/auth/candidate/register').send({
        fullName: 'Race Candidate',
        email: 'race.user@example.com',
        password: 'RacePassword#2026'
      })
    ]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([201, 409]);

    const { CandidateAccount, EmployeeRoleAssignment } = getModels();
    expect(await CandidateAccount.count({ where: { email: 'race.user@example.com' } })).toBe(1);

    // 2. Duplicate candidate registration sequentially fails 409
    const dupReg = await request(app).post('/api/v1/auth/candidate/register').send({
      fullName: 'Dup User',
      email: 'RACE.USER@example.com',
      password: 'RacePassword#2026'
    });
    expect(dupReg.status).toBe(409);

    // 3. Employee invitation & duplicate case-insensitive employee invitation reuse single Employee & Auth identity
    const inv1 = await request(app)
      .post('/api/v1/organisations/employees')
      .set('Authorization', `Bearer ${orgA.adminToken}`)
      .send({ fullName: 'Nadia Staff', email: 'Nadia.Staff@IdentityOrgA.io', roleCode: 'RECRUITER' });
    expect(inv1.status).toBe(201);

    const inv2 = await request(app)
      .post('/api/v1/organisations/employees')
      .set('Authorization', `Bearer ${orgA.adminToken}`)
      .send({ fullName: 'Nadia Staff', email: 'nadia.staff@identityorga.io', roleCode: 'RECRUITER' });
    expect(inv2.status).toBe(201);
    expect(inv2.body.data.employeeId).toBe(inv1.body.data.employeeId);
    expect(inv2.body.data.authUserId).toBe(inv1.body.data.authUserId);
    expect(
      await EmployeeRoleAssignment.count({
        where: { organisationId: orgA.organisationId, employeeId: inv1.body.data.employeeId }
      })
    ).toBe(1);

    // 4. Candidate + Employee email collision: same person registers CandidateAccount with Nadia's email
    // Candidate registration stays completely separate (CANDIDATE only, cannot touch Org A workspace)
    const nadiaCand = await registerAndVerifyCandidate(request, app, {
      fullName: 'Nadia External Applicant',
      email: 'nadia.staff@identityorga.io',
      password: 'NadiaCandPass#2026'
    });
    expect(nadiaCand.user.userType).toBe('CANDIDATE');
    expect(nadiaCand.user.organisationId).toBeNull();
    expect(
      (await request(app).get('/api/v1/jobs').set('Authorization', `Bearer ${nadiaCand.token}`)).status
    ).toBe(403);

    // Candidate login authenticates CandidateAccount without altering Employee assignment
    const nadiaCandLogin = await request(app).post('/api/v1/auth/candidate/login').send({
      email: 'nadia.staff@identityorga.io',
      password: 'NadiaCandPass#2026'
    });
    expect(nadiaCandLogin.status).toBe(200);
    expect(nadiaCandLogin.body.data.user.userType).toBe('CANDIDATE');

    // 5. Cross-organisation account linking blocked: Org B cannot invite Org A's existing employee email
    const orgBCountBefore = await EmployeeRoleAssignment.count({
      where: { organisationId: orgB.organisationId }
    });
    const crossOrgLink = await request(app)
      .post('/api/v1/organisations/employees')
      .set('Authorization', `Bearer ${orgB.adminToken}`)
      .send({ fullName: 'Nadia CrossOrg', email: 'nadia.staff@identityorga.io', roleCode: 'RECRUITER' });
    expect(crossOrgLink.status).toBe(409);
    expect(crossOrgLink.body.error.code).toBe('CROSS_ORG_AUTH_CONFLICT');
    expect(
      await EmployeeRoleAssignment.count({ where: { organisationId: orgB.organisationId } })
    ).toBe(orgBCountBefore);
    // 6. Concurrent employee creation produces a single EmployeeRoleAssignment without duplicate errors
    const [e1, e2] = await Promise.all([
      request(app)
        .post('/api/v1/organisations/employees')
        .set('Authorization', `Bearer ${orgA.adminToken}`)
        .send({ fullName: 'Concurrent Emp', email: 'concurrent.emp@identityorga.io', roleCode: 'TECHNICAL_INTERVIEWER' }),
      request(app)
        .post('/api/v1/organisations/employees')
        .set('Authorization', `Bearer ${orgA.adminToken}`)
        .send({ fullName: 'Concurrent Emp', email: 'concurrent.emp@identityorga.io', roleCode: 'TECHNICAL_INTERVIEWER' })
    ]);
    expect(e1.status).toBe(201);
    expect(e2.status).toBe(201);
    expect(e1.body.data.employeeId).toBe(e2.body.data.employeeId);
    expect(
      await EmployeeRoleAssignment.count({
        where: { organisationId: orgA.organisationId, employeeId: e1.body.data.employeeId }
      })
    ).toBe(1);
  });

  it('Section D: enforces password/token security, single-use & expired activation tokens, and auth rate limiting', async () => {
    const platformToken = authAdapter.signAccessToken({
      sub: uuidv4(),
      email: 'pa@nexnuv.com',
      name: 'Platform Admin',
      userType: 'PLATFORM_ADMIN',
      roles: ['PLATFORM_ADMIN']
    });

    // Register candidate & test invalid password + non-enumeration identical 401
    createEmailCaptureHarness();
    await request(app).post('/api/v1/auth/candidate/register').send({
      fullName: 'Sec User',
      email: 'secuser@example.com',
      password: 'StrongPassword#2026'
    });
    const wrongPassLogin = await request(app).post('/api/v1/auth/candidate/login').send({
      email: 'secuser@example.com',
      password: 'WrongPassword#999'
    });
    const unknownUserLogin = await request(app).post('/api/v1/auth/candidate/login').send({
      email: 'doesnotexist@example.com',
      password: 'WrongPassword#999'
    });
    expect(wrongPassLogin.status).toBe(401);
    expect(unknownUserLogin.status).toBe(401);
    expect(wrongPassLogin.body.error.message).toBe(unknownUserLogin.body.error.message);

    // Weak short password rejected by schema (422)
    const weakReg = await request(app).post('/api/v1/auth/candidate/register').send({
      fullName: 'Weak User',
      email: 'weak@example.com',
      password: '123'
    });
    expect(weakReg.status).toBe(422);

    // Invalid activation token rejected (404)
    const badAct = await request(app).post('/api/v1/subscriptions/activate').send({
      activationToken: 'invalid-nonexistent-activation-token-1234',
      password: 'ValidPassword#2026'
    });
    expect(badAct.status).toBe(404);

    // Create & verify subscription #1 -> test expired activation token (400)
    const subExpRes = await request(app).post('/api/v1/subscriptions').send({
      organisationName: 'ExpiredTokenOrg',
      organisationDomain: 'exptoken.io',
      industry: 'SaaS',
      companySize: '10-50',
      adminName: 'Exp Admin',
      adminEmail: 'exp@exptoken.io'
    });
    const subExpId = subExpRes.body.data.id;
    await request(app)
      .post(`/api/v1/subscriptions/${subExpId}/payments`)
      .field('paymentReference', `EXP-${subExpId.slice(0, 8)}`)
      .field('paymentMethod', 'ACH');
    const verExp = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/${subExpId}/verify`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ decision: 'APPROVE' });
    const expToken = verExp.body.data.invitationPreview.activationToken;

    const { Subscription } = getModels();
    await Subscription.update(
      { activationExpiresAt: new Date(Date.now() - 60 * 1000) },
      { where: { id: subExpId } }
    );
    const expiredActRes = await request(app).post('/api/v1/subscriptions/activate').send({
      activationToken: expToken,
      password: 'ValidPassword#2026'
    });
    expect(expiredActRes.status).toBe(400);

    // Create & verify subscription #2 -> test concurrent & reused single-use activation token
    const subOkRes = await request(app).post('/api/v1/subscriptions').send({
      organisationName: 'SingleUseOrg',
      organisationDomain: 'singleuse.io',
      industry: 'SaaS',
      companySize: '10-50',
      adminName: 'Single Admin',
      adminEmail: 'single@singleuse.io'
    });
    const subOkId = subOkRes.body.data.id;
    await request(app)
      .post(`/api/v1/subscriptions/${subOkId}/payments`)
      .field('paymentReference', `SINGLE-${subOkId.slice(0, 8)}`)
      .field('paymentMethod', 'ACH');
    const verOk = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/${subOkId}/verify`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ decision: 'APPROVE' });
    const validActToken = verOk.body.data.invitationPreview.activationToken;

    const [c1, c2] = await Promise.all([
      request(app).post('/api/v1/subscriptions/activate').send({
        activationToken: validActToken,
        password: 'ValidPassword#2026'
      }),
      request(app).post('/api/v1/subscriptions/activate').send({
        activationToken: validActToken,
        password: 'ValidPassword#2026'
      })
    ]);
    const actStatuses = [c1.status, c2.status].sort();
    expect(actStatuses).toEqual([200, 409]);

    // Sequential reuse after token cleared also fails (404)
    const reuseRes = await request(app).post('/api/v1/subscriptions/activate').send({
      activationToken: validActToken,
      password: 'ValidPassword#2026'
    });
    expect(reuseRes.status).toBe(404);

    // Rate limit enforcement check on /api/v1/auth/candidate/login
    process.env.ENABLE_TEST_RATE_LIMIT = 'true';
    try {
      const testIp = '198.51.100.77';
      let lastRes = null;
      for (let i = 0; i < 26; i++) {
        lastRes = await request(app)
          .post('/api/v1/auth/candidate/login')
          .set('X-Forwarded-For', testIp)
          .send({ email: 'secuser@example.com', password: 'WrongPassword#999' });
      }
      expect(lastRes.status).toBe(429);
      expect(lastRes.body.error.code).toBe('AUTH_RATE_LIMIT_EXCEEDED');
    } finally {
      process.env.ENABLE_TEST_RATE_LIMIT = 'false';
    }
  });
});

