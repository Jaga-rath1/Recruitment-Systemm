'use strict';
const express = require('express');
const router = express.Router();
const controller = require('./employees.controller');
const {
  requireAuth,
  requireOrgContext,
  requireHrOrAdmin,
  requireManagerOrAbove,
} = require('../../middlewares/authorize');
const { requireFeature } = require('../../middlewares/entitlement');

// All routes require authentication, an organization, and the Employees entitlement
router.use(requireAuth, requireOrgContext, requireFeature('EMPLOYEES'));

// Self-service — any authenticated user (must be before /:id)
router.get('/me', controller.getMe);
router.patch('/me', controller.updateMe);

// The caller's reach in the reporting hierarchy (used by other services too)
router.get('/scope', controller.getScope);

// List / read — manager or above, limited to the caller's scope
router.get('/', requireManagerOrAbove, controller.list);
router.get('/:id', requireManagerOrAbove, controller.getById);

// Manage — HR or org admin
router.post('/', requireHrOrAdmin, controller.create);
router.put('/:id', requireHrOrAdmin, controller.update);
router.patch('/:id/status', requireHrOrAdmin, controller.updateStatus);
router.post('/:id/provision', requireHrOrAdmin, controller.provision);
router.delete('/:id', requireHrOrAdmin, controller.remove);

module.exports = router;
