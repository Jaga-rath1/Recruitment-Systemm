const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/apiResponse');
const subscriptionService = require('./subscription.service');
const notificationHistoryService = require('../notificationHistory/notificationHistory.service');
const platformAdminOrgService = require('./platformAdminOrganisation.service');
const platformDiagnosticsService = require('./platformDiagnostics.service');

const createSubscription = asyncHandler(async (req, res) => {
  const { subscription, idempotentReplay } = await subscriptionService.createSubscriptionRequest(req.body, {
    idempotencyKey: req.headers['idempotency-key'],
    requestId: req.requestId,
    ipAddress: req.ip
  });

  return sendSuccess(res, {
    statusCode: idempotentReplay ? 200 : 201,
    message: idempotentReplay ? 'Existing subscription returned (idempotent)' : 'Subscription request created',
    data: subscription
  });
});

const getSubscription = asyncHandler(async (req, res) => {
  const data = await subscriptionService.getSubscriptionStatus(req.params.id);
  return sendSuccess(res, {
    message: 'Subscription details fetched',
    data
  });
});

const submitPayment = asyncHandler(async (req, res) => {
  const result = await subscriptionService.submitPaymentProof(req.params.id, req.body, req.file, {
    idempotencyKey: req.headers['idempotency-key'],
    requestId: req.requestId,
    ipAddress: req.ip
  });

  return sendSuccess(res, {
    statusCode: result.idempotentReplay ? 200 : 201,
    message: 'Payment proof submitted for Platform Admin verification',
    data: result
  });
});

const listPlatformQueue = asyncHandler(async (req, res) => {
  const result = await subscriptionService.listPlatformAdminQueue(req.query);
  return sendSuccess(res, {
    message: 'Platform Admin subscription queue fetched',
    data: result.items,
    meta: result.meta
  });
});

const verifyPayment = asyncHandler(async (req, res) => {
  const result = await subscriptionService.verifySubscriptionPayment(req.params.id, req.body, {
    actorUserId: req.auth.userId,
    requestId: req.requestId
  });
  return sendSuccess(res, {
    message: `Subscription ${req.body.decision === 'APPROVE' ? 'approved and organisation provisioned' : 'rejected'}`,
    data: result
  });
});

const activateAccount = asyncHandler(async (req, res) => {
  const result = await subscriptionService.activateOrganisationAdmin(req.body, {
    requestId: req.requestId
  });
  return sendSuccess(res, {
    message: 'Organisation Admin account activated',
    data: result
  });
});

const activateFreeTrial = asyncHandler(async (req, res) => {
  const result = await subscriptionService.activateFreeTrial(req.body, {
    requestId: req.requestId,
    ipAddress: req.ip
  });
  return sendSuccess(res, {
    statusCode: 201,
    message: '15-Day Free Trial activated successfully',
    data: result
  });
});

const listPlans = asyncHandler(async (req, res) => {
  const result = await subscriptionService.getAvailablePlans({
    requestId: req.requestId
  });
  return sendSuccess(res, {
    message: 'Available subscription plans fetched',
    data: result
  });
});

const getCurrentSubscription = asyncHandler(async (req, res) => {
  const organisationId = req.auth?.organisationId || req.query.organisationId;
  const result = await subscriptionService.getOrganisationSubscriptionStatus(organisationId, {
    requestId: req.requestId
  });
  return sendSuccess(res, {
    message: 'Organisation subscription status fetched',
    data: result
  });
});

const updateStatus = asyncHandler(async (req, res) => {
  const updated = await subscriptionService.updateSubscriptionLifecycleStatus(req.params.id, req.body.status, {
    actorUserId: req.auth.userId,
    requestId: req.requestId
  });
  return sendSuccess(res, {
    message: 'Subscription lifecycle status updated',
    data: updated
  });
});

const resendActivation = asyncHandler(async (req, res) => {
  const result = await subscriptionService.resendActivationInvitation(req.params.id, {
    actorUserId: req.auth.userId,
    requestId: req.requestId,
    ipAddress: req.ip
  });
  return sendSuccess(res, {
    message: 'Activation invitation resent successfully',
    data: result
  });
});

const handleDeliveryWebhook = asyncHandler(async (req, res) => {
  const result = await subscriptionService.recordNotificationDeliveryWebhook(req.body, {
    requestId: req.requestId
  });
  return sendSuccess(res, {
    message: 'Delivery webhook recorded',
    data: result
  });
});

const listPlatformPayments = asyncHandler(async (req, res) => {
  const result = await subscriptionService.listPlatformAdminPayments(req.query);
  return sendSuccess(res, {
    message: 'Platform Admin payments list fetched',
    data: result.items,
    meta: result.meta
  });
});

const voidPayment = asyncHandler(async (req, res) => {
  const result = await subscriptionService.voidSubscriptionPayment(req.params.id, { ...req.body, targetStatus: 'VOIDED' }, {
    actorUserId: req.auth.userId,
    requestId: req.requestId
  });
  return sendSuccess(res, {
    message: 'Payment record successfully voided',
    data: result
  });
});

