const express = require('express');
const { z } = require('zod');
const validate = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const { requireTenant } = require('../../middleware/tenantIsolation');
const { requirePermission } = require('../../middleware/rbac');
const controller = require('./organisation.controller');

const router = express.Router();

const empParams = { params: z.object({ employeeId: z.string().uuid() }) };

const addEmployeeSchema = {
  body: z.object({
    fullName: z.string().min(2).max(160),
    email: z.string().email(),
    department: z.string().min(2).max(120).default('Engineering'),
    designation: z.string().min(2).max(120).default('Recruiter'),
    phone: z.string().max(40).optional(),
    roleId: z.string().uuid().optional(),
    roleCode: z.string().optional(),
    customPermissions: z.array(z.string()).optional(),
    revokedPermissions: z.array(z.string()).optional(),
    sendInvite: z.boolean().default(true)
  }).refine((v) => v.roleId || v.roleCode, { message: 'Either roleId or roleCode is required' })
};

const assignRoleSchema = {
  ...empParams,
  body: z.object({
    roleId: z.string().uuid().optional(),
    roleCode: z.string().optional()
  }).refine((v) => v.roleId || v.roleCode, { message: 'Either roleId or roleCode is required' })
};

const updatePermsSchema = {
  ...empParams,
  body: z.object({
    customPermissions: z.array(z.string()).optional(),
    revokedPermissions: z.array(z.string()).optional()
  })
};

const inspectActivationSchema = {
  query: z.object({
    token: z.string().min(1, 'Activation token is required')
  })
};

const activateEmployeeSchema = {
  body: z.object({
    token: z.string().min(1, 'Activation token is required'),
    password: z.string().min(8, 'Password must be at least 8 characters')
  })
};

// Public employee activation endpoints (mounted before parameterized /employees/:employeeId)
router.get('/employees/activate/inspect', validate(inspectActivationSchema), controller.inspectActivation);
router.post('/employees/activate', validate(activateEmployeeSchema), controller.activateEmployee);

router.get('/profile', authenticate, requireTenant, requirePermission('organisation:view'), controller.getProfile);
router.get('/dashboard', authenticate, requireTenant, requirePermission('organisation:view'), controller.getDashboard);

router.get('/employees', authenticate, requireTenant, requirePermission('employee:view'), controller.listEmployees);
router.post('/employees', authenticate, requireTenant, requirePermission('employee:create'), validate(addEmployeeSchema), controller.addEmployee);
router.post('/employees/:employeeId/resend-invitation', authenticate, requireTenant, requirePermission('employee:manage'), validate(empParams), controller.resendInvitation);
router.patch('/employees/:employeeId/role', authenticate, requireTenant, requirePermission('employee:manage'), validate(assignRoleSchema), controller.assignRole);
router.patch('/employees/:employeeId/permissions', authenticate, requireTenant, requirePermission('employee:manage'), validate(updatePermsSchema), controller.updatePermissions);
router.patch('/employees/:employeeId/deactivate', authenticate, requireTenant, requirePermission('employee:manage'), validate(empParams), controller.deactivateAccess);
router.patch('/employees/:employeeId/reactivate', authenticate, requireTenant, requirePermission('employee:manage'), validate(empParams), controller.reactivateAccess);
router.delete('/employees/:employeeId', authenticate, requireTenant, requirePermission('employee:manage'), validate(empParams), controller.deleteEmployee);
router.get('/employees/:employeeId/activity', authenticate, requireTenant, requirePermission('employee:view'), validate(empParams), controller.getActivity);

module.exports = router;

