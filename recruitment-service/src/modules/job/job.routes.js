const express = require('express');
const { z } = require('zod');
const validate = require('../../middleware/validate');
const { containsUnsafeKeys } = require('../../utils/validationHelpers');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantIsolation');
const { requirePermission, requirePlatformAdmin } = require('../../middleware/rbac');
const controller = require('./job.controller');
const platformAdminJobController = require('./platformAdminJob.controller');

const router = express.Router();
const uuidParam = { params: z.object({ id: z.string().uuid() }) };

const reasonSchema = {
  ...uuidParam,
  body: z.object({
    reason: z.string().trim().min(5, 'Mandatory reason must be at least 5 characters long').max(1000)
  })
};

const createJobSchema = {
  body: z.object({
    title: z.string().min(3).max(200),
    description: z.string().min(20),
    department: z.string().min(2).max(120),
    skills: z.array(z.string()).default([]),
    experienceMinYears: z.coerce.number().int().min(0).default(0),
    experienceMaxYears: z.coerce.number().int().min(0).nullable().optional(),
    experienceLabel: z.string().max(80).optional(),
    salaryMin: z.coerce.number().int().min(0).nullable().optional(),
    salaryMax: z.coerce.number().int().min(0).nullable().optional(),
    salaryCurrency: z.string().max(10).default('USD'),
    salaryDisplay: z.string().max(120).optional(),
    location: z.string().min(2).max(160),
    employmentType: z.string().min(2).max(60).default('FULL_TIME'),
    headcount: z.coerce.number().int().min(1).default(1),
    applicationDeadline: z.string().datetime().nullable().optional(),
    recruitmentConfig: z
      .record(z.string(), z.unknown())
      .refine((cfg) => !containsUnsafeKeys(cfg), { message: 'Unsupported keys inside recruitmentConfig' })
      .optional(),
    publishImmediately: z.boolean().default(false)
  })
};

const updateJobSchema = {
  ...uuidParam,
  body: createJobSchema.body.partial()
};

// Public Careers endpoints
router.get('/public/careers', controller.listPublicJobs);
router.get('/public/careers/:identifier', controller.getPublicJob);

// Platform Admin Global Job Governance
router.get('/platform-admin/jobs', authenticate, requirePlatformAdmin, platformAdminJobController.listPlatformAdminJobs);
router.get('/platform-admin/jobs/:id', authenticate, requirePlatformAdmin, validate(uuidParam), platformAdminJobController.getPlatformAdminJobDetails);
router.post('/platform-admin/jobs/:id/unpublish', authenticate, requirePlatformAdmin, validate(reasonSchema), platformAdminJobController.unpublishPlatformAdminJob);
router.post('/platform-admin/jobs/:id/discard', authenticate, requirePlatformAdmin, validate(reasonSchema), platformAdminJobController.discardPlatformAdminJob);

// Internal Organisation endpoints
router.post('/hrms/sync', authenticate, requireTenant, requirePermission('job:hrms:sync'), controller.syncHrms);
router.get('/', authenticate, requireTenant, requirePermission('job:view'), controller.listOrgJobs);
router.get('/:id', authenticate, requireTenant, requirePermission('job:view'), validate(uuidParam), controller.getOrgJob);
router.post('/', authenticate, requireTenant, requirePermission('job:create'), validate(createJobSchema), controller.createManual);
router.patch('/:id', authenticate, requireTenant, requirePermission('job:edit'), validate(updateJobSchema), controller.update);
router.post('/:id/publish', authenticate, requireTenant, requirePermission('job:publish'), validate(uuidParam), controller.publish);
router.post('/:id/unpublish', authenticate, requireTenant, requirePermission('job:publish'), validate(uuidParam), controller.unpublish);
router.post('/:id/close', authenticate, requireTenant, requirePermission('job:publish'), validate(uuidParam), controller.close);

module.exports = router;

