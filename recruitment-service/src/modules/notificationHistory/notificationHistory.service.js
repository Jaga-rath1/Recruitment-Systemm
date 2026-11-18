const { withTransaction } = require('../../config/database');
const { BadRequestError, NotFoundError } = require('../../utils/AppError');
const { parsePagination, buildPaginationMeta } = require('../../utils/pagination');
const notificationHistoryRepo = require('./notificationHistory.repository');
const auditService = require('../audit/audit.service');

/**
 * Redacts raw tokens or sensitive URLs from notification text and metadata
 */
function sanitizeNotificationContent(notif) {
  if (!notif) return null;
  const raw = typeof notif.toJSON === 'function' ? notif.toJSON() : notif;

  // Redact token parameters from activation links in message
  let sanitizedMessage = raw.message;
  if (typeof sanitizedMessage === 'string') {
    sanitizedMessage = sanitizedMessage.replace(/token=[a-zA-Z0-9_-]+/g, 'token=[REDACTED]');
  }

  // Redact sensitive keys from metadata
  let sanitizedMetadata = { ...(raw.metadata || {}) };
  if (sanitizedMetadata.activationToken) {
    sanitizedMetadata.activationToken = '[REDACTED]';
  }
  if (sanitizedMetadata.activationLink && typeof sanitizedMetadata.activationLink === 'string') {
    sanitizedMetadata.activationLink = sanitizedMetadata.activationLink.replace(/token=[a-zA-Z0-9_-]+/g, 'token=[REDACTED]');
  }
  if (sanitizedMetadata.password) {
    sanitizedMetadata.password = '[REDACTED]';
  }

  return {
    ...raw,
    message: sanitizedMessage,
    metadata: sanitizedMetadata
  };
}

async function listNotificationHistory(query = {}, context = {}) {
  const { page, limit, skip } = parsePagination(query);

  const { items, total } = await notificationHistoryRepo.listNotificationHistory({
    search: query.search,
    eventType: query.eventType,
    deliveryStatus: query.deliveryStatus,
    recipientType: query.recipientType,
    startDate: query.startDate,
    endDate: query.endDate,
    includeDeleted: query.includeDeleted === 'true',
    skip,
    take: limit
  });

  const sanitized = items.map(sanitizeNotificationContent);
  return buildPaginationMeta({ items: sanitized, limit, total, page });
}

async function getNotificationDetails(id, context = {}) {
  const record = await notificationHistoryRepo.findNotificationById(id);
  if (!record) {
    throw new NotFoundError('Notification record not found');
  }
  return sanitizeNotificationContent(record);
}

async function clearNotification(id, input = {}, context = {}) {
  const { reason } = input;
  if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
    throw new BadRequestError(
      'A mandatory reason (minimum 5 characters) is required to clear notification history.',
      null,
      'MANDATORY_CLEAR_REASON_REQUIRED'
    );
  }

  const existing = await notificationHistoryRepo.findNotificationById(id);
  if (!existing || existing.isDeleted) {
    throw new NotFoundError('Notification record not found or already cleared');
  }

  const adminActorId = context.actorUserId || null;
  const cleanReason = reason.trim();
  const now = new Date();

  await withTransaction(async (tx) => {
    await notificationHistoryRepo.softDeleteNotification(
      id,
      {
        deletedBy: adminActorId,
        deleteReason: cleanReason
      },
      tx
    );

    await auditService.recordAudit(
      {
        actorUserId: adminActorId,
        actorRole: 'PLATFORM_ADMIN',
        entityType: 'NOTIFICATION_HISTORY',
        entityId: id,
        action: 'NOTIFICATION_HISTORY_DELETED',
        requestId: context.requestId,
        beforeState: { isDeleted: false, deliveryStatus: existing.deliveryStatus },
        afterState: { isDeleted: true, deleteReason: cleanReason, deletedAt: now.toISOString() }
      },
      tx
    );
  });

  const updated = await notificationHistoryRepo.findNotificationById(id);
  return sanitizeNotificationContent(updated);
}

async function bulkClearNotifications(input = {}, context = {}) {
  const { reason, ids, beforeDate, eventType } = input;
  if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
    throw new BadRequestError(
      'A mandatory reason (minimum 5 characters) is required to bulk clear notification history.',
      null,
      'MANDATORY_CLEAR_REASON_REQUIRED'
    );
  }

  if ((!ids || !Array.isArray(ids) || ids.length === 0) && !beforeDate && !eventType) {
    throw new BadRequestError(
      'Either an array of notification ids, a beforeDate threshold, or an eventType is required for bulk clear.',
      null,
      'BULK_CLEAR_CRITERIA_REQUIRED'
    );
  }

  const adminActorId = context.actorUserId || null;
  const cleanReason = reason.trim();
  const now = new Date();

  let affectedCount = 0;
  await withTransaction(async (tx) => {
    affectedCount = await notificationHistoryRepo.bulkSoftDeleteNotifications(
      {
        ids,
        beforeDate,
        eventType,
        deletedBy: adminActorId,
        deleteReason: cleanReason
      },
      tx
    );

    await auditService.recordAudit(
      {
        actorUserId: adminActorId,
        actorRole: 'PLATFORM_ADMIN',
        entityType: 'NOTIFICATION_HISTORY',
        entityId: ids && ids.length === 1 ? ids[0] : 'BULK',
        action: 'NOTIFICATION_HISTORY_BULK_CLEARED',
        requestId: context.requestId,
        afterState: {
          clearedCount: affectedCount,
          deleteReason: cleanReason,
          deletedAt: now.toISOString(),
          criteria: { idsCount: ids?.length, beforeDate, eventType }
        }
      },
      tx
    );
  });

  return {
    clearedCount: affectedCount,
    reason: cleanReason,
    clearedAt: now.toISOString()
  };
}

module.exports = {
  sanitizeNotificationContent,
  listNotificationHistory,
  getNotificationDetails,
  clearNotification,
  bulkClearNotifications
};
