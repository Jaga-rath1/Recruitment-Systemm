import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const { startTestDatabase, resetTestState, stopTestDatabase } = require('../helpers/testDb');
const { registerAndVerifyCandidate } = require('../helpers/candidateAuthHelper');
const { createApp } = require('../../src/app');
const { getModels } = require('../../src/config/database');
const authAdapter = require('../../src/integrations/auth/auth.adapter');
const jobService = require('../../src/modules/job/job.service');
const subscriptionCancellationService = require('../../src/modules/subscription/subscriptionCancellation.service');

let app;
let platformAdminToken;
let platformAdminActorId;

async function provisionOrgWithSubscription({
  organisationName,
  domain,
  adminEmail,
  planCode = 'RECRUITMENT_ADVANCED'
}) {
  const { Subscription } = getModels();
  const subRes = await request(app).post('/api/v1/subscriptions').send({
    organisationName,
    organisationDomain: domain,
    industry: 'Technology',
    companySize: '51-200',
    adminName: `${organisationName} Admin`,
    adminEmail,
    planCode,
    billingCycle: 'MONTHLY'
  });
  expect(subRes.status).toBe(201);
  const subId = subRes.body.data.id;

  const payRes = await request(app)
    .post(`/api/v1/subscriptions/${subId}/payments`)
    .field('paymentReference', `UTR-${subId.slice(0, 8).toUpperCase()}`)
    .field('paymentMethod', 'WIRE_TRANSFER');
  expect(payRes.status).toBe(201);

  const verifyRes = await request(app)
    .post(`/api/v1/subscriptions/platform-admin/${subId}/verify`)
    .set('Authorization', `Bearer ${platformAdminToken}`)
    .send({ decision: 'APPROVE' });
  expect(verifyRes.status).toBe(200);

  const actRes = await request(app).post('/api/v1/subscriptions/activate').send({
    activationToken: verifyRes.body.data.invitationPreview.activationToken,
    password: 'Password!2026'
  });
  expect(actRes.status).toBe(200);

  const orgId = actRes.body.data.user.organisationId;
  const orgAdminToken = actRes.body.data.token;
  const subscription = await Subscription.findByPk(subId);

  return { orgId, subscription, orgAdminToken };
}

async function createAndMaybePublishJob(orgAdminToken, overrides = {}) {
  const res = await request(app)
    .post('/api/v1/jobs')
    .set('Authorization', `Bearer ${orgAdminToken}`)
    .send({
      title: overrides.title || 'Senior Backend Platform Engineer',
      description:
        overrides.description ||
        'We are building scalable multi-tenant SaaS infrastructure with Node.js and PostgreSQL.',
      department: overrides.department || 'Engineering',
      skills: ['Node.js', 'PostgreSQL', 'Distributed Systems'],
      experienceMinYears: 5,
      experienceMaxYears: 9,
      location: overrides.location || 'Bengaluru, India',
      employmentType: 'FULL_TIME',
      headcount: 2,
      publishImmediately: overrides.publishImmediately !== undefined ? overrides.publishImmediately : true
    });
  return res;
}

async function seedCandidateApplicationWithInterview(orgId, jobId) {
  const { Candidate, Application, Interview } = getModels();
  const shortId = uuidv4().slice(0, 8);
  const candidate = await Candidate.create({
    organisationId: orgId,
    fullName: 'Priya Sharma',
    email: `priya.${shortId}@candidate.test`,
    mobileNumber: '+91-9876543210',
    location: 'Bengaluru, India',
    totalExperienceYears: 6
  });

  const application = await Application.create({
    organisationId: orgId,
    jobId,
    candidateId: candidate.id,
    applicationReference: `APP-${shortId.toUpperCase()}`,
    currentStage: 'TECHNICAL_INTERVIEW',
    sourceChannel: 'CAREERS_PORTAL'
  });

  const interview = await Interview.create({
    organisationId: orgId,
    applicationId: application.id,
    roundType: 'TECHNICAL',
    roundNumber: 1,
    scheduledAt: new Date(Date.now() + 86400000),
    durationMinutes: 60,
    meetingMode: 'VIDEO',
    meetingLinkOrLocation: 'https://meet.nexnuv.test/room-1',
    status: 'SCHEDULED',
    scheduledBy: platformAdminActorId
  });

  return { candidate, application, interview };
}

