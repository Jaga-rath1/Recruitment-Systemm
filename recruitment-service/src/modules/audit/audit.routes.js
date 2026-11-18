const express = require('express');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantIsolation');
const { requirePermission } = require('../../middleware/rbac');
const auditController = require('./audit.controller');

const router = express.Router();

router.get('/', authenticate, requireTenant, requirePermission('audit:view'), auditController.listOrganisationLogs);

module.exports = router;