const archivePayment = asyncHandler(async (req, res) => {
  const result = await subscriptionService.voidSubscriptionPayment(req.params.id, { ...req.body, targetStatus: 'ARCHIVED' }, {
    actorUserId: req.auth.userId,
    requestId: req.requestId
  });
  return sendSuccess(res, {
    message: 'Payment record successfully archived',
    data: result
  });
});

const inspectActivation = asyncHandler(async (req, res) => {
  const result = await subscriptionService.inspectActivationToken(req.query.token);
  return sendSuccess(res, {
    message: 'Activation invitation inspected',
    data: result
  });
});

const listNotifications = asyncHandler(async (req, res) => {
  const result = await notificationHistoryService.listNotificationHistory(req.query, {
    actorUserId: req.auth.userId,
    requestId: req.requestId
  });
  return sendSuccess(res, {
    message: 'Notification history fetched',
    data: result.items,
    meta: result.meta
  });
});

const getNotification = asyncHandler(async (req, res) => {
  const result = await notificationHistoryService.getNotificationDetails(req.params.id, {
    actorUserId: req.auth.userId,
    requestId: req.requestId
  });
  return sendSuccess(res, {
    message: 'Notification details fetched',
    data: result
  });
});

const clearNotification = asyncHandler(async (req, res) => {
  const result = await notificationHistoryService.clearNotification(req.params.id, req.body, {
    actorUserId: req.auth.userId,
    requestId: req.requestId
  });
  return sendSuccess(res, {
    message: 'Notification history record cleared',
    data: result
  });
});

const bulkClearNotifications = asyncHandler(async (req, res) => {
  const result = await notificationHistoryService.bulkClearNotifications(req.body, {
    actorUserId: req.auth.userId,
    requestId: req.requestId
  });
  return sendSuccess(res, {
    message: 'Notification history records bulk cleared',
    data: result
  });
});

const archiveBooking = asyncHandler(async (req, res) => {
  const result = await subscriptionService.archiveSubscriptionBooking(req.params.id, req.body, {
    actorUserId: req.auth.userId,
    requestId: req.requestId
  });
  return sendSuccess(res, {
    message: result.idempotentReplay
      ? 'Subscription booking already archived (idempotent)'
      : 'Subscription booking successfully removed from active history and archived',
    data: result.subscription
  });
});

const listPlatformOrganisations = asyncHandler(async (req, res) => {
  const result = await platformAdminOrgService.listPlatformOrganisations(req.query);
  return sendSuccess(res, {
    message: 'Platform Admin organisation directory fetched',
    data: result.items,
    meta: result.meta
  });
});

const getPlatformOrganisationDetails = asyncHandler(async (req, res) => {
  const result = await platformAdminOrgService.getPlatformOrganisationDetails(req.params.id);
  return sendSuccess(res, {
    message: 'Platform Admin organisation details fetched',
    data: result
  });
});

const resendPlatformOrgAdminActivation = asyncHandler(async (req, res) => {
  const result = await platformAdminOrgService.resendPlatformOrgAdminActivation(req.params.id, {
    actorUserId: req.auth.userId,
    requestId: req.requestId
  });
  return sendSuccess(res, result);
});

const recoverPlatformOrgAdminAccount = asyncHandler(async (req, res) => {
  const result = await platformAdminOrgService.recoverPlatformOrgAdminAccount(req.params.id, {
    actorUserId: req.auth.userId,
    requestId: req.requestId
  });
  return sendSuccess(res, result);
});

const triggerPlatformOrgAdminPasswordReset = asyncHandler(async (req, res) => {
  const result = await platformAdminOrgService.triggerPlatformOrgAdminPasswordReset(req.params.id, {
    actorUserId: req.auth.userId,
    requestId: req.requestId
  });
  return sendSuccess(res, result);
});

const cancelOrganisationSubscription = asyncHandler(async (req, res) => {
  const result = await platformAdminOrgService.cancelOrganisationSubscription(
    req.params.id,
    req.body,
    {
      actorUserId: req.auth.userId,
      requestId: req.requestId,
      ipAddress: req.ip
    }
  );
  return sendSuccess(res, result);
});

const getOperationalDiagnostics = asyncHandler(async (_req, res) => {
  const data = await platformDiagnosticsService.getOperationalDiagnostics();
  return sendSuccess(res, {
    message: 'Operational diagnostics fetched',
    data
  });
});

module.exports = {
  createSubscription,
  getSubscription,
  submitPayment,
  listPlatformQueue,
  listPlatformPayments,
  voidPayment,
  archivePayment,
  archiveBooking,
  verifyPayment,
  resendActivation,
  handleDeliveryWebhook,
  activateAccount,
  activateFreeTrial,
  listPlans,
  getCurrentSubscription,
  updateStatus,
  inspectActivation,
  listNotifications,
  getNotification,
  clearNotification,
  bulkClearNotifications,
  listPlatformOrganisations,
  getPlatformOrganisationDetails,
  resendPlatformOrgAdminActivation,
  recoverPlatformOrgAdminAccount,
  triggerPlatformOrgAdminPasswordReset,
  cancelOrganisationSubscription,
  getOperationalDiagnostics
};

