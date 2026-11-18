const express = require('express');
const { z } = require('zod');
const validate = require('../../middleware/validate');
const { optionalHttpUrlSchema } = require('../../utils/validationHelpers');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantIsolation');
const { requireCandidate, requirePermission } = require('../../middleware/rbac');
const { candidateVerificationLimiter } = require('../../middleware/rateLimiter');
const controller = require('./tracking.controller');

const portalRouter = express.Router();
const reportsRouter = express.Router();

const profileSchema = {
  body: z.object({
    fullName: z.string().min(2).max(180).optional(),
    mobileNumber: z.string().min(6).max(40).optional(),
    location: z.string().min(2).max(160).optional(),
    totalExperienceYears: z.coerce.number().min(0).max(60).optional(),
    currentCompany: z.string().max(160).optional(),
    currentSalary: z.string().max(80).optional(),
    expectedSalary: z.string().max(80).optional(),
    noticePeriodDays: z.coerce.number().int().min(0).max(365).optional(),
    skills: z.array(z.string()).optional(),
    headline: z.string().max(255).optional(),
    linkedinUrl: optionalHttpUrlSchema(300),
    portfolioUrl: optionalHttpUrlSchema(300)
  })
};

const respondOfferSchema = {
  params: z.object({ offerId: z.string().uuid() }),
  body: z.object({
    decision: z.enum(['ACCEPT', 'REJECT']),
    note: z.string().max(1000).optional()
  })
};

const claimApplicationsSchema = {
  body: z.object({
    organisationId: z.string().uuid(),
    applicationReference: z.string().trim().min(4).max(60).optional()
  })
};

// Candidate self-service routes
portalRouter.get('/overview', authenticate, requireCandidate, controller.getPortalOverview);
portalRouter.patch('/profile', authenticate, requireCandidate, validate(profileSchema), controller.updateProfile);
portalRouter.post('/claims', authenticate, requireCandidate, candidateVerificationLimiter, validate(claimApplicationsSchema), controller.claimApplications);
portalRouter.post('/offers/:offerId/respond', authenticate, requireCandidate, validate(respondOfferSchema), controller.respondOffer);

// Organisation recruitment reports route
reportsRouter.get('/summary', authenticate, requireTenant, requirePermission('report:view'), controller.getReports);

module.exports = {
  portalRouter,
  reportsRouter
};

