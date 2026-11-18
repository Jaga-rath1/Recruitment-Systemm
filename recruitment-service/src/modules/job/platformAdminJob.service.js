'use strict';

const { getModels, withTransaction } = require('../../config/database');
const { BadRequestError, NotFoundError, ConflictError } = require('../../utils/AppError');
const { parsePagination, buildPaginationMeta } = require('../../utils/pagination');
const auditService = require('../audit/audit.service');
const repo = require('./platformAdminJob.repository');

/**
 * Platform Admin Global Job Governance Service
 * Handles cross-organisation job discovery, individual unpublishing, and soft-discarding.
 */

async function listJobs(query = {}, _context = {}) {
  const { page, limit, skip } = parsePagination(query);

  const { items, total } = await repo.listPlatformAdminJobs({
    organisationId: query.organisationId,
    status: query.status,
    subscriptionStatus: query.subscriptionStatus,
    discardFilter: query.discardFilter || 'ACTIVE_ONLY',
    search: query.search,
    skip,
    take: limit + 1
  });

  return buildPaginationMeta({ items, limit, total, page });
}

async function getJobDetails(jobId, _context = {}) {
  const job = await repo.findPlatformAdminJobById(jobId);
  if (!job) {
    throw new NotFoundError('Job not found');
  }
  return job;
}

async function unpublishJob(jobId, input = {}, context = {}) {
  const reason = (input.reason || '').trim();
  if (!reason || reason.length < 5) {
    throw new BadRequestError('Mandatory unpublish reason must be at least 5 characters long');
  }

  const { Job, JobPublication } = getModels();
  const actorUserId = context.actorUserId || null;
  const now = new Date();

  let updatedJob;

  await withTransaction(async (tx) => {
    const job = await Job.findByPk(jobId, { transaction: tx, lock: tx.LOCK.UPDATE });
    if (!job) {
      throw new NotFoundError('Job not found');
    }

    if (job.status !== 'PUBLISHED') {
      throw new BadRequestError(`Job is not currently published (current status: ${job.status})`);
    }

    const previousStatus = job.status;

    await job.update(
      {
        status: 'UNPUBLISHED',
        unpublishReason: reason,
        updatedBy: actorUserId
      },
      { transaction: tx }
    );

    await JobPublication.update(
      {
        isPublic: false,
        unpublishedBy: actorUserId,
        unpublishedAt: now,
        unpublishReason: reason
      },
      {
        where: { jobId },
        transaction: tx
      }
    );

    await auditService.recordAudit(
      {
        organisationId: job.organisationId,
        actorUserId,
        actorRole: 'PLATFORM_ADMIN',
        entityType: 'JOB',
        entityId: jobId,
        action: 'JOB_UNPUBLISHED_BY_PLATFORM_ADMIN',
        requestId: context.requestId,
        ipAddress: context.ipAddress,
        beforeState: { status: previousStatus },
        afterState: { status: 'UNPUBLISHED', unpublishReason: reason }
      },
      tx
    );

    updatedJob = job;
  });

  return {
    success: true,
    message: 'Job successfully unpublished and removed from public career feeds.',
    data: await repo.findPlatformAdminJobById(jobId)
  };
}

async function discardJob(jobId, input = {}, context = {}) {
  const reason = (input.reason || '').trim();
  if (!reason || reason.length < 5) {
    throw new BadRequestError('Mandatory discard reason must be at least 5 characters long');
  }

  const { Job, JobPublication } = getModels();
  const actorUserId = context.actorUserId || null;
  const now = new Date();

  await withTransaction(async (tx) => {
    const job = await Job.findByPk(jobId, { transaction: tx, lock: tx.LOCK.UPDATE });
    if (!job) {
      throw new NotFoundError('Job not found');
    }

    if (job.isDiscarded) {
      throw new ConflictError('Job has already been discarded');
    }

    const previousStatus = job.status;
    const wasPublished = job.status === 'PUBLISHED';

    // Soft-discard job; if previously published, automatically unpublish to remove from public feeds
    await job.update(
      {
        isDiscarded: true,
        discardedAt: now,
        discardedBy: actorUserId,
        discardReason: reason,
        ...(wasPublished
          ? {
              status: 'UNPUBLISHED',
              unpublishReason: `Discarded by Platform Admin: ${reason}`,
              updatedBy: actorUserId
            }
          : {})
      },
      { transaction: tx }
    );

    if (wasPublished) {
      await JobPublication.update(
        {
          isPublic: false,
          unpublishedBy: actorUserId,
          unpublishedAt: now,
          unpublishReason: `Discarded by Platform Admin: ${reason}`
        },
        {
          where: { jobId },
          transaction: tx
        }
      );
    }

    // Retains all applications, interviews, offers, and attachments completely intact
    await auditService.recordAudit(
      {
        organisationId: job.organisationId,
        actorUserId,
        actorRole: 'PLATFORM_ADMIN',
        entityType: 'JOB',
        entityId: jobId,
        action: 'JOB_DISCARDED_BY_PLATFORM_ADMIN',
        requestId: context.requestId,
        ipAddress: context.ipAddress,
        beforeState: { status: previousStatus, isDiscarded: false },
        afterState: {
          isDiscarded: true,
          discardReason: reason,
          discardedAt: now.toISOString(),
          status: wasPublished ? 'UNPUBLISHED' : previousStatus
        }
      },
      tx
    );
  });

  return {
    success: true,
    message: 'Job successfully discarded. Applications and candidate records remain intact.',
    data: await repo.findPlatformAdminJobById(jobId)
  };
}

module.exports = {
  listJobs,
  getJobDetails,
  unpublishJob,
  discardJob
};
