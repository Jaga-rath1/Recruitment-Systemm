const { Op } = require('sequelize');
const { getModels } = require('../../config/database');

async function createNotificationEntry(data, tx) {
  const { RecruitmentNotificationHistory } = getModels();
  if (!RecruitmentNotificationHistory) return null;
  return RecruitmentNotificationHistory.create(data, { transaction: tx });
}

async function findNotificationById(id, tx) {
  const { RecruitmentNotificationHistory } = getModels();
  if (!RecruitmentNotificationHistory) return null;
  return RecruitmentNotificationHistory.findByPk(id, { transaction: tx });
}

async function findNotificationByNotificationId(notificationId, tx) {
  const { RecruitmentNotificationHistory } = getModels();
  if (!RecruitmentNotificationHistory) return null;
  return RecruitmentNotificationHistory.findOne({
    where: { notificationId },
    transaction: tx
  });
}

async function updateDeliveryStatus(notificationId, updates, tx) {
  const { RecruitmentNotificationHistory } = getModels();
  if (!RecruitmentNotificationHistory) return null;
  const [affected] = await RecruitmentNotificationHistory.update(
    {
      deliveryStatus: updates.deliveryStatus || updates.status,
      providerMessageId: updates.providerMessageId || undefined,
      deliveryError: updates.deliveryError || undefined,
      metadata: updates.metadata || undefined,
      updatedAt: new Date()
    },
    {
      where: { notificationId },
      transaction: tx
    }
  );
  return affected;
}

async function listNotificationHistory(params = {}) {
  const { RecruitmentNotificationHistory } = getModels();
  if (!RecruitmentNotificationHistory) return { items: [], total: 0 };

  const {
    search,
    eventType,
    deliveryStatus,
    recipientType,
    startDate,
    endDate,
    includeDeleted = false,
    skip = 0,
    take = 20
  } = params;

  const where = {};

  if (!includeDeleted) {
    where.isDeleted = false;
  }

  if (eventType) {
    where.eventType = eventType;
  }

  if (deliveryStatus) {
    where.deliveryStatus = deliveryStatus;
  }

  if (recipientType) {
    where.recipientType = recipientType;
  }

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) {
      where.createdAt[Op.gte] = new Date(startDate);
    }
    if (endDate) {
      where.createdAt[Op.lte] = new Date(endDate);
    }
  }

  if (search && search.trim()) {
    const term = `%${search.trim().toLowerCase()}%`;
    where[Op.or] = [
      { recipientEmail: { [Op.iLike]: term } },
      { recipientName: { [Op.iLike]: term } },
      { organisationName: { [Op.iLike]: term } },
      { title: { [Op.iLike]: term } },
      { notificationId: { [Op.iLike]: term } },
      { providerMessageId: { [Op.iLike]: term } }
    ];
  }

  const { rows, count } = await RecruitmentNotificationHistory.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    offset: skip,
    limit: take
  });

  return {
    items: rows.map((r) => r.toJSON()),
    total: count
  };
}

async function softDeleteNotification(id, { deletedBy, deleteReason }, tx) {
  const { RecruitmentNotificationHistory } = getModels();
  if (!RecruitmentNotificationHistory) return null;
  const [affected] = await RecruitmentNotificationHistory.update(
    {
      isDeleted: true,
      deletedBy,
      deletedAt: new Date(),
      deleteReason
    },
    {
      where: { id, isDeleted: false },
      transaction: tx
    }
  );
  return affected;
}

async function bulkSoftDeleteNotifications({ ids, beforeDate, eventType, deletedBy, deleteReason }, tx) {
  const { RecruitmentNotificationHistory } = getModels();
  if (!RecruitmentNotificationHistory) return 0;

  const where = { isDeleted: false };

  if (ids && Array.isArray(ids) && ids.length > 0) {
    where.id = { [Op.in]: ids };
  } else {
    if (beforeDate) {
      where.createdAt = { [Op.lte]: new Date(beforeDate) };
    }
    if (eventType) {
      where.eventType = eventType;
    }
  }

  const [affected] = await RecruitmentNotificationHistory.update(
    {
      isDeleted: true,
      deletedBy,
      deletedAt: new Date(),
      deleteReason
    },
    {
      where,
      transaction: tx
    }
  );

  return affected;
}

module.exports = {
  createNotificationEntry,
  findNotificationById,
  findNotificationByNotificationId,
  updateDeliveryStatus,
  listNotificationHistory,
  softDeleteNotification,
  bulkSoftDeleteNotifications
};
