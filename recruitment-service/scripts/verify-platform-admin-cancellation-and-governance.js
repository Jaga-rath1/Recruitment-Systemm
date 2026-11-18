'use strict';

/**
 * Live Neon PostgreSQL Verification Script:
 * Platform Admin Subscription Cancellation, Automatic Job Unpublishing & Global Job Governance
 *
 * - Runs against live Neon PostgreSQL without touching any existing tenant records.
 * - Cleans up only its own ephemeral verification rows on completion.
 * - Re-verifies Alpha Apex Tech remains 100% intact.
 */

const path = require('path');
const { v4: uuidv4 } = require('uuid');
require(path.resolve(__dirname, '../node_modules/dotenv')).config({
  path: path.resolve(__dirname, '../.env')
});

const { createApp } = require('../src/app');
const { getSequelize, getModels, disconnectDatabase } = require('../src/config/database');
const { seedPermissionCatalog } = require('../src/db/seed');

async function apiRequest(url, options = {}) {
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers || {})
    },
    body: options.body
      ? typeof options.body === 'string'
        ? options.body
        : JSON.stringify(options.body)
      : undefined
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

async function runLiveVerification() {
  const sequelize = getSequelize();
  await sequelize.authenticate();
  await seedPermissionCatalog();

  const app = createApp();
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;

  console.log(`[LIVE VERIFY] Server bound on ${baseUrl}`);

  const tag = Date.now();
  const cleanup = { subscriptionId: null, organisationId: null };
  const checks = {};

  try {
    // 1. Platform Admin authentication
    const loginRes = await apiRequest(`${baseUrl}/auth/platform-admin/login`, {
      method: 'POST',
      body: {
        email: process.env.PLATFORM_ADMIN_EMAIL || 'superadmin@nexnuv.com',
        password: process.env.PLATFORM_ADMIN_PASSWORD || 'SuperAdmin@2026!'
      }
    });
    if (loginRes.status !== 200 || !loginRes.data?.data?.token) {
      throw new Error(`Platform Admin login failed: ${loginRes.status}`);
    }
    const platformToken = loginRes.data.data.token;
    checks.platformAdminLogin = true;

    // 2. Verify Alpha Apex Tech before test
    const { Subscription, Job, JobPublication, JobSource, Candidate, Application, RecruitmentAuditLog } = getModels();
    const alphaBefore = await Subscription.findOne({
      where: { organisationId: 'c19fa048-1d33-479b-949a-64f46d3fee5d' }
    });
    if (!alphaBefore || alphaBefore.status !== 'TRIAL') {
      throw new Error('Alpha Apex Tech pre-check failed!');
    }
    checks.alphaApexTechPreCheck = true;

    // 3. Provision isolated verification organisation via Trial flow
    const trialRes = await apiRequest(`${baseUrl}/subscriptions/trial`, {
      method: 'POST',
      body: {
        organisationName: `GovVerify Org ${tag}`,
        organisationDomain: `govverify-${tag}.test`,
        industry: 'Technology',
        companySize: '11-50',
        adminName: 'Gov Verify Admin',
        adminEmail: `admin.${tag}@govverify.test`,
        password: 'StrongPassword!2026'
      }
    });
    if (trialRes.status !== 201) {
      throw new Error(`Trial provisioning failed: ${trialRes.status} ${JSON.stringify(trialRes.data)}`);
    }
    const orgId = trialRes.data.data.user.organisationId;
    const subId = trialRes.data.data.subscription.id;
    const orgToken = trialRes.data.data.token;
    cleanup.subscriptionId = subId;
    cleanup.organisationId = orgId;
    checks.isolatedOrgProvisioned = true;

    // 4. Create 2 published jobs + 1 draft job
    const createJob = (title, publishImmediately) =>
      apiRequest(`${baseUrl}/jobs`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${orgToken}` },
        body: {
          title,
          description: 'Live governance verification job listing with full description content.',
          department: 'Engineering',
          skills: ['Node.js', 'PostgreSQL'],
          experienceMinYears: 3,
          location: 'Remote',
          employmentType: 'FULL_TIME',
          headcount: 1,
          publishImmediately
        }
      });

    const job1 = (await createJob(`GovVerify Live Architect ${tag}`, true)).data.data;
    const job2 = (await createJob(`GovVerify Live SRE ${tag}`, true)).data.data;
    const jobDraft = (await createJob(`GovVerify Draft Role ${tag}`, false)).data.data;

    // Seed 1 candidate + application on job1 to verify permanent retention
    const candidate = await Candidate.create({
      organisationId: orgId,
      fullName: 'Retention Verify Candidate',
      email: `cand.${tag}@govverify.test`,
      mobileNumber: '+91-9000000000',
      location: 'Remote',
      totalExperienceYears: 4
    });
    const application = await Application.create({
      organisationId: orgId,
      jobId: job1.id,
      candidateId: candidate.id,
      applicationReference: `GOV-${String(tag).slice(-8)}`,
      currentStage: 'APPLIED',
      sourceChannel: 'CAREERS_PORTAL'
    });

    // 5. Verify both published jobs appear in public careers feed
    const feedBefore = await apiRequest(`${baseUrl}/jobs/public/careers?search=GovVerify`);
    const feedBeforeIds = (feedBefore.data?.data || []).map((j) => j.id);
    if (!feedBeforeIds.includes(job1.id) || !feedBeforeIds.includes(job2.id)) {
      throw new Error('Published verification jobs did not appear in public careers feed');
    }
    checks.publicFeedShowsPublishedJobs = true;

    // 6. Verify Org Details returns active published job count = 2
    const orgDetailsBefore = await apiRequest(
      `${baseUrl}/subscriptions/platform-admin/organisations/${subId}`,
      { headers: { Authorization: `Bearer ${platformToken}` } }
    );
    if (orgDetailsBefore.data?.data?.jobsSummary?.publishedJobCount !== 2) {
      throw new Error(
        `Expected publishedJobCount=2, got ${orgDetailsBefore.data?.data?.jobsSummary?.publishedJobCount}`
      );
    }
    checks.orgDetailsPublishedCountAccurate = true;

    // 7. Individual Platform Admin Unpublish on job2
    const unpubRes = await apiRequest(
      `${baseUrl}/jobs/platform-admin/jobs/${job2.id}/unpublish`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${platformToken}` },
        body: { reason: 'Live verification individual job unpublish check' }
      }
    );
    if (unpubRes.status !== 200 || unpubRes.data?.data?.status !== 'UNPUBLISHED') {
      throw new Error(`Individual unpublish failed: ${unpubRes.status}`);
    }
    const feedAfterUnpub = await apiRequest(`${baseUrl}/jobs/public/careers?search=GovVerify`);
    const feedAfterUnpubIds = (feedAfterUnpub.data?.data || []).map((j) => j.id);
    if (feedAfterUnpubIds.includes(job2.id) || !feedAfterUnpubIds.includes(job1.id)) {
      throw new Error('Public feed did not reflect individual unpublish accurately');
    }
    checks.individualUnpublishWorks = true;

    // 8. Cancel Subscription -> auto-unpublishes job1
    const cancelRes = await apiRequest(
      `${baseUrl}/subscriptions/platform-admin/organisations/${subId}/cancel`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${platformToken}` },
        body: { reason: 'Live Neon E2E subscription cancellation verification' }
      }
    );
    if (
      cancelRes.status !== 200 ||
      cancelRes.data?.data?.subscription?.status !== 'CANCELLED' ||
      cancelRes.data?.data?.unpublishedJobCount !== 1
    ) {
      throw new Error(`Subscription cancellation failed: ${JSON.stringify(cancelRes.data)}`);
    }
    checks.subscriptionCancelledAndAutoUnpublished = true;

    // 9. Verify job1 disappeared from public feed and idempotency works
    const feedAfterCancel = await apiRequest(`${baseUrl}/jobs/public/careers?search=GovVerify`);
    if ((feedAfterCancel.data?.data || []).some((j) => j.organisationId === orgId)) {
      throw new Error('Cancelled org jobs still appeared in public careers feed!');
    }
    checks.cancelledOrgJobsGoneFromPublicFeed = true;

    const repeatCancelRes = await apiRequest(
      `${baseUrl}/subscriptions/platform-admin/organisations/${subId}/cancel`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${platformToken}` },
        body: { reason: 'Idempotent second click check' }
      }
    );
    if (repeatCancelRes.status !== 200 || repeatCancelRes.data?.data?.unpublishedJobCount !== 0) {
      throw new Error('Cancellation idempotency check failed');
    }
    checks.cancellationIdempotent = true;

    // 10. Soft-discard job1 and verify application preserved
    const discardRes = await apiRequest(
      `${baseUrl}/jobs/platform-admin/jobs/${job1.id}/discard`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${platformToken}` },
        body: { reason: 'Live verification soft-discard check' }
      }
    );
    if (discardRes.status !== 200 || !discardRes.data?.data?.isDiscarded) {
      throw new Error(`Soft-discard failed: ${discardRes.status}`);
    }
    const appStillExists = await Application.findByPk(application.id);
    if (!appStillExists) {
      throw new Error('Application was unexpectedly deleted during discard!');
    }
    checks.softDiscardPreservesApplications = true;

    // 11. Verify Alpha Apex Tech untouched after all governance actions
    const alphaAfter = await Subscription.findOne({
      where: { organisationId: 'c19fa048-1d33-479b-949a-64f46d3fee5d' }
    });
    if (!alphaAfter || alphaAfter.status !== 'TRIAL' || alphaAfter.adminEmail !== 'marcus@alphaapex.tech') {
      throw new Error('Alpha Apex Tech post-check failed!');
    }
    checks.alphaApexTechIntact = true;

    console.log('\n=== LIVE NEON POSTGRESQL VERIFICATION SUMMARY ===');
    console.log(JSON.stringify(checks, null, 2));
    console.log('ALL LIVE VERIFICATION CHECKS PASSED!');
  } finally {
    // Clean up ONLY ephemeral verification records created by this script
    if (cleanup.organisationId || cleanup.subscriptionId) {
      const {
        Application,
        Candidate,
        JobPublication,
        Job,
        JobSource,
        EmployeeRoleAssignment,
        RecruitmentRolePermission,
        RecruitmentRole,
        RecruitmentAuditLog,
        SubscriptionPayment,
        Subscription
      } = getModels();

      if (cleanup.organisationId) {
        await Application.destroy({ where: { organisationId: cleanup.organisationId } });
        await Candidate.destroy({ where: { organisationId: cleanup.organisationId } });
        await JobPublication.destroy({ where: { organisationId: cleanup.organisationId } });
        await Job.destroy({ where: { organisationId: cleanup.organisationId } });
        await JobSource.destroy({ where: { organisationId: cleanup.organisationId } });
        await EmployeeRoleAssignment.destroy({ where: { organisationId: cleanup.organisationId } });
        const roles = await RecruitmentRole.findAll({
          where: { organisationId: cleanup.organisationId },
          attributes: ['id'],
          raw: true
        });
        if (roles.length > 0) {
          await RecruitmentRolePermission.destroy({
            where: { roleId: roles.map((r) => r.id) }
          });
          await RecruitmentRole.destroy({ where: { organisationId: cleanup.organisationId } });
        }
        await RecruitmentAuditLog.destroy({ where: { organisationId: cleanup.organisationId } });
      }
      if (cleanup.subscriptionId) {
        await SubscriptionPayment.destroy({ where: { subscriptionId: cleanup.subscriptionId } });
        await Subscription.destroy({ where: { id: cleanup.subscriptionId } });
      }
      console.log(`[CLEANUP] Removed ephemeral verification org ${cleanup.organisationId} cleanly.`);
    }

    server.close();
    await disconnectDatabase();
  }
}

runLiveVerification().catch((err) => {
  console.error('[LIVE VERIFY FAILED]', err);
  process.exit(1);
});
