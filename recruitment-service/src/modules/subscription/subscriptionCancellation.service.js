'use strict';

const logger = require('../../config/logger');
const { getModels, withTransaction } = require('../../config/database');
const { BadRequestError, NotFoundError } = require('../../utils/AppError');
const auditService = require('../audit/audit.service');
const organisationAdapter = require('../../integrations/organisation/organisation.adapter');
const platformAdapter = require('../../integrations/platform/platform.adapter');
const { findSubscriptionByOrgOrSubId } = require('./platformAdminOrganisation.helpers');

/**
 * Platform Admin: Cancel Organisation Subscription & Auto-Unpublish All Active Jobs
 * Guarantees transaction atomicity, idempotency, audit trail, and candidate feed safety.
 *
 * @param {string} id Subscription ID or Organisation ID
 * @param {{ reason: string }} input Mandatory cancellation reason
 * @param {object} context Request and actor context
 */
async function cancelOrganisationSubscription(id, input = {}, context = {}) {
  const reason = (input.reason || '').trim();
  if (!reason || reason.length < 5) {
    throw new BadRequestError('Mandatory cancellation reason must be at least 5 characters long');
  }

  const { Subscription, Job, JobPublication } = getModels();

  const existingSub = await findSubscriptionByOrgOrSubId(id);
  if (!existingSub) {
    throw new NotFoundError('Organisation subscription record not found');
  }

  // Idempotency check before acquiring locks
  if (existingSub.status === 'CANCELLED') {
    return {
      success: true,
      message: 'Subscription is already cancelled',
      alreadyCancelled: true,
      data: {
        subscription: existingSub,
        unpublishedJobCount: 0
      }
    };
  }

  const actorUserId = context.actorUserId || null;
  const now = new Date();
  let affectedJobCount = 0;
  let updatedSubRecord = null;

  await withTransaction(async (tx) => {
    // Lock subscription record to prevent concurrent double-cancellation
    const sub = await Subscription.findByPk(existingSub.id, {
      transaction: tx,
      lock: tx.LOCK.UPDATE
    });

    if (!sub) {
      throw new NotFoundError('Organisation subscription record not found');
    }

    if (sub.status === 'CANCELLED') {
      updatedSubRecord = sub;
      return;
    }

    const previousStatus = sub.status;

    // 1. Persist subscription cancellation
    await sub.update(
      {
        status: 'CANCELLED',
        cancelledAt: now,
        cancelledBy: actorUserId,
        cancellationReason: reason
      },
      { transaction: tx }
    );
    updatedSubRecord = sub;

    // 2. Identify and automatically unpublish all currently published/active jobs
    if (sub.organisationId) {
      const publishedJobs = await Job.findAll({
        where: {
          organisationId: sub.organisationId,
          status: 'PUBLISHED'
        },
        transaction: tx,
        lock: tx.LOCK.UPDATE
      });

      affectedJobCount = publishedJobs.length;

      if (affectedJobCount > 0) {
        const jobIds = publishedJobs.map((j) => j.id);

        // Bulk update jobs to UNPUBLISHED
        await Job.update(
          {
            status: 'UNPUBLISHED',
            unpublishReason: `Subscription cancelled: ${reason}`,
            updatedBy: actorUserId
          },
          {
            where: { id: jobIds },
            transaction: tx
          }
        );

        // Bulk update job publications to isPublic: false
        await JobPublication.update(
          {
            isPublic: false,
            unpublishedBy: actorUserId,
            unpublishedAt: now,
            unpublishReason: `Subscription cancelled: ${reason}`
          },
          {
            where: { jobId: jobIds },
            transaction: tx
          }
        );

        // Audit log for bulk job unpublishing
        await auditService.recordAudit(
          {
            organisationId: sub.organisationId,
            actorUserId,
            actorRole: 'PLATFORM_ADMIN',
            entityType: 'JOB',
            entityId: sub.organisationId,
            action: 'JOBS_AUTO_UNPUBLISHED_ON_CANCELLATION',
            requestId: context.requestId,
            ipAddress: context.ipAddress,
            details: {
              unpublishedJobCount: affectedJobCount,
              jobIds,
              cancellationReason: reason
            }
          },
          tx
        );
      }

      // Update organisation status in organisation service adapter
      try {
        await organisationAdapter.updateOrganisationStatus(
          sub.organisationId,
          'inactive',
          { requestId: context.requestId }
        );
      } catch (adapterErr) {
        logger.warn(
          { err: adapterErr.message, orgId: sub.organisationId },
          'Organisation adapter status sync warning on cancellation'
        );
      }
    }

    // 3. Audit log for subscription cancellation
    await auditService.recordAudit(
      {
        organisationId: sub.organisationId || null,
        actorUserId,
        actorRole: 'PLATFORM_ADMIN',
        entityType: 'SUBSCRIPTION',
        entityId: sub.id,
        action: 'SUBSCRIPTION_CANCELLED',
        requestId: context.requestId,
        ipAddress: context.ipAddress,
        beforeState: { status: previousStatus },
        afterState: {
          status: 'CANCELLED',
          cancellationReason: reason,
          cancelledAt: now.toISOString(),
          unpublishedJobCount: affectedJobCount
        }
      },
      tx
    );
  });

  // Sync subscription cancellation to Platform Service in live mode (non-blocking for committed local transaction)
  if (updatedSubRecord?.organisationId) {
    try {
      await platformAdapter.cancelOrganisationSubscription(updatedSubRecord.organisationId, {
        requestId: context.requestId
      });
    } catch (platErr) {
      logger.warn(
        { err: platErr.message, orgId: updatedSubRecord.organisationId, requestId: context.requestId },
        'Platform Service subscription cancellation sync warning'
      );
    }
  }

  return {
    success: true,
    message: `Subscription successfully cancelled. ${affectedJobCount} active jobs unpublished.`,
    alreadyCancelled: false,
    data: {
      subscription: updatedSubRecord,
      unpublishedJobCount: affectedJobCount
    }
  };
}

module.exports = {
  cancelOrganisationSubscription
};
