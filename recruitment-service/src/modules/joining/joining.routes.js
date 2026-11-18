const express = require('express');
const { z } = require('zod');
const validate = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantIsolation');
const { requirePermission } = require('../../middleware/rbac');
const { createUploadMiddleware } = require('../../middleware/upload');
const controller = require('./joining.controller');

const router = express.Router();
const uploadLetter = createUploadMiddleware();
const uuidParam = { params: z.object({ id: z.string().uuid() }) };

const initiateSchema = {
  body: z.object({
    applicationId: z.string().uuid(),
    expectedJoiningDate: z.string().datetime().optional(),
    joiningLocation: z.string().min(2).max(200),
    reportingManager: z.string().max(160).optional(),
    onboardingNotes: z.string().max(2000).optional(),
    idempotencyKey: z.string().max(128).optional()
  })
};

const statusSchema = {
  ...uuidParam,
  body: z.object({
    status: z.enum(['INITIATED', 'LETTER_SENT', 'CONFIRMED', 'JOINED', 'NO_SHOW', 'CANCELLED']),
    actualJoiningDate: z.string().datetime().optional(),
    onboardingNotes: z.string().max(2000).optional()
  })
};

router.get('/', authenticate, requireTenant, requirePermission('joining:view'), controller.listJoining);
router.post('/', authenticate, requireTenant, requirePermission('joining:manage'), uploadLetter.single('joiningLetter'), validate(initiateSchema), controller.initiate);
router.post('/:id/letter', authenticate, requireTenant, requirePermission('joining:manage'), uploadLetter.single('joiningLetter'), validate(uuidParam), controller.uploadLetter);
router.patch('/:id/status', authenticate, requireTenant, requirePermission('joining:manage'), validate(statusSchema), controller.updateStatus);
router.post('/:id/retry-employee-sync', authenticate, requireTenant, requirePermission('joining:manage'), validate(uuidParam), controller.retryEmployeeSync);

module.exports = router;

