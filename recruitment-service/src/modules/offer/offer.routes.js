const express = require('express');
const { z } = require('zod');
const validate = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantIsolation');
const { requirePermission } = require('../../middleware/rbac');
const { createUploadMiddleware } = require('../../middleware/upload');
const controller = require('./offer.controller');

const router = express.Router();
const uploadLetter = createUploadMiddleware();
const uuidParam = { params: z.object({ id: z.string().uuid() }) };

const createOfferSchema = {
  body: z.object({
    applicationId: z.string().uuid(),
    offeredSalary: z.coerce.number().int().positive(),
    salaryCurrency: z.string().max(10).default('USD'),
    designation: z.string().min(2).max(160),
    department: z.string().min(2).max(120),
    joiningDate: z.string().datetime(),
    offerValidUntil: z.string().datetime(),
    termsSummary: z.string().max(4000).optional(),
    sendImmediately: z.union([z.boolean(), z.string().transform((v) => v === 'true')]).default(false),
    idempotencyKey: z.string().max(128).optional()
  })
};

const approveSalarySchema = {
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    approvedSalary: z.coerce.number().int().positive().optional(),
    approvalNotes: z.string().max(1000).optional()
  }).optional()
};

router.get('/', authenticate, requireTenant, requirePermission('offer:view'), controller.listOffers);
router.get('/:id', authenticate, requireTenant, requirePermission('offer:view'), validate(uuidParam), controller.getOffer);
router.post('/', authenticate, requireTenant, requirePermission('offer:manage'), uploadLetter.single('offerLetter'), validate(createOfferSchema), controller.createOffer);
router.post('/:id/letter', authenticate, requireTenant, requirePermission('offer:manage'), uploadLetter.single('offerLetter'), validate(uuidParam), controller.uploadLetter);
router.post('/:id/send', authenticate, requireTenant, requirePermission('offer:manage'), validate(uuidParam), controller.sendOffer);
router.post('/:id/approve-salary', authenticate, requireTenant, requirePermission('offer:salary_approve'), validate(approveSalarySchema), controller.approveSalary);

module.exports = router;