describe('Platform Admin Subscription Cancellation, Auto-Unpublishing & Global Job Governance Suite', () => {
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
      email: 'platformadmin@nexnuv.com',
      name: 'Platform Super Admin',
      userType: 'PLATFORM_ADMIN',
      roles: ['PLATFORM_ADMIN']
    });
  });

  it('Criteria 1, 2, 3, 4, 5 & 19: Cancels subscription atomically, auto-unpublishes org jobs, removes from public feed, preserves applications & interviews, records audit logs, and is idempotent', async () => {
    const orgA = await provisionOrgWithSubscription({
      organisationName: 'Orion Cloud Labs',
      domain: 'orioncloud.test',
      adminEmail: 'admin@orioncloud.test'
    });
    const orgB = await provisionOrgWithSubscription({
      organisationName: 'Vega Analytics Inc',
      domain: 'vegaanalytics.test',
      adminEmail: 'admin@vegaanalytics.test'
    });

    // Org A has 2 published jobs and 1 draft job; Org B has 1 published job
    const jobA1Res = await createAndMaybePublishJob(orgA.orgAdminToken, {
      title: 'Orion Staff Distributed Engineer',
      publishImmediately: true
    });
    expect(jobA1Res.status).toBe(201);
    const jobA1 = jobA1Res.body.data;

    const jobA2Res = await createAndMaybePublishJob(orgA.orgAdminToken, {
      title: 'Orion Cloud Security Lead',
      publishImmediately: true
    });
    expect(jobA2Res.status).toBe(201);
    const jobA2 = jobA2Res.body.data;

    const jobADraftRes = await createAndMaybePublishJob(orgA.orgAdminToken, {
      title: 'Orion Internal Draft Role',
      publishImmediately: false
    });
    expect(jobADraftRes.status).toBe(201);
    const jobADraft = jobADraftRes.body.data;

    const jobB1Res = await createAndMaybePublishJob(orgB.orgAdminToken, {
      title: 'Vega Principal Data Scientist',
      publishImmediately: true
    });
    expect(jobB1Res.status).toBe(201);
    const jobB1 = jobB1Res.body.data;

    // Seed candidate application & interview on jobA1 to verify strict retention
    const { candidate, application, interview } = await seedCandidateApplicationWithInterview(
      orgA.orgId,
      jobA1.id
    );

    // Verify all 3 published jobs appear in public careers feed before cancellation
    const feedBefore = await request(app).get('/api/v1/jobs/public/careers');
    expect(feedBefore.status).toBe(200);
    const feedBeforeIds = feedBefore.body.data.map((j) => j.id);
    expect(feedBeforeIds).toContain(jobA1.id);
    expect(feedBeforeIds).toContain(jobA2.id);
    expect(feedBeforeIds).toContain(jobB1.id);
    expect(feedBeforeIds).not.toContain(jobADraft.id);

    // Verify Org Details endpoint exposes active published job count before cancellation
    const detailsBefore = await request(app)
      .get(`/api/v1/subscriptions/platform-admin/organisations/${orgA.subscription.id}`)
      .set('Authorization', `Bearer ${platformAdminToken}`);
    expect(detailsBefore.status).toBe(200);
    expect(detailsBefore.body.data.jobsSummary.publishedJobCount).toBe(2);
    expect(detailsBefore.body.data.jobsSummary.totalJobCount).toBe(3);

    // Validation: short or missing reason is rejected (422)
    const missingReasonRes = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/organisations/${orgA.subscription.id}/cancel`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ reason: 'no' });
    expect(missingReasonRes.status).toBe(422);

    // Execute cancellation
    const cancelReason = 'Customer requested contract termination due to budget freeze';
    const cancelRes = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/organisations/${orgA.subscription.id}/cancel`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ reason: cancelReason });

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.success).toBe(true);
    expect(cancelRes.body.data.unpublishedJobCount).toBe(2);
    expect(cancelRes.body.data.subscription.status).toBe('CANCELLED');
    expect(cancelRes.body.data.subscription.cancellationReason).toBe(cancelReason);
    expect(cancelRes.body.data.subscription.cancelledBy).toBe(platformAdminActorId);
    expect(cancelRes.body.data.subscription.cancelledAt).toBeTruthy();

    // Verify idempotent repeated cancellation succeeds safely with 0 additional jobs affected
    const repeatCancelRes = await request(app)
      .post(`/api/v1/subscriptions/platform-admin/organisations/${orgA.subscription.id}/cancel`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ reason: 'Duplicate click from another browser tab' });
    expect(repeatCancelRes.status).toBe(200);
    expect(repeatCancelRes.body.data.unpublishedJobCount).toBe(0);

    // Verify Org A's published jobs are now UNPUBLISHED & non-public; draft remains DRAFT; Org B untouched
    const { Job, JobPublication, Application, Interview, Candidate, RecruitmentAuditLog } = getModels();
    const [dbJobA1, dbJobA2, dbJobADraft, dbJobB1] = await Promise.all([
      Job.findByPk(jobA1.id, { include: [{ model: JobPublication, as: 'publication' }] }),
      Job.findByPk(jobA2.id, { include: [{ model: JobPublication, as: 'publication' }] }),
      Job.findByPk(jobADraft.id),
      Job.findByPk(jobB1.id, { include: [{ model: JobPublication, as: 'publication' }] })
    ]);

    expect(dbJobA1.status).toBe('UNPUBLISHED');
    expect(dbJobA1.publication.isPublic).toBe(false);
    expect(dbJobA1.unpublishReason).toContain(cancelReason);
    expect(dbJobA2.status).toBe('UNPUBLISHED');
    expect(dbJobA2.publication.isPublic).toBe(false);
    expect(dbJobADraft.status).toBe('DRAFT');
    expect(dbJobB1.status).toBe('PUBLISHED');
    expect(dbJobB1.publication.isPublic).toBe(true);

    // Verify public careers feed immediately excludes Org A jobs, while keeping Org B
    const feedAfter = await request(app).get('/api/v1/jobs/public/careers');
    expect(feedAfter.status).toBe(200);
    const feedAfterIds = feedAfter.body.data.map((j) => j.id);
    expect(feedAfterIds).not.toContain(jobA1.id);
    expect(feedAfterIds).not.toContain(jobA2.id);
    expect(feedAfterIds).toContain(jobB1.id);

    // Direct public detail endpoint for unpublished job returns 404
    const publicDetailRes = await request(app).get(`/api/v1/jobs/public/careers/${jobA1.id}`);
    expect(publicDetailRes.status).toBe(404);

    // Verify candidate, application, and interview records remain 100% intact
    expect(await Candidate.findByPk(candidate.id)).not.toBeNull();
    expect(await Application.findByPk(application.id)).not.toBeNull();
    expect(await Interview.findByPk(interview.id)).not.toBeNull();

    // Verify audit logs recorded for both subscription cancellation and bulk job unpublishing
    const auditLogs = await RecruitmentAuditLog.findAll({
      where: { organisationId: orgA.orgId },
      raw: true
    });
    const actions = auditLogs.map((l) => l.action);
    expect(actions).toContain('SUBSCRIPTION_CANCELLED');
    expect(actions).toContain('JOBS_AUTO_UNPUBLISHED_ON_CANCELLATION');
  });

  it('Global Job Governance routes are removed from Platform Admin API', async () => {
    const listRes = await request(app)
      .get('/api/v1/jobs/platform-admin/jobs')
      .set('Authorization', `Bearer ${platformAdminToken}`);
    expect(listRes.status).toBe(404);
  });

  it('Criteria 14, 15 & 16: Strict RBAC blocks Organisation Admins, Candidates, and Unauthenticated callers from Platform Admin subscription cancellation endpoint', async () => {
    const org = await provisionOrgWithSubscription({
      organisationName: 'Shield Defense Corp',
      domain: 'shielddefense.test',
      adminEmail: 'admin@shielddefense.test'
    });

    const candidateToken = authAdapter.signAccessToken({
      sub: uuidv4(),
      email: `candidate.${uuidv4().slice(0, 8)}@public.test`,
      name: 'Public Candidate',
      userType: 'CANDIDATE',
      roles: ['CANDIDATE']
    });

    // Unauthenticated -> 401
    expect(
      (
        await request(app)
          .post(`/api/v1/subscriptions/platform-admin/organisations/${org.subscription.id}/cancel`)
          .send({ reason: 'Unauthorized attempt' })
      ).status
    ).toBe(401);

    // Org Admin -> 403
    expect(
      (
        await request(app)
          .post(`/api/v1/subscriptions/platform-admin/organisations/${org.subscription.id}/cancel`)
          .set('Authorization', `Bearer ${org.orgAdminToken}`)
          .send({ reason: 'Org admin trying cancel route' })
      ).status
    ).toBe(403);

    // Candidate -> 403 (or 401 rejected by staff auth)
    expect(
      [401, 403]
    ).toContain(
      (
        await request(app)
          .post(`/api/v1/subscriptions/platform-admin/organisations/${org.subscription.id}/cancel`)
          .set('Authorization', `Bearer ${candidateToken}`)
          .send({ reason: 'Candidate trying cancel route' })
      ).status
    );
  });

  it('Criteria 17 & 18: Cancelled organisation cannot publish jobs; reactivating subscription does NOT auto-republish jobs', async () => {
    const org = await provisionOrgWithSubscription({
      organisationName: 'Nova Mobility Systems',
      domain: 'novamobility.test',
      adminEmail: 'admin@novamobility.test'
    });

    const job1 = (
      await createAndMaybePublishJob(org.orgAdminToken, {
        title: 'Nova Autonomous Controls Engineer',
        publishImmediately: true
      })
    ).body.data;

    // Cancel subscription -> job1 auto-unpublished
    await request(app)
      .post(`/api/v1/subscriptions/platform-admin/organisations/${org.subscription.id}/cancel`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ reason: 'Account suspended pending renewal' });

    // 1. Cancelled org cannot create a job with publishImmediately: true (403 SUBSCRIPTION_INACTIVE at middleware)
    const immediatePubRes = await createAndMaybePublishJob(org.orgAdminToken, {
      title: 'Blocked Immediate Publish Job',
      publishImmediately: true
    });
    expect(immediatePubRes.status).toBe(403);
    expect(immediatePubRes.body.error.code).toBe('SUBSCRIPTION_INACTIVE');

    // 2. Cancelled org cannot publish an existing unpublished job (403 SUBSCRIPTION_INACTIVE at middleware)
    const republishBlockedRes = await request(app)
      .post(`/api/v1/jobs/${job1.id}/publish`)
      .set('Authorization', `Bearer ${org.orgAdminToken}`);
    expect(republishBlockedRes.status).toBe(403);
    expect(republishBlockedRes.body.error.code).toBe('SUBSCRIPTION_INACTIVE');

    // 2b. Service-layer defense-in-depth also throws 409 SUBSCRIPTION_NOT_ACTIVE
    await expect(
      jobService.changeJobPublicationStatus(org.orgId, job1.id, 'PUBLISHED', {
        actorUserId: platformAdminActorId
      })
    ).rejects.toMatchObject({ statusCode: 409, code: 'SUBSCRIPTION_NOT_ACTIVE' });

    // 3. Platform Admin reactivates subscription to ACTIVE
    const reactivateRes = await request(app)
      .patch(`/api/v1/subscriptions/platform-admin/${org.subscription.id}/status`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ status: 'ACTIVE' });
    expect(reactivateRes.status).toBe(200);

    // 4. Verify job1 did NOT automatically republish after subscription reactivation
    const { Job } = getModels();
    const job1AfterReactivate = await Job.findByPk(job1.id);
    expect(job1AfterReactivate.status).toBe('UNPUBLISHED');

    const feedAfterReactivate = await request(app).get('/api/v1/jobs/public/careers');
    expect(feedAfterReactivate.body.data.map((j) => j.id)).not.toContain(job1.id);

    // 5. After reactivation, org CAN manually republish job1
    const manualRepubRes = await request(app)
      .post(`/api/v1/jobs/${job1.id}/publish`)
      .set('Authorization', `Bearer ${org.orgAdminToken}`);
    expect(manualRepubRes.status).toBe(200);
    expect(manualRepubRes.body.data.status).toBe('PUBLISHED');
  });

  it('Criteria 20: Transaction rollback safety — if bulk job unpublishing fails mid-transaction, subscription remains ACTIVE and jobs remain PUBLISHED', async () => {
    const org = await provisionOrgWithSubscription({
      organisationName: 'Atomicity Verification Corp',
      domain: 'atomicity.test',
      adminEmail: 'admin@atomicity.test'
    });

    const job = (
      await createAndMaybePublishJob(org.orgAdminToken, {
        title: 'Transactional Safety Architect',
        publishImmediately: true
      })
    ).body.data;

    const { JobPublication, Subscription, Job } = getModels();
    const updateSpy = vi
      .spyOn(JobPublication, 'update')
      .mockRejectedValueOnce(new Error('Simulated DB constraint failure during bulk unpublish'));

    try {
      await expect(
        subscriptionCancellationService.cancelOrganisationSubscription(
          org.subscription.id,
          { reason: 'Testing atomic rollback protection' },
          { actorUserId: platformAdminActorId, requestId: 'rollback-test-1' }
        )
      ).rejects.toThrow('Simulated DB constraint failure during bulk unpublish');
    } finally {
      updateSpy.mockRestore();
    }

    // Verify full transaction rollback: subscription is still ACTIVE and job is still PUBLISHED
    const subAfter = await Subscription.findByPk(org.subscription.id);
    const jobAfter = await Job.findByPk(job.id, {
      include: [{ model: JobPublication, as: 'publication' }]
    });

    expect(subAfter.status).toBe('ACTIVE');
    expect(subAfter.cancelledAt).toBeNull();
    expect(jobAfter.status).toBe('PUBLISHED');
    expect(jobAfter.publication.isPublic).toBe(true);
  });
});
