const express = require('express');
const { z } = require('zod');
const validate = require('../../middleware/validate');
const { strongPasswordSchema } = require('../../utils/validationHelpers');
const { authenticate } = require('../../middleware/auth');
const { requirePlatformAdmin } = require('../../middleware/rbac');
const { publicSubmissionLimiter, authRateLimiter } = require('../../middleware/rateLimiter');
const { verifyNotificationWebhookSignature } = require('../../middleware/webhookAuth');
const { createUploadMiddleware } = require('../../middleware/upload');
const controller = require('./subscription.controller');

const router = express.Router();
const uploadProof = createUploadMiddleware();

const uuidParam = { params: z.object({ id: z.string().uuid() }) };

const deliveryWebhookSchema = {
  body: z.object({
    notificationId: z.string().optional(),
    messageId: z.string().optional(),
    event: z.string().min(1).max(100),
    timestamp: z.string().optional(),
    metadata: z.record(z.any()).optional()
  }).refine((data) => Boolean(data.notificationId || data.messageId), {
    message: 'Either notificationId or messageId is required'
  })
};

const createSubSchema = {
  body: z.object({
    organisationName: z.string().min(2).max(200),
    organisationDomain: z.string().min(3).max(255),
    industry: z.string().min(2).max(120),
    companySize: z.string().min(1).max(60),
    adminName: z.string().min(2).max(160),
    adminEmail: z.string().email(),
    planCode: z.enum([
      'RECRUITMENT_BASIC',
      'RECRUITMENT_ADVANCED',
      'RECRUITMENT_ENTERPRISE',
      'RECRUITMENT_PREMIUM',
      'BASIC',
      'ADVANCED',
      'ENTERPRISE'
    ]).default('RECRUITMENT_ADVANCED'),
    billingCycle: z.enum(['MONTHLY', 'ANNUAL']).default('ANNUAL'),
    idempotencyKey: z.string().max(128).optional()
  })
};

const createTrialSchema = {
  body: z.object({
    organisationName: z.string().min(2).max(200),
    organisationDomain: z.string().min(3).max(255),
    industry: z.string().min(2).max(120).default('Technology'),
    companySize: z.string().min(1).max(60).default('11-50'),
    adminName: z.string().min(2).max(160),
    adminEmail: z.string().email(),
    password: z.string().min(8).max(128).optional(),
    idempotencyKey: z.string().max(128).optional()
  })
};

const submitPaymentSchema = {
  ...uuidParam,
  body: z.object({
    paymentReference: z.string().min(4).max(160),
    paymentMethod: z.string().min(2).max(60).default('WIRE_TRANSFER'),
    amountCents: z.coerce.number().int().positive().optional(),
    submittedByEmail: z.string().email().optional(),
    notes: z.string().max(1000).optional(),
    idempotencyKey: z.string().max(128).optional()
  })
};

const verifySchema = {
  ...uuidParam,
  body: z.object({
    decision: z.enum(['APPROVE', 'REJECT']),
    paymentId: z.string().uuid().optional(),
    reason: z.string().max(1000).optional()
  })
};

const activateSchema = {
  body: z.object({
    activationToken: z.string().min(16),
    password: strongPasswordSchema('Password')
  })
};

const statusSchema = {
  ...uuidParam,
  body: z.object({
    status: z.enum(['ACTIVE', 'EXPIRED', 'SUSPENDED', 'CANCELLED'])
  })
};

const voidPaymentSchema = {
  ...uuidParam,
  body: z.object({
    reason: z.string().trim().min(5, 'Mandatory reason must be at least 5 characters long').max(1000)
  })
};

const clearNotificationSchema = {
  ...uuidParam,
  body: z.object({
    reason: z.string().trim().min(5, 'Mandatory reason must be at least 5 characters long').max(1000)
  })
};

const bulkClearNotificationSchema = {
  body: z.object({
    reason: z.string().trim().min(5, 'Mandatory reason must be at least 5 characters long').max(1000),
    ids: z.array(z.string().uuid()).optional(),
    beforeDate: z.string().optional(),
    eventType: z.string().optional()
  })
};

