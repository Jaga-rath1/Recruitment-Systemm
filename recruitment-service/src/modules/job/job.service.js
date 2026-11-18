const env = require('../../config/env');
const { withTransaction, getModels } = require('../../config/database');
const { BadRequestError, NotFoundError, ConflictError } = require('../../utils/AppError');
const { parsePagination, buildPaginationMeta } = require('../../utils/pagination');
const jobRepo = require('./job.repository');
const auditService = require('../audit/audit.service');
const hrmsAdapter = require('../../integrations/hrms/hrms.adapter');
const organisationAdapter = require('../../integrations/organisation/organisation.adapter');

async function assertActiveSubscriptionForPublishing(organisationId, transaction = null) {
  const { Subscription } = getModels();
  const latestSub = await Subscription.findOne({
    where: { organisationId },
    order: [['createdAt', 'DESC']],
    ...(transaction ? { transaction } : {})
  });

  if (!latestSub) {
    // In live microservice mode, external Platform Service entitlements are enforced by requireTenant
    if (env.integrationMode === 'live') {
      return;
    }
    throw new ConflictError(
      'Organisation does not have an active subscription to publish jobs. Current subscription status is NONE',
      'SUBSCRIPTION_NOT_ACTIVE'
    );
  }

  const isSubActive =
    (latestSub.status === 'ACTIVE' || latestSub.status === 'TRIAL') &&
    (!latestSub.expiresAt || new Date(latestSub.expiresAt) > new Date());

  if (!isSubActive) {
    throw new ConflictError(
      `Organisation does not have an active subscription to publish jobs. Current subscription status is ${latestSub.status}`,
      'SUBSCRIPTION_NOT_ACTIVE'
    );
  }
}

function parseExperienceNumbers(expLabel = '') {
  const match = String(expLabel).match(/(\d+)\s*(?:-|to)?\s*(\d+)?/i);
  if (!match) return { min: 0, max: null };
  return {
    min: Number.parseInt(match[1], 10) || 0,
    max: match[2] ? Number.parseInt(match[2], 10) : null
  };
}

function parseSalaryNumbers(salaryLabel = '') {
  const matches = String(salaryLabel).replace(/,/g, '').match(/\d+/g);
  if (!matches || matches.length === 0) return { min: null, max: null };
  return {
    min: Number.parseInt(matches[0], 10) || null,
    max: matches[1] ? Number.parseInt(matches[1], 10) : null
  };
}

function buildJobSlug(title, jobId) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return `${base}-${jobId.slice(0, 8)}`;
}

async function syncHrmsJobs(organisationId, context = {}) {
  const hrmsJobs = await hrmsAdapter.fetchJobs(organisationId);
  const synced = [];

  for (const hrmsJob of hrmsJobs) {
    const exp = parseExperienceNumbers(hrmsJob.experience);
    const sal = parseSalaryNumbers(hrmsJob.salary);

    const record = await withTransaction(async (tx) => {
      const source = await jobRepo.upsertJobSource(
        organisationId,
        {
          sourceType: 'HRMS',
          externalHrmsJobId: hrmsJob.hrmsJobId,
          rawPayload: hrmsJob
        },
        tx
      );

      const existing = await jobRepo.findJobByHrmsId(organisationId, hrmsJob.hrmsJobId, tx);
      if (existing) {
        return jobRepo.updateJob(
          organisationId,
          existing.id,
          {
            title: hrmsJob.title,
            description: hrmsJob.description,
            department: hrmsJob.department,
            skills: hrmsJob.skills || [],
            experienceMinYears: exp.min,
            experienceMaxYears: exp.max,
            experienceLabel: hrmsJob.experience || `${exp.min}+ years`,
            salaryMin: sal.min,
            salaryMax: sal.max,
            salaryDisplay: hrmsJob.salary || 'Competitive',
            location: hrmsJob.location,
            employmentType: hrmsJob.employmentType || 'FULL_TIME',
            headcount: Number(hrmsJob.totalHeadcount || 1),
            hrmsJobStatus: hrmsJob.jobStatus || 'APPROVED',
            updatedBy: context.actorUserId || null
          },
          tx
        );
      }

      return jobRepo.createJob(
        {
          organisationId,
          jobSourceId: source.id,
          sourceType: 'HRMS',
          hrmsJobId: hrmsJob.hrmsJobId,
          title: hrmsJob.title,
          description: hrmsJob.description,
          department: hrmsJob.department,
          skills: hrmsJob.skills || [],
          experienceMinYears: exp.min,
          experienceMaxYears: exp.max,
          experienceLabel: hrmsJob.experience || `${exp.min}+ years`,
          salaryMin: sal.min,
          salaryMax: sal.max,
          salaryCurrency: 'USD',
          salaryDisplay: hrmsJob.salary || 'Competitive',
          location: hrmsJob.location,
          employmentType: hrmsJob.employmentType || 'FULL_TIME',
          headcount: Number(hrmsJob.totalHeadcount || 1),
          hrmsJobStatus: hrmsJob.jobStatus || 'APPROVED',
          recruitmentConfig: {
            remotePolicy: 'Standard',
            priority: 'NORMAL',
            screeningQuestions: []
          },
          status: 'DRAFT',
          createdBy: context.actorUserId || null,
          updatedBy: context.actorUserId || null
        },
        tx
      );
    });

    synced.push(record);
  }

  await auditService.recordAudit({
    organisationId,
    actorUserId: context.actorUserId,
    actorEmployeeId: context.actorEmployeeId,
    actorRole: context.actorRole,
    entityType: 'JOB_SYNC',
    action: 'HRMS_JOBS_SYNCED',
    requestId: context.requestId,
    afterState: { count: synced.length, hrmsJobIds: synced.map((j) => j.hrmsJobId) }
  });

  return synced;
}

