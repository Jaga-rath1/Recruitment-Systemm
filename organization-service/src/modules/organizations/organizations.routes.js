'use strict';
const express = require('express');
const router = express.Router();
const controller = require('./organizations.controller');
const { requireAuth, requireSuperAdmin, writeAccess, profileReadAccess } = require('../../middlewares/authorize');

// List / create organizations — super_admin only
router.get('/', requireAuth, requireSuperAdmin, controller.list);
router.post('/', requireAuth, requireSuperAdmin, controller.create);

// Read — any member of that organization; update — its org_admin (or super_admin)
router.get('/:id', ...profileReadAccess, controller.getById);
router.patch('/:id', ...writeAccess, controller.update);

// Status update — super_admin only
router.patch('/:id/status', requireAuth, requireSuperAdmin, controller.updateStatus);

module.exports = router;
