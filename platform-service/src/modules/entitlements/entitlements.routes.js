'use strict';
const express = require('express');
const router = express.Router();
const controller = require('./entitlements.controller');
const { requirePlatformAdmin, requireAuth, requireOrgContext } = require('../../middlewares/authorize');

// Self-service: any authenticated org user reads their own org's entitlements.
router.get('/me', requireAuth, requireOrgContext, controller.getMine);

// Platform admin: entitlements for a specific organization.
router.get('/organizations/:organizationId', requirePlatformAdmin, controller.getForOrganization);

module.exports = router;