const archiveBookingSchema = {
  ...uuidParam,
  body: z.object({
    reason: z.string().trim().min(5, 'Mandatory reason must be at least 5 characters long').max(1000)
  })
};

const cancelSubscriptionSchema = {
  ...uuidParam,
  body: z.object({
    reason: z.string().trim().min(5, 'Mandatory cancellation reason must be at least 5 characters long').max(1000)
  })
};

router.get('/plans', controller.listPlans);
router.post('/trial', publicSubmissionLimiter, validate(createTrialSchema), controller.activateFreeTrial);
router.get('/current', authenticate, controller.getCurrentSubscription);

router.post('/', publicSubmissionLimiter, validate(createSubSchema), controller.createSubscription);
router.get('/activate/inspect', controller.inspectActivation);
router.post('/activate', authRateLimiter, validate(activateSchema), controller.activateAccount);
router.post(
  '/notifications/delivery-webhook',
  verifyNotificationWebhookSignature,
  validate(deliveryWebhookSchema),
  controller.handleDeliveryWebhook
);
router.get('/platform-admin/diagnostics', authenticate, requirePlatformAdmin, controller.getOperationalDiagnostics);
router.get('/platform-admin/queue', authenticate, requirePlatformAdmin, controller.listPlatformQueue);
router.get('/platform-admin/organisations', authenticate, requirePlatformAdmin, controller.listPlatformOrganisations);
router.get('/platform-admin/organisations/:id', authenticate, requirePlatformAdmin, validate(uuidParam), controller.getPlatformOrganisationDetails);
router.post('/platform-admin/organisations/:id/resend-activation', authenticate, requirePlatformAdmin, authRateLimiter, validate(uuidParam), controller.resendPlatformOrgAdminActivation);
router.post('/platform-admin/organisations/:id/recover-admin', authenticate, requirePlatformAdmin, validate(uuidParam), controller.recoverPlatformOrgAdminAccount);
router.post('/platform-admin/organisations/:id/password-reset', authenticate, requirePlatformAdmin, authRateLimiter, validate(uuidParam), controller.triggerPlatformOrgAdminPasswordReset);
router.post('/platform-admin/organisations/:id/cancel', authenticate, requirePlatformAdmin, validate(cancelSubscriptionSchema), controller.cancelOrganisationSubscription);
router.get('/platform-admin/payments', authenticate, requirePlatformAdmin, controller.listPlatformPayments);
router.post('/platform-admin/payments/:id/void', authenticate, requirePlatformAdmin, validate(voidPaymentSchema), controller.voidPayment);
router.post('/platform-admin/payments/:id/archive', authenticate, requirePlatformAdmin, validate(voidPaymentSchema), controller.archivePayment);
router.get('/platform-admin/notifications', authenticate, requirePlatformAdmin, controller.listNotifications);
router.get('/platform-admin/notifications/:id', authenticate, requirePlatformAdmin, validate(uuidParam), controller.getNotification);
router.post('/platform-admin/notifications/:id/clear', authenticate, requirePlatformAdmin, validate(clearNotificationSchema), controller.clearNotification);
router.post('/platform-admin/notifications/bulk-clear', authenticate, requirePlatformAdmin, validate(bulkClearNotificationSchema), controller.bulkClearNotifications);
router.post('/platform-admin/:id/verify', authenticate, requirePlatformAdmin, validate(verifySchema), controller.verifyPayment);
router.post('/platform-admin/:id/archive', authenticate, requirePlatformAdmin, validate(archiveBookingSchema), controller.archiveBooking);
router.post('/platform-admin/:id/cancel', authenticate, requirePlatformAdmin, validate(cancelSubscriptionSchema), controller.cancelOrganisationSubscription);
router.post('/platform-admin/:id/resend-activation', authenticate, requirePlatformAdmin, authRateLimiter, validate(uuidParam), controller.resendActivation);
router.patch('/platform-admin/:id/status', authenticate, requirePlatformAdmin, validate(statusSchema), controller.updateStatus);

router.get('/:id', validate(uuidParam), controller.getSubscription);
router.post('/:id/payments', publicSubmissionLimiter, uploadProof.single('proof'), validate(submitPaymentSchema), controller.submitPayment);

module.exports = router;

