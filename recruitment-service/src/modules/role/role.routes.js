const express = require('express');
const { z } = require('zod');
const validate = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantIsolation');
const { requirePermission } = require('../../middleware/rbac');
const controller = require('./role.controller');

const router = express.Router();

const createRoleSchema = {
  body: z.object({
    code: z.string().min(2).max(80),
    name: z.string().min(2).max(120),
    description: z.string().min(4).max(500),
    permissionCodes: z.array(z.string()).default([])
  })
};

const updatePermissionsSchema = {
  params: z.object({ roleId: z.string().uuid() }),
  body: z.object({
    permissionCodes: z.array(z.string()).min(1)
  })
};

router.get('/permissions', authenticate, requireTenant, requirePermission('role:view'), controller.listPermissions);
router.get('/', authenticate, requireTenant, requirePermission('role:view'), controller.listRoles);
router.post('/', authenticate, requireTenant, requirePermission('role:manage'), validate(createRoleSchema), controller.createRole);
router.put('/:roleId/permissions', authenticate, requireTenant, requirePermission('role:manage'), validate(updatePermissionsSchema), controller.updatePermissions);

module.exports = router;