async function createManualJob(organisationId, input, context = {}) {
  const job = await withTransaction(async (tx) => {
    const source = await jobRepo.upsertJobSource(
      organisationId,
      {
        sourceType: 'MANUAL',
        rawPayload: null
      },
      tx
    );

    const expLabel =
      input.experienceLabel ||
      (input.experienceMaxYears ? `${input.experienceMinYears}-${input.experienceMaxYears} years` : `${input.experienceMinYears || 0}+ years`);
    const salDisplay =
      input.salaryDisplay ||
      (input.salaryMin && input.salaryMax
        ? `${input.salaryMin}-${input.salaryMax} ${input.salaryCurrency || 'USD'}`
        : 'Competitive');

    if (input.publishImmediately) {
      await assertActiveSubscriptionForPublishing(organisationId, tx);
    }

    const created = await jobRepo.createJob(
      {
        organisationId,
        jobSourceId: source.id,
        sourceType: 'MANUAL',
        hrmsJobId: null,
        title: input.title.trim(),
        description: input.description.trim(),
        department: input.department.trim(),
        skills: input.skills || [],
        experienceMinYears: input.experienceMinYears ?? 0,
        experienceMaxYears: input.experienceMaxYears ?? null,
        experienceLabel: expLabel,
        salaryMin: input.salaryMin ?? null,
        salaryMax: input.salaryMax ?? null,
        salaryCurrency: input.salaryCurrency || 'USD',
        salaryDisplay: salDisplay,
        location: input.location.trim(),
        employmentType: input.employmentType || 'FULL_TIME',
        headcount: input.headcount ?? 1,
        applicationDeadline: input.applicationDeadline ? new Date(input.applicationDeadline) : null,
        recruitmentConfig: input.recruitmentConfig || {},
        status: input.publishImmediately ? 'PUBLISHED' : 'DRAFT',
        createdBy: context.actorUserId || null,
        updatedBy: context.actorUserId || null
      },
      tx
    );

    if (input.publishImmediately) {
      await jobRepo.upsertPublication(
        organisationId,
        created.id,
        {
          create: {
            slug: buildJobSlug(created.title, created.id),
            isPublic: true,
            publishedBy: context.actorUserId || null,
            publishedAt: new Date()
          },
          update: {
            isPublic: true,
            publishedBy: context.actorUserId || null,
            publishedAt: new Date()
          }
        },
        tx
      );
    }

    await auditService.recordAudit(
      {
        organisationId,
        actorUserId: context.actorUserId,
        actorEmployeeId: context.actorEmployeeId,
        actorRole: context.actorRole,
        entityType: 'JOB',
        entityId: created.id,
        action: 'MANUAL_JOB_CREATED',
        requestId: context.requestId,
        afterState: { title: created.title, status: created.status, sourceType: 'MANUAL' }
      },
      tx
    );

    return jobRepo.findJobById(organisationId, created.id, tx);
  });

  return job;
}

