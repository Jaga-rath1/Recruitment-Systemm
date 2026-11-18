'use strict';

const express = require('express');
const router = express.Router();
const controller = require('./auth.controller');
const { authenticate } = require('../../middlewares/authenticate');
const { authorize, requireInternal } = require('../../middlewares/authorize');
const { limitByIp, loginGuard } = require('../../middlewares/rateLimit');

const FIFTEEN_MINUTES = 15 * 60 * 1000;

// Public — each is limited so it cannot be used to guess passwords or flood mailboxes
router.get('/industries', controller.listIndustries); // Predefined platform industries catalog
router.post('/register-tenant', limitByIp('register', 20, FIFTEEN_MINUTES), controller.registerTenant); // Tenant/company registration with industry
router.post('/signup', limitByIp('register', 20, FIFTEEN_MINUTES), controller.registerTenant); // Alias for signup
router.post('/register', limitByIp('register', 10, FIFTEEN_MINUTES), controller.register); // first-account bootstrap only
router.post('/login', limitByIp('login', 100, FIFTEEN_MINUTES), loginGuard, controller.login);
router.post('/forgot-password', limitByIp('forgot-password', 10, FIFTEEN_MINUTES), controller.forgotPassword);
router.post('/reset-password', limitByIp('reset-password', 20, FIFTEEN_MINUTES), controller.resetPassword);

// Authenticated (any valid JWT for an active account)
router.get('/me', authenticate, controller.me);
router.post('/logout', authenticate, controller.logout);
router.post('/change-password', authenticate, controller.changePassword);
router.post('/setup-password', authenticate, controller.setupPassword); // first-login password setup
router.post('/first-login/change-password', authenticate, controller.setupPassword);

// Account administration — scoped to the caller's organization in the service layer
const accountAdmins = [authenticate, authorize('super_admin', 'org_admin', 'hr')];
router.post('/provision', ...accountAdmins, controller.provision);
router.get('/users/:id', ...accountAdmins, controller.getUser);
router.patch('/users/:id/status', ...accountAdmins, controller.setStatus);
router.patch('/users/:id/role', authenticate, authorize('super_admin', 'org_admin'), controller.setRole);

// Tenant administration for super_admin
router.get('/tenants', authenticate, authorize('super_admin'), controller.listAllTenants);
router.patch('/tenants/:id/status', authenticate, authorize('super_admin'), controller.updateTenantStatus);

// Service-to-service
router.get('/internal/users', requireInternal, controller.listOrgUsersByRoles); // who to notify in an organization
router.get('/internal/accounts/:id', requireInternal, controller.getAccountState); // is this session still valid
router.get('/internal/tenants', requireInternal, controller.listAllTenants); // list tenants for helpdesk service
router.get('/internal/tenants/:id', requireInternal, controller.getTenantDetails); // trusted tenant & industry lookup
router.patch('/internal/tenants/:id/status', requireInternal, controller.updateTenantStatus); // update tenant lifecycle status
router.post('/internal/industries', requireInternal, controller.syncIndustry); // sync industry catalog from helpdesk
router.post('/internal/provision-agent', requireInternal, controller.provisionAgent); // secure agent account provisioning
router.get('/internal/employees', requireInternal, controller.listEligibleEmployees); // fetch eligible active employees
router.get('/internal/employees/:id', requireInternal, controller.getEmployeeForAgentRegistration); // verify employee for agent
router.post('/internal/promote-employee-to-agent', requireInternal, controller.promoteEmployeeToAgent); // promote employee to agent role
router.get('/internal/service-managers', requireInternal, controller.listServiceManagers); // fetch service managers
router.post('/internal/service-managers/promote', requireInternal, controller.promoteEmployeeToServiceManager); // promote employee to service manager
router.post('/internal/service-managers/provision', requireInternal, controller.provisionServiceManager); // provision service manager
router.delete('/internal/service-managers/:id', requireInternal, controller.removeServiceManagerAssignment); // remove service manager assignment

// Service Manager administration — strictly scoped to org_admin
router.get('/service-managers', authenticate, authorize('org_admin'), controller.listServiceManagers);
router.post('/service-managers/promote', authenticate, authorize('org_admin'), controller.promoteEmployeeToServiceManager);
router.post('/service-managers', authenticate, authorize('org_admin'), controller.provisionServiceManager);
router.delete('/service-managers/:id', authenticate, authorize('org_admin'), controller.removeServiceManagerAssignment);

// Employee management for authorized administrators
router.get('/employees', authenticate, authorize('super_admin', 'org_admin', 'manager', 'hr'), controller.listEligibleEmployees);
router.get('/employees/:id', authenticate, authorize('super_admin', 'org_admin', 'manager', 'hr'), controller.getEmployeeForAgentRegistration);

// SMTP preflight — super_admin only, no secrets exposed
router.get('/email/health', authenticate, authorize('super_admin'), controller.emailHealth);

module.exports = router;
