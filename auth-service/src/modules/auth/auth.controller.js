'use strict';

const authService = require('./auth.service');
const emailService = require('../../email');
const {
  validateRegister, validateLogin, validateChangePassword,
  validateForgotPassword, validateResetPassword, validateProvision, validateRole,
  validateRegisterTenant, validateSetupPassword,
} = require('./auth.validation');


async function register(req, res, next) {
  try {
    const error = validateRegister(req.body);
    if (error) return res.status(400).json({ success: false, message: error });
    const user = await authService.register(req.body);
    res.status(201).json({ success: true, user });
  } catch (err) { next(err); }
}

async function login(req, res, next) {
  try {
    const error = validateLogin(req.body);
    if (error) return res.status(400).json({ success: false, message: error });
    const result = await authService.login(req.body);
    req.loginAttempt.succeeded();
    res.json({ success: true, ...result });
  } catch (err) {
    // Only wrong credentials count towards the lockout, not server faults.
    if (err.status === 401) req.loginAttempt.failed();
    next(err);
  }
}

async function me(req, res, next) {
  try {
    const user = await authService.getMe(req.user.userId);
    res.json({ success: true, user });
  } catch (err) { next(err); }
}

// Stateless JWT: logout is a client-side token drop. The endpoint exists so
// clients have one consistent contract.
async function logout(req, res) {
  res.json({ success: true, message: 'Logged out' });
}

async function changePassword(req, res, next) {
  try {
    const error = validateChangePassword(req.body);
    if (error) return res.status(400).json({ success: false, message: error });
    const result = await authService.changePassword(req.user.userId, req.body.currentPassword, req.body.newPassword);
    res.json({ success: true, message: 'Password changed', ...result });
  } catch (err) { next(err); }
}

async function forgotPassword(req, res, next) {
  try {
    const error = validateForgotPassword(req.body);
    if (error) return res.status(400).json({ success: false, message: error });
    await authService.requestPasswordReset(req.body.email);
    // Always 200 — do not reveal whether the email exists.
    res.json({ success: true, message: 'If an account exists, a reset email has been sent' });
  } catch (err) { next(err); }
}

async function resetPassword(req, res, next) {
  try {
    const error = validateResetPassword(req.body);
    if (error) return res.status(400).json({ success: false, message: error });
    await authService.resetPassword(req.body.token, req.body.newPassword);
    res.json({ success: true, message: 'Password has been reset' });
  } catch (err) { next(err); }
}

async function provision(req, res, next) {
  try {
    const error = validateProvision(req.body);
    if (error) return res.status(400).json({ success: false, message: error });
    const result = await authService.provisionUser(req.user, req.body);
    res.status(201).json({ success: true, ...result });
  } catch (err) { next(err); }
}

async function getUser(req, res, next) {
  try {
    const user = await authService.getUser(req.user, req.params.id);
    res.json({ success: true, user });
  } catch (err) { next(err); }
}

async function setStatus(req, res, next) {
  try {
    const user = await authService.setStatus(req.user, req.params.id, req.body.status);
    res.json({ success: true, user });
  } catch (err) { next(err); }
}

async function setRole(req, res, next) {
  try {
    const error = validateRole(req.body);
    if (error) return res.status(400).json({ success: false, message: error });
    const user = await authService.setRole(req.user, req.params.id, req.body.role);
    res.json({ success: true, user });
  } catch (err) { next(err); }
}