async function updateJob(organisationId, jobId, input, context = {}) {
  const existing = await jobRepo.findJobById(organisationId, jobId);
  if (!existing) {
    throw new NotFoundError('Job not found in organisation');
  }

  const updateData =
    existing.sourceType === 'HRMS'
      ? {
          ...(input.applicationDeadline !== undefined
            ? { applicationDeadline: input.applicationDeadline ? new Date(input.applicationDeadline) : null }
            : {}),
          ...(input.recruitmentConfig !== undefined
            ? { recruitmentConfig: { ...(existing.recruitmentConfig || {}), ...input.recruitmentConfig } }
            : {}),
          ...(input.salaryDisplay !== undefined ? { salaryDisplay: input.salaryDisplay } : {}),
          ...(input.location !== undefined ? { location: input.location } : {}),
          updatedBy: context.actorUserId || null
        }
      : {
          ...(input.title !== undefined ? { title: input.title.trim() } : {}),
          ...(input.description !== undefined ? { description: input.description.trim() } : {}),
          ...(input.department !== undefined ? { department: input.department.trim() } : {}),
          ...(input.skills !== undefined ? { skills: input.skills } : {}),
          ...(input.experienceMinYears !== undefined ? { experienceMinYears: input.experienceMinYears } : {}),
          ...(input.experienceMaxYears !== undefined ? { experienceMaxYears: input.experienceMaxYears } : {}),
          ...(input.experienceLabel !== undefined ? { experienceLabel: input.experienceLabel } : {}),
          ...(input.salaryMin !== undefined ? { salaryMin: input.salaryMin } : {}),
          ...(input.salaryMax !== undefined ? { salaryMax: input.salaryMax } : {}),
          ...(input.salaryCurrency !== undefined ? { salaryCurrency: input.salaryCurrency } : {}),
          ...(input.salaryDisplay !== undefined ? { salaryDisplay: input.salaryDisplay } : {}),
          ...(input.location !== undefined ? { location: input.location.trim() } : {}),
          ...(input.employmentType !== undefined ? { employmentType: input.employmentType } : {}),
          ...(input.headcount !== undefined ? { headcount: input.headcount } : {}),
          ...(input.applicationDeadline !== undefined
            ? { applicationDeadline: input.applicationDeadline ? new Date(input.applicationDeadline) : null }
            : {}),
          ...(input.recruitmentConfig !== undefined
            ? { recruitmentConfig: { ...(existing.recruitmentConfig || {}), ...input.recruitmentConfig } }
            : {}),
          updatedBy: context.actorUserId || null
        };

  const updated = await jobRepo.updateJob(organisationId, jobId, updateData);
  await auditService.recordAudit({
    organisationId,
    actorUserId: context.actorUserId,
    actorEmployeeId: context.actorEmployeeId,
    actorRole: context.actorRole,
    entityType: 'JOB',
    entityId: jobId,
    action: 'JOB_UPDATED',
    requestId: context.requestId,
    beforeState: { title: existing.title, status: existing.status },
    afterState: { title: updated.title, recruitmentConfig: updated.recruitmentConfig }
  });

  return updated;
}

async function changeJobPublicationStatus(organisationId, jobId, targetStatus, context = {}) {
  const existing = await jobRepo.findJobById(organisationId, jobId);
  if (!existing) {
    throw new NotFoundError('Job not found in organisation');
  }

  if (existing.status === 'CLOSED' && targetStatus !== 'PUBLISHED') {
    throw new BadRequestError('Closed job can only be reopened by explicitly publishing it');
  }

  if (targetStatus === 'PUBLISHED') {
    if (existing.isDiscarded) {
      throw new ConflictError('Cannot publish a discarded job. Discarded jobs must remain archived.', 'JOB_DISCARDED');
    }
    await assertActiveSubscriptionForPublishing(organisationId);
  }

  const now = new Date();
  const slug = existing.publication?.slug || buildJobSlug(existing.title, existing.id);

  await withTransaction(async (tx) => {
    await jobRepo.updateJob(
      organisationId,
      jobId,
      {
        status: targetStatus,
        updatedBy: context.actorUserId || null
      },
      tx
    );

    if (targetStatus === 'PUBLISHED') {
      await jobRepo.upsertPublication(
        organisationId,
        jobId,
        {
          create: { slug, isPublic: true, publishedBy: context.actorUserId || null, publishedAt: now },
          update: { isPublic: true, publishedBy: context.actorUserId || null, publishedAt: now }
        },
        tx
      );
    } else if (targetStatus === 'UNPUBLISHED') {
      await jobRepo.upsertPublication(
        organisationId,
        jobId,
        {
          create: { slug, isPublic: false, unpublishedBy: context.actorUserId || null, unpublishedAt: now },
          update: { isPublic: false, unpublishedBy: context.actorUserId || null, unpublishedAt: now }
        },
        tx
      );
    } else if (targetStatus === 'CLOSED') {
      await jobRepo.upsertPublication(
        organisationId,
        jobId,
        {
          create: { slug, isPublic: false, closedBy: context.actorUserId || null, closedAt: now },
          update: { isPublic: false, closedBy: context.actorUserId || null, closedAt: now }
        },
        tx
      );
    }

    await auditService.recordAudit(
      {
        organisationId,
        actorUserId: context.actorUserId,
        actorEmployeeId: context.actorEmployeeId,
        actorRole: context.actorRole,
        entityType: 'JOB',
        entityId: jobId,
        action: `JOB_${targetStatus}`,
        requestId: context.requestId,
        beforeState: { status: existing.status },
        afterState: { status: targetStatus }
      },
      tx
    );
  });

  return jobRepo.findJobById(organisationId, jobId);
}

