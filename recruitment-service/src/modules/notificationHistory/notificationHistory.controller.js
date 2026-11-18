const notificationHistoryService = require('./notificationHistory.service');
const { sendSuccess } = require('../../utils/response');

async function listNotifications(req, res, next) {
  try {
    const result = await notificationHistoryService.listNotificationHistory(req.query, {
      actorUserId: req.user?.id || req.user?.userId,
      requestId: req.requestId
    });
    return sendSuccess(res, result.items, 200, {
      page: result.page,
      limit: result.limit,
      total: result.total,
      hasMore: result.hasMore
    });
  } catch (err) {
    next(err);
  }
}

async function getNotification(req, res, next) {
  try {
    const result = await notificationHistoryService.getNotificationDetails(req.params.id, {
      actorUserId: req.user?.id || req.user?.userId,
      requestId: req.requestId
    });
    return sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

async function clearNotification(req, res, next) {
  try {
    const result = await notificationHistoryService.clearNotification(req.params.id, req.body, {
      actorUserId: req.user?.id || req.user?.userId,
      requestId: req.requestId
    });
    return sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

async function bulkClearNotifications(req, res, next) {
  try {
    const result = await notificationHistoryService.bulkClearNotifications(req.body, {
      actorUserId: req.user?.id || req.user?.userId,
      requestId: req.requestId
    });
    return sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listNotifications,
  getNotification,
  clearNotification,
  bulkClearNotifications
};
