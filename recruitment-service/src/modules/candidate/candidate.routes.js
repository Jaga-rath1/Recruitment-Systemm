const express = require('express');
const { z } = require('zod');
const validate = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantIsolation');
const { requirePermission } = require('../../middleware/rbac');
const controller = require('./candidate.controller');

const router = express.Router();
const uuidParam = { params: z.object({ id: z.string().uuid() }) };

router.get('/', authenticate, requireTenant, requirePermission('candidate:view'), controller.listCandidates);
router.get('/:id', authenticate, requireTenant, requirePermission('candidate:view'), validate(uuidParam), controller.getCandidate);

module.exports = router;