async function listOrganisationJobs(organisationId, query = {}) {
  const { page, limit, skip } = parsePagination(query);
  const { items, total } = await jobRepo.listJobs(organisationId, {
    status: query.status,
    sourceType: query.sourceType,
    department: query.department,
    search: query.search,
    skip,
    take: limit + 1
  });
  return buildPaginationMeta({ items, limit, total, page });
}

async function getOrganisationJob(organisationId, jobId) {
  const job = await jobRepo.findJobById(organisationId, jobId);
  if (!job) {
    throw new NotFoundError('Job not found in organisation');
  }
  return job;
}

async function listPublicCareersJobs(query = {}) {
  const { page, limit, skip } = parsePagination(query);
  const { items, total } = await jobRepo.listPublicPublishedJobs({
    organisationId: query.organisationId,
    department: query.department,
    location: query.location,
    employmentType: query.employmentType,
    search: query.search,
    skip,
    take: limit + 1
  });

  const uniqueOrgIds = Array.from(new Set(items.map((j) => j.organisationId).filter(Boolean)));
  const orgCache = new Map();
  await Promise.all(
    uniqueOrgIds.map(async (orgId) => {
      const org = await organisationAdapter.getOrganisation(orgId);
      orgCache.set(orgId, org?.name || 'NEXNUV Partner Organisation');
    })
  );

  const enriched = items.map((job) => ({
    id: job.id,
    organisationId: job.organisationId,
    organisationName: orgCache.get(job.organisationId) || 'NEXNUV Partner Organisation',
    slug: job.publication?.slug || job.id,
    title: job.title,
    description: job.description,
    department: job.department,
    skills: job.skills,
    experienceLabel: job.experienceLabel,
    salaryDisplay: job.salaryDisplay,
    location: job.location,
    employmentType: job.employmentType,
    headcount: job.headcount,
    applicationDeadline: job.applicationDeadline,
    publishedAt: job.publication?.publishedAt || job.createdAt
  }));

  return buildPaginationMeta({ items: enriched, limit, total, page });
}

async function getPublicCareersJobDetail(identifier) {
  const job = await jobRepo.findPublicJobByIdentifier(identifier);
  if (!job) {
    throw new NotFoundError('Published job not found');
  }

  if (job.publication?.id) {
    await jobRepo.incrementPublicationViews(job.publication.id);
  }
  const org = await organisationAdapter.getOrganisation(job.organisationId);

  return {
    id: job.id,
    organisationId: job.organisationId,
    organisationName: org?.name || 'NEXNUV Partner Organisation',
    slug: job.publication?.slug || job.id,
    title: job.title,
    description: job.description,
    department: job.department,
    skills: job.skills,
    experienceLabel: job.experienceLabel,
    salaryDisplay: job.salaryDisplay,
    location: job.location,
    employmentType: job.employmentType,
    headcount: job.headcount,
    applicationDeadline: job.applicationDeadline,
    recruitmentConfig: {
      remotePolicy: job.recruitmentConfig?.remotePolicy || null,
      screeningQuestions: job.recruitmentConfig?.screeningQuestions || []
    },
    publishedAt: job.publication?.publishedAt || job.createdAt
  };
}

module.exports = {
  syncHrmsJobs,
  createManualJob,
  updateJob,
  changeJobPublicationStatus,
  listOrganisationJobs,
  getOrganisationJob,
  listPublicCareersJobs,
  getPublicCareersJobDetail
};
