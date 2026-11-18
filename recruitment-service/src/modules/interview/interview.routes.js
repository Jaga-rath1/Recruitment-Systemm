const express = require('express');
const { z } = require('zod');
const validate = require('../../middleware/validate');
const { safeLocationOrMeetingUrlSchema } = require('../../utils/validationHelpers');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantIsolation');
const { requirePermission } = require('../../middleware/rbac');
const controller = require('./interview.controller');

const router = express.Router();
const uuidParam = { params: z.object({ id: z.string().uuid() }) };

const scheduleSchema = {
  body: z.object({
    applicationId: z.string().uuid(),
    roundType: z.enum(['TECHNICAL', 'MANAGERIAL']),
    scheduledAt: z.string().datetime(),
    durationMinutes: z.coerce.number().int().min(15).max(240).default(60),
    meetingMode: z.enum(['VIDEO', 'IN_PERSON', 'PHONE']).default('VIDEO'),
    meetingLinkOrLocation: safeLocationOrMeetingUrlSchema(3, 500),
    interviewerEmployeeId: z.string().uuid()
  })
};

const rescheduleSchema = {
  ...uuidParam,
  body: z.object({
    scheduledAt: z.string().datetime(),
    durationMinutes: z.coerce.number().int().min(15).max(240).optional(),
    meetingMode: z.enum(['VIDEO', 'IN_PERSON', 'PHONE']).optional(),
    meetingLinkOrLocation: safeLocationOrMeetingUrlSchema(3, 500).optional(),
    reason: z.string().max(1000).optional()
  })
};

const feedbackSchema = {
  ...uuidParam,
  body: z.object({
    overallRating: z.coerce.number().int().min(1).max(10),
    technicalSkillsRating: z.coerce.number().int().min(1).max(10).optional(),
    communicationRating: z.coerce.number().int().min(1).max(10).optional(),
    behaviouralRating: z.coerce.number().int().min(1).max(10).optional(),
    problemSolvingRating: z.coerce.number().int().min(1).max(10).optional(),
    leadershipRating: z.coerce.number().int().min(1).max(10).optional(),
    strengths: z.string().min(3).max(4000),
    weaknesses: z.string().min(3).max(4000),
    detailedFeedback: z.string().min(5).max(8000),
    recommendation: z.enum(['SELECTED', 'REJECTED', 'ON_HOLD'])
  })
};

router.get('/assigned/technical', authenticate, requireTenant, requirePermission('interview:technical:view_assigned'), controller.listAssignedTechnical);
router.get('/assigned/managerial', authenticate, requireTenant, requirePermission('interview:managerial:view_assigned'), controller.listAssignedManagerial);

router.get('/', authenticate, requireTenant, requirePermission('interview:view_all'), controller.listAll);
router.post('/', authenticate, requireTenant, requirePermission('interview:schedule'), validate(scheduleSchema), controller.schedule);
router.patch('/:id/reschedule', authenticate, requireTenant, requirePermission('interview:schedule'), validate(rescheduleSchema), controller.reschedule);

router.post(
  '/:id/feedback',
  authenticate,
  requireTenant,
  requirePermission('interview:technical:feedback', 'interview:managerial:feedback'),
  validate(feedbackSchema),
  controller.submitFeedback
);

module.exports = router;

