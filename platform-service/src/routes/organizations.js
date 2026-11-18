'use strict';
const express = require('express');
const router = express.Router();
const subscriptionsController = require('../modules/subscriptions/subscriptions.controller');
const trialsController = require('../modules/trials/trials.controller');
const { requirePlatformAdmin } = require('../middlewares/authorize');

router.use(requirePlatformAdmin);

// GET /api/v1/platform/organizations/:organizationId/subscription
router.get('/:organizationId/subscription', subscriptionsController.getByOrganizationId);

// GET /api/v1/platform/organizations/:organizationId/trial
router.get('/:organizationId/trial', trialsController.getByOrganizationId);

// POST /api/v1/platform/organizations/:organizationId/trial
router.post('/:organizationId/trial', trialsController.create);

module.exports = router;
