const express = require('express');
const { z } = require('zod');
const validate = require('../../middleware/validate');
const { optionalHttpUrlSchema, safeLocationOrMeetingUrlSchema } = require('../../utils/validationHelpers');
const { authenticate, optionalAuthenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantIsolation');
const { requirePermission } = require('../../middleware/rbac');
const { publicSubmissionLimiter } = require('../../middleware/rateLimiter');
const { createUploadMiddleware, RESUME_MIME_TYPES } = require('../../middleware/upload');
const controller = require('./application.controller');

const router = express.Router();
const uploadResume = createUploadMiddleware({ allowedMimeTypes: RESUME_MIME_TYPES });

const uuidParam = { params: z.object({ id: z.string().uuid() }) };
const jobApplyParam = { params: z.object({ jobId: z.string().uuid() }) };

const publicApplySchema = {
  ...jobApplyParam,
  body: z.object({
    fullName: z.string().min(2).max(180),
    email: z.string().email(),
    mobileNumber: z.string().min(6).max(40),
    location: z.string().min(2).max(160),
    totalExperienceYears: z.coerce.number().min(0).max(60),
    currentCompany: z.string().max(160).optional(),
    currentSalary: z.string().max(80).optional(),
    expectedSalary: z.string().max(80).optional(),
    noticePeriodDays: z.coerce.number().int().min(0).max(365).default(0),
    skills: z.union([z.string(), z.array(z.string())]).default([]),
    coverLetter: z.string().max(5000).optional(),
    linkedinUrl: optionalHttpUrlSchema(300),
    portfolioUrl: optionalHttpUrlSchema(300)
  })
};

const screenSchema = {
  ...uuidParam,
  body: z.object({
    decision: z.enum(['SHORTLIST', 'REJECT', 'HOLD']),
    notes: z.string().max(2000).optional(),
    technicalInterviewerEmployeeId: z.string().uuid().optional(),
    scheduledAt: z.string().datetime().optional(),
    durationMinutes: z.coerce.number().int().min(15).max(240).optional(),
    meetingMode: z.enum(['VIDEO', 'IN_PERSON', 'PHONE']).optional(),
    meetingLinkOrLocation: safeLocationOrMeetingUrlSchema(1, 500).optional()
  })
};

const finalDecisionSchema = {
  ...uuidParam,
  body: z.object({
    decision: z.enum(['SELECTED', 'REJECTED', 'ON_HOLD']),
    notes: z.string().max(2000).optional()
  })
};

// Public application submission
router.post(
  '/public/jobs/:jobId/apply',
  publicSubmissionLimiter,
  optionalAuthenticate,
  uploadResume.single('resume'),
  validate(publicApplySchema),
  controller.applyPublic
);

// Authenticated Organisation recruiter routes
router.get('/', authenticate, requireTenant, requirePermission('application:view'), controller.listApplications);
router.get('/:id', authenticate, requireTenant, requirePermission('application:view'), validate(uuidParam), controller.getApplication);
router.post('/:id/screen', authenticate, requireTenant, requirePermission('application:screen'), validate(screenSchema), controller.screen);
router.post('/:id/final-decision', authenticate, requireTenant, requirePermission('application:final_decision'), validate(finalDecisionSchema), controller.finalDecision);

module.exports = router;