async function listOrgUsersByRoles(req, res, next) {
  try {
    const roles = String(req.query.roles || '').split(',').map((r) => r.trim()).filter(Boolean);
    const data = await authService.listOrgUsersByRoles(req.query.organizationId, roles);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function getAccountState(req, res, next) {
  try {
    const data = await authService.getAccountState(req.params.id);
    if (!data) return res.status(404).json({ success: false, code: 'ACCOUNT_NOT_FOUND', message: 'Account not found' });
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function listIndustries(req, res, next) {
  try {
    const data = await authService.listIndustries();
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function registerTenant(req, res, next) {
  try {
    const error = validateRegisterTenant(req.body);
    if (error) return res.status(400).json({ success: false, message: error, error: { message: error } });
    const result = await authService.registerTenant(req.body);
    res.status(201).json({ success: true, ...result, data: result });
  } catch (err) { next(err); }
}

async function getTenantDetails(req, res, next) {
  try {
    const tenant = await authService.getTenantDetails(req.params.id);
    if (!tenant) return res.status(404).json({ success: false, code: 'TENANT_NOT_FOUND', message: 'Tenant not found' });
    res.json({ success: true, tenant, data: tenant });
  } catch (err) { next(err); }
}

async function emailHealth(req, res, next) {
  try {
    res.json({
      success: true,
      service: 'auth-service',
      email: {
        configured: Boolean(process.env.SMTP_HOST || process.env.EMAIL_HOST),
        status: 'UP'
      }
    });
  } catch (err) { next(err); }
}

async function syncIndustry(req, res, next) {
  try {
    const result = await authService.syncIndustry(req.body);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

async function provisionAgent(req, res, next) {
  try {
    const result = await authService.provisionAgentAccount(req.body);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
}

async function listEligibleEmployees(req, res, next) {
  try {
    const organizationId = req.query.organizationId || req.headers['x-organization-id'] || req.headers['x-tenant-id'] || (req.user && req.user.organizationId);
    const data = await authService.listEligibleEmployees(organizationId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function getEmployeeForAgentRegistration(req, res, next) {
  try {
    const organizationId = req.query.organizationId || req.headers['x-organization-id'] || req.headers['x-tenant-id'] || (req.user && req.user.organizationId);
    const data = await authService.getEmployeeForAgentRegistration(organizationId, req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function promoteEmployeeToAgent(req, res, next) {
  try {
    const organizationId = req.body.organizationId || req.headers['x-organization-id'] || req.headers['x-tenant-id'] || (req.user && req.user.organizationId);
    const result = await authService.promoteEmployeeToAgent({
      userId: req.body.userId,
      organizationId,
    });
    res.status(200).json({ success: true, data: result });
  } catch (err) { next(err); }
}

async function setupPassword(req, res, next) {
  try {
    const error = validateSetupPassword(req.body);
    if (error) return res.status(400).json({ success: false, message: error });
    const result = await authService.setupPassword(req.user.userId, req.body);
    res.json({ success: true, message: 'Password set successfully', ...result });
  } catch (err) { next(err); }
}

async function listAllTenants(req, res, next) {
  try {
    const result = await authService.listAllTenants(req.query);
    res.json({ success: true, ...result, data: result.tenants });
  } catch (err) { next(err); }
}

async function updateTenantStatus(req, res, next) {
  try {
    const { status } = req.body;
    const result = await authService.updateTenantStatus(req.params.id, status);
    res.json({ success: true, ...result, data: result });
  } catch (err) { next(err); }
}

async function listServiceManagers(req, res, next) {
  try {
    const organizationId = req.query.organizationId || req.headers['x-organization-id'] || req.headers['x-tenant-id'] || (req.user && req.user.organizationId);
    const data = await authService.listServiceManagers(organizationId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function promoteEmployeeToServiceManager(req, res, next) {
  try {
    const organizationId = req.body.organizationId || req.headers['x-organization-id'] || req.headers['x-tenant-id'] || (req.user && req.user.organizationId);
    const result = await authService.promoteEmployeeToServiceManager({
      userId: req.body.userId,
      organizationId,
    });
    res.status(200).json({ success: true, data: result });
  } catch (err) { next(err); }
}

async function provisionServiceManager(req, res, next) {
  try {
    const organizationId = req.body.organizationId || req.headers['x-organization-id'] || req.headers['x-tenant-id'] || (req.user && req.user.organizationId);
    const result = await authService.provisionAgentAccount({
      ...req.body,
      role: 'service_manager',
      organizationId,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
}

async function removeServiceManagerAssignment(req, res, next) {
  try {
    const organizationId = req.body.organizationId || req.headers['x-organization-id'] || req.headers['x-tenant-id'] || (req.user && req.user.organizationId);
    const result = await authService.removeServiceManagerAssignment({
      userId: req.params.id || req.body.userId,
      organizationId,
    });
    res.status(200).json({ success: true, data: result });
  } catch (err) { next(err); }
}

module.exports = {
  register, login, me, logout,
  changePassword, forgotPassword, resetPassword,
  provision, getUser, setStatus, setRole,
  listOrgUsersByRoles, getAccountState, emailHealth,
  listIndustries, registerTenant, getTenantDetails,
  listAllTenants, updateTenantStatus,
  syncIndustry,
  provisionAgent, setupPassword,
  listEligibleEmployees, getEmployeeForAgentRegistration,
  promoteEmployeeToAgent,
  listServiceManagers, promoteEmployeeToServiceManager,
  provisionServiceManager, removeServiceManagerAssignment,
};



