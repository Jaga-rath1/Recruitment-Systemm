'use strict';
const service = require('./employees.service');
const { validateCreate, validateUpdate, validateSelfUpdate, validateLoginRole } = require('./employees.validation');
const triggers = require('../../notifications/triggers');
const authClient = require('../../clients/authClient');

// Employee status -> what the linked login should become (statuses not listed leave it untouched).
const LOGIN_STATUS_FOR = { active: 'active', inactive: 'inactive', terminated: 'inactive' };

/**
 * Creates the login for an employee and links it. Resolves a summary that is
 * safe to return to the admin; never throws so the employee record survives a
 * failed provisioning attempt.
 */
async function provisionLoginFor(req, employee, role) {
  const email = employee.workEmail || employee.email;
  try {
    const result = await authClient.provision(req.headers.authorization, {
      email,
      role: role || 'employee',
      firstName: employee.firstName,
      lastName: employee.lastName,
    });
    await employee.update({
      authUserId: result.user.id,
      status: employee.status === 'draft' ? 'onboarding' : employee.status,
    });
    const login = { created: true, email, role: result.user.role, emailDelivered: !!result.emailDelivered };
    if (result.tempPassword) login.tempPassword = result.tempPassword;
    await triggers.loginProvisioned(req.user.organizationId, employee);
    return login;
  } catch (err) {
    return { created: false, email, error: err.message, status: err.status || 500 };
  }
}

const create = async (req, res, next) => {
  try {
    const err = validateCreate(req.body);
    if (err) return res.status(400).json({ success: false, message: err });

    const employee = await service.create(req.user.organizationId, req.body);

    let login = null;
    if (req.body.createLogin) login = await provisionLoginFor(req, employee, req.body.role);

    await triggers.employeeCreated(req.user.organizationId, employee, req.user.userId);
    res.status(201).json({ success: true, data: employee, login });
  } catch (e) { next(e); }
};

const list = async (req, res, next) => {
  try {
    const result = await service.list(req.user, req.query);
    res.json({ success: true, ...result });
  } catch (e) { next(e); }
};

const getScope = async (req, res, next) => {
  try {
    res.json({ success: true, data: await service.resolveScope(req.user) });
  } catch (e) { next(e); }
};

const getMe = async (req, res, next) => {
  try {
    const emp = await service.getByAuthUserId(req.user.userId, req.user.organizationId);
    res.json({ success: true, data: emp });
  } catch (e) { next(e); }
};

const updateMe = async (req, res, next) => {
  try {
    const err = validateSelfUpdate(req.body);
    if (err) return res.status(400).json({ success: false, message: err });
    const emp = await service.updateOwnProfile(req.user, req.body);
    res.json({ success: true, data: emp });
  } catch (e) { next(e); }
};

const getById = async (req, res, next) => {
  try {
    const emp = await service.getById(req.user, req.params.id);
    res.json({ success: true, data: emp });
  } catch (e) { next(e); }
};

const update = async (req, res, next) => {
  try {
    const err = validateUpdate(req.body);
    if (err) return res.status(400).json({ success: false, message: err });
    const emp = await service.update(req.user.organizationId, req.params.id, req.body);
    res.json({ success: true, data: emp });
  } catch (e) { next(e); }
};

const updateStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ success: false, message: 'status is required' });
    const emp = await service.updateStatus(req.user.organizationId, req.params.id, status);

    // Keep the login in step with the employee: a deactivated person must not be able to sign in.
    let loginSynced = null;
    if (emp.authUserId && LOGIN_STATUS_FOR[status]) {
      try {
        await authClient.setUserStatus(req.headers.authorization, emp.authUserId, LOGIN_STATUS_FOR[status]);
        loginSynced = true;
      } catch (syncErr) {
        loginSynced = false;
        console.warn('[employee-service] login status sync failed:', syncErr.message);
      }
    }

    await triggers.employeeStatusChanged(req.user.organizationId, emp, req.user.userId);
    res.json({ success: true, data: emp, loginSynced });
  } catch (e) { next(e); }
};

const remove = async (req, res, next) => {
  try {
    const emp = await service.remove(req.user.organizationId, req.params.id);
    if (emp.authUserId) {
      try { await authClient.setUserStatus(req.headers.authorization, emp.authUserId, 'inactive'); }
      catch (syncErr) { console.warn('[employee-service] login deactivation failed:', syncErr.message); }
    }
    res.json({ success: true, data: { id: emp.id } });
  } catch (e) { next(e); }
};

const provision = async (req, res, next) => {
  try {
    const roleErr = validateLoginRole(req.body.role);
    if (roleErr) return res.status(400).json({ success: false, message: roleErr });

    const emp = await service.getForProvisioning(req.user.organizationId, req.params.id);
    const login = await provisionLoginFor(req, emp, req.body.role);
    if (!login.created) {
      return res.status(login.status >= 400 && login.status < 500 ? login.status : 502)
        .json({ success: false, message: `Failed to create login: ${login.error}` });
    }
    res.json({ success: true, data: { id: emp.id, authUserId: emp.authUserId, status: emp.status }, login });
  } catch (e) { next(e); }
};

module.exports = { create, list, getScope, getMe, updateMe, getById, update, updateStatus, remove, provision };
