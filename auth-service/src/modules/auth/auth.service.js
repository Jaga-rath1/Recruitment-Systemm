'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { sequelize, User, Role, Industry, Tenant } = require('../../models/index');
const PasswordResetToken = require('./passwordResetTokens.model');
const emailService = require('../../email');
const { JWT_SECRET, JWT_EXPIRES_IN, ALLOW_BOOTSTRAP_REGISTRATION } = require('../../config/env');

// Roles that live inside an organization, and which of them each role may hand out.
const ORG_ROLES = ['org_admin', 'service_manager', 'hr', 'manager', 'employee', 'agent'];
const GRANTABLE_ROLES = {
  super_admin: ['super_admin', ...ORG_ROLES],
  org_admin: ORG_ROLES,
  service_manager: ['employee', 'agent'],
  hr: ['manager', 'employee', 'agent'],
};


const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function makeError(message, status) {
  return Object.assign(new Error(message), { status, statusCode: status });
}

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/** Generate a unique sequential employee ID. */
async function generateEmployeeId() {
  try {
    const [seqRes] = await sequelize.query("SELECT nextval('employee_id_seq') AS seq;");
    const seq = seqRes && seqRes[0] ? seqRes[0].seq : Math.floor(Math.random() * 900) + 100;
    return `EMP${String(seq).padStart(3, '0')}`;
  } catch {
    return `EMP${Math.floor(Math.random() * 900) + 100}`;
  }
}

/** Generate a readable temporary password (no ambiguous chars). */
function generateTempPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(12);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += alphabet[bytes[i] % alphabet.length];
  return `${out}#9`; // ensure symbol + digit for policy
}

function publicUser(user, roleName) {
  return {
    id: user.id,
    employeeId: user.employeeId || null,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email,
    phone: user.phone || null,
    role: roleName ?? (user.role ? user.role.name : null),
    organizationId: user.organizationId || null,
    industryId: user.tenant ? user.tenant.industryId : null,
    industryName: user.tenant && user.tenant.industry ? user.tenant.industry.name : null,
    status: user.status,
    mustChangePassword: !!user.mustChangePassword,
  };
}

function signToken(user, roleName) {
  const industryId = user.tenant ? user.tenant.industryId : null;
  const payload = {
    userId: user.id,
    employeeId: user.employeeId || null,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email,
    role: roleName,
    organizationId: user.organizationId || null,
    tenantId: user.organizationId || null,
    industryId: industryId || null,
  };
  if (user.mustChangePassword) payload.mustChangePassword = true;
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function findUserWithRole(where) {
  return User.findOne({
    where,
    include: [
      { model: Role, as: 'role', attributes: ['name'] },
      {
        model: Tenant,
        as: 'tenant',
        required: false,
        include: [{ model: Industry, as: 'industry', attributes: ['id', 'name'] }],
      },
    ],
  });
}

/**
 * There is no self-registration: every account is provisioned by an
 * administrator. The one exception is bootstrapping the platform owner on an
 * empty system, and only when the operator has switched that on explicitly
 * (ALLOW_BOOTSTRAP_REGISTRATION=true). scripts/create-super-admin.js is the
 * usual way to create that first account.
 */
async function register({ email, password, firstName, lastName }) {
  const userCount = ALLOW_BOOTSTRAP_REGISTRATION ? await User.count() : 1;
  if (userCount > 0) {
    throw makeError('Self-registration is disabled. Accounts are created by an administrator.', 403);
  }

  const role = await Role.findOne({ where: { name: 'super_admin' } });
  if (!role) throw makeError("Role 'super_admin' not found", 500);

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    email, passwordHash,
    firstName: firstName || null,
    lastName: lastName || null,
    roleId: role.id,
    status: 'active',
  });
  return publicUser(user, role.name);
}

async function login({ email, password }) {
  if (!email || typeof email !== 'string') throw makeError('Invalid credentials', 401);
  if (!password || typeof password !== 'string') throw makeError('Invalid credentials', 401);

  const cleanEmail = email.trim().toLowerCase();
  const user = await User.findOne({
    where: {
      email: {
        [Op.iLike]: cleanEmail,
      },
    },
    include: [
      { model: Role, as: 'role', attributes: ['name'] },
      {
        model: Tenant,
        as: 'tenant',
        required: false,
        include: [{ model: Industry, as: 'industry', attributes: ['id', 'name'] }],
      },
    ],
  });
  if (!user) throw makeError('Invalid credentials', 401);

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw makeError('Invalid credentials', 401);
  if (user.status !== 'active') throw makeError('Account is not active', 401);

  const roleName = user.role ? user.role.name : null;
  if (user.tenant && user.tenant.status === 'inactive' && roleName !== 'super_admin') {
    throw makeError('Organization account is inactive. Please contact system administrator.', 403);
  }

  return { token: signToken(user, roleName), user: publicUser(user, roleName) };
}

async function getMe(userId) {
  const user = await findUserWithRole({ id: userId });
  if (!user) throw makeError('User not found', 404);
  if (user.status !== 'active') throw makeError('Account is not active', 401);
  return publicUser(user);
}

/* ----------------------------------------------------------- change password */
async function changePassword(userId, currentPassword, newPassword) {
  const user = await findUserWithRole({ id: userId });
  if (!user) throw makeError('User not found', 404);
  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw makeError('Current password is incorrect', 400);
  user.passwordHash = await bcrypt.hash(newPassword, 10);
  user.mustChangePassword = false;
  await user.save();
  // A fresh token so a session that was limited to "change your password" becomes a full one.
  const roleName = user.role ? user.role.name : null;
  return { token: signToken(user, roleName), user: publicUser(user, roleName) };
}

/* ------------------------------------------------------------ forgot/reset */
// Always resolves the same way so callers cannot learn which emails exist.
async function requestPasswordReset(email) {
  const user = await findUserWithRole({ email });
  if (user && user.status === 'active') {
    const raw = crypto.randomBytes(32).toString('hex');
    await PasswordResetToken.create({
      userId: user.id,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    });
    try {
      await emailService.sendPasswordReset({ to: user.email, name: user.firstName, token: raw });
    } catch (err) {
      console.error('[auth-service] password reset email failed:', err.message);
    }
  }
  return { success: true };
}

async function resetPassword(rawToken, newPassword) {
  const record = await PasswordResetToken.findOne({
    where: { tokenHash: hashToken(rawToken), usedAt: null, expiresAt: { [Op.gt]: new Date() } },
    order: [['created_at', 'DESC']],
  });
  if (!record) throw makeError('Invalid or expired reset token', 400);

  const user = await User.findByPk(record.userId);
  if (!user) throw makeError('User not found', 404);
  if (user.status !== 'active') throw makeError('Account is not active', 400);

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  user.mustChangePassword = false;
  await user.save();

  // One reset consumes every outstanding link for the account.
  await PasswordResetToken.update(
    { usedAt: new Date() },
    { where: { userId: user.id, usedAt: null } }
  );
  return { success: true };
}

/* ------------------------------------------------------------- provisioning */
/**
 * Create a login with a temporary password and email the credentials.
 * `actor` is the authenticated caller; the organization of an org-level actor
 * always comes from their token, never from the request body.
 */
async function provisionUser(actor, { email, firstName, lastName, role: roleName, organizationId }) {
  const grantable = GRANTABLE_ROLES[actor.role] || [];
  if (!grantable.includes(roleName)) {
    throw makeError(`Forbidden: your role cannot create a '${roleName}' account`, 403);
  }

  let targetOrgId = null;
  if (actor.role === 'super_admin') {
    if (roleName !== 'super_admin') {
      if (!organizationId) throw makeError('organizationId is required for non-platform users', 400);
      targetOrgId = organizationId;
    }
  } else {
    if (!actor.organizationId) throw makeError('Forbidden: no organization context', 403);
    if (organizationId && organizationId !== actor.organizationId) {
      throw makeError('Forbidden: cannot provision users for another organization', 403);
    }
    targetOrgId = actor.organizationId;
  }

  const existing = await User.findOne({ where: { email } });
  if (existing) throw makeError('Email already registered', 409);

  const role = await Role.findOne({ where: { name: roleName } });
  if (!role) throw makeError(`Role '${roleName}' not found`, 400);

  const tempPassword = generateTempPassword();
  const empId = await generateEmployeeId();
  const user = await User.create({
    employeeId: empId,
    email,
    passwordHash: await bcrypt.hash(tempPassword, 10),
    firstName: firstName || null,
    lastName: lastName || null,
    roleId: role.id,
    organizationId: targetOrgId,
    status: 'active',
    mustChangePassword: true,
  });

  const roleLabel = {
    super_admin: 'Platform admin',
    org_admin: 'Organization admin',
    service_manager: 'Service Manager',
    hr: 'HR',
    manager: 'Manager',
    employee: 'Employee',
    agent: 'Support agent',
  }[roleName] || roleName;
  let emailDelivered = false;
  try {
    const result = await emailService.sendAccountCreated({ to: email, name: firstName, tempPassword, roleLabel });
    emailDelivered = !!result.sent;
  } catch (err) {
    console.error('[auth-service] account email failed:', err.message);
  }

  const result = { user: publicUser(user, role.name), emailDelivered };
  // When the email could not be delivered the creating admin must hand the
  // credentials over personally, so this is the only time the password is returned.
  if (!emailDelivered) result.tempPassword = tempPassword;
  return result;
}

/** Loads a user the actor is allowed to administer, or throws 403/404. */
async function loadManagedUser(actor, targetUserId) {
  const user = await findUserWithRole({ id: targetUserId });
  if (!user) throw makeError('User not found', 404);
  if (actor.role === 'super_admin') return user;

  const targetRole = user.role ? user.role.name : null;
  const sameOrg = actor.organizationId && user.organizationId === actor.organizationId;
  if (!sameOrg) throw makeError('User not found', 404);
  if (!(GRANTABLE_ROLES[actor.role] || []).includes(targetRole)) {
    throw makeError('Forbidden: you cannot manage this account', 403);
  }
  return user;
}

async function getUser(actor, targetUserId) {
  return publicUser(await loadManagedUser(actor, targetUserId));
}

async function setStatus(actor, targetUserId, status) {
  if (!['active', 'inactive', 'suspended'].includes(status)) throw makeError('Invalid status', 400);
  if (actor.userId === targetUserId) throw makeError('You cannot change the status of your own account', 400);
  const user = await loadManagedUser(actor, targetUserId);
  user.status = status;
  await user.save();
  return publicUser(user);
}

async function setRole(actor, targetUserId, roleName) {
  if (!['super_admin', 'org_admin'].includes(actor.role)) throw makeError('Forbidden', 403);
  if (actor.userId === targetUserId) throw makeError('You cannot change your own role', 400);
  if (!(GRANTABLE_ROLES[actor.role] || []).includes(roleName)) {
    throw makeError(`Forbidden: your role cannot assign '${roleName}'`, 403);
  }
  const user = await loadManagedUser(actor, targetUserId);
  if (roleName !== 'super_admin' && !user.organizationId) {
    throw makeError('This account has no organization and cannot hold an organization role', 400);
  }
  const role = await Role.findOne({ where: { name: roleName } });
  if (!role) throw makeError(`Role '${roleName}' not found`, 400);
  user.roleId = role.id;
  await user.save();
  return publicUser(user, role.name);
}

/** Service-to-service lookup: what the gateway needs to decide whether a session is still valid. */
async function getAccountState(userId) {
  if (!UUID_RE.test(String(userId))) return null;
  const user = await findUserWithRole({ id: userId });
  if (!user) return null;
  return { status: user.status, role: user.role ? user.role.name : null, organizationId: user.organizationId || null };
}

/** Service-to-service lookup: active users of an organization holding any of the given roles. */
async function listOrgUsersByRoles(organizationId, roleNames) {
  if (!organizationId || !roleNames.length) return [];
  const users = await User.findAll({
    where: { organizationId, status: 'active' },
    include: [{ model: Role, as: 'role', attributes: ['name'], where: { name: { [Op.in]: roleNames } } }],
    attributes: ['id', 'employeeId', 'email', 'firstName', 'lastName'],
  });
  return users.map((u) => ({
    id: u.id,
    userId: u.id,
    employeeId: u.employeeId,
    name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    role: u.role.name,
    organizationId,
    status: 'active',
  }));
}

/**
 * Retrieve eligible employees for Help Desk agent registration.
 * Scoped strictly to the specified organizationId.
 * Only returns active users whose assigned role is the authoritative 'employee' role.
 * Explicitly excludes super_admin, org_admin, manager, hr, and agent roles.
 */
async function listEligibleEmployees(organizationId) {
  if (!organizationId || typeof organizationId !== 'string' || !organizationId.trim()) {
    throw makeError('Valid organizationId is required', 400);
  }
  const cleanOrgId = organizationId.trim();

  // Authoritative role lookup
  const employeeRole = await Role.findOne({ where: { name: 'employee' } });
  if (!employeeRole) {
    throw makeError("Authoritative 'employee' role not configured in system", 500);
  }

  const users = await User.findAll({
    where: {
      organizationId: cleanOrgId,
      roleId: employeeRole.id,
      status: 'active',
    },
    order: [['employeeId', 'ASC'], ['createdAt', 'ASC']],
    attributes: ['id', 'employeeId', 'email', 'firstName', 'lastName', 'status', 'organizationId', 'roleId', 'createdAt'],
  });

  return users.map((u) => ({
    id: u.id,
    userId: u.id,
    employeeId: u.employeeId || `EMP${String(u.id).slice(0, 4).toUpperCase()}`,
    name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    role: 'employee',
    roleId: u.roleId,
    organizationId: u.organizationId,
    status: u.status,
    isActive: u.status === 'active',
  }));
}

/**
 * Validate and retrieve a single employee for agent creation.
 * Validates active status, authoritative employee role, and strict tenant membership.
 */
async function getEmployeeForAgentRegistration(organizationId, userId) {
  if (!organizationId || !userId) {
    throw makeError('organizationId and userId are required', 400);
  }
  const cleanOrgId = organizationId.trim();
  const cleanUserId = userId.trim();

  const user = await User.findByPk(cleanUserId, {
    include: [{ model: Role, as: 'role', attributes: ['id', 'name'] }],
  });

  if (!user) {
    throw makeError(`Selected employee '${cleanUserId}' not found in Auth Service`, 404);
  }

  if (user.organizationId !== cleanOrgId) {
    throw makeError(`Cross-tenant agent creation prohibited: employee does not belong to organization '${cleanOrgId}'`, 403);
  }

  if (user.status !== 'active') {
    throw makeError(`Selected employee is not active (current status: ${user.status})`, 400);
  }

  const employeeRole = await Role.findOne({ where: { name: 'employee' } });
  if (!employeeRole || user.roleId !== employeeRole.id) {
    const actualRoleName = user.role ? user.role.name : 'unknown';
    throw makeError(`Selected user does not have the Employee role (current role: '${actualRoleName}')`, 400);
  }

  return {
    id: user.id,
    userId: user.id,
    employeeId: user.employeeId || `EMP${String(user.id).slice(0, 4).toUpperCase()}`,
    name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: 'employee',
    roleId: user.roleId,
    organizationId: user.organizationId,
    status: user.status,
    isActive: user.status === 'active',
  };
}

/**
 * Promotes an existing employee to the agent role.
 * Validates tenant membership, active status, and current employee role.
 * Reuses existing 'agent' role from database.
 * CRITICAL: Preserves existing employee identity, email, passwordHash, and credentials unchanged.
 */
async function promoteEmployeeToAgent({ userId, organizationId }) {
  if (!userId || !organizationId) {
    throw makeError('userId and organizationId are required', 400);
  }
  const cleanOrgId = organizationId.trim();
  const cleanUserId = userId.trim();

  const user = await User.findByPk(cleanUserId, {
    include: [{ model: Role, as: 'role', attributes: ['id', 'name'] }],
  });

  if (!user) {
    throw makeError(`User '${cleanUserId}' not found in Auth Service`, 404);
  }

  if (user.organizationId !== cleanOrgId) {
    throw makeError('Cross-tenant agent creation prohibited: user does not belong to organization', 403);
  }

  if (user.status !== 'active') {
    throw makeError(`Cannot register inactive employee as an agent (status: ${user.status})`, 400);
  }

  const employeeRole = await Role.findOne({ where: { name: 'employee' } });
  const agentRole = await Role.findOne({
    where: {
      name: {
        [Op.in]: ['agent', 'support_agent'],
      },
    },
  });

  if (!agentRole) {
    throw makeError("Role 'agent' not configured in database", 500);
  }

  // If user already has the agent role:
  if (user.roleId === agentRole.id) {
    return {
      success: true,
      user: publicUser(user, agentRole.name),
      alreadyAgent: true,
    };
  }

  // Ensure user has authoritative employee role
  if (employeeRole && user.roleId !== employeeRole.id) {
    const actualRoleName = user.role ? user.role.name : 'unknown';
    throw makeError(`Cannot promote user to agent: user role is '${actualRoleName}', expected 'employee'`, 400);
  }

  // Update roleId to agentRole.id. Keep passwordHash, mustChangePassword, and all credentials intact!
  user.roleId = agentRole.id;
  await user.save();

  return {
    success: true,
    user: publicUser(user, agentRole.name),
    alreadyAgent: false,
  };
}

/**
 * List all Service Managers within an organization.
 */
async function listServiceManagers(organizationId) {
  if (!organizationId) throw makeError('Valid organizationId is required', 400);
  const cleanOrgId = organizationId.trim();

  const role = await Role.findOne({ where: { name: 'service_manager' } });
  if (!role) return [];

  const users = await User.findAll({
    where: {
      organizationId: cleanOrgId,
      roleId: role.id,
    },
    order: [['createdAt', 'DESC']],
    attributes: ['id', 'employeeId', 'email', 'firstName', 'lastName', 'phone', 'status', 'mustChangePassword', 'createdAt', 'updatedAt'],
  });

  return users.map((u) => ({
    id: u.id,
    userId: u.id,
    employeeId: u.employeeId,
    name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    phone: u.phone,
    role: 'service_manager',
    roleTitle: 'Service Manager',
    organizationId: cleanOrgId,
    status: u.status,
    mustChangePassword: Boolean(u.mustChangePassword),
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  }));
}

/**
 * Promotes an existing employee to the service_manager role.
 * Preserves existing employee identity, email, passwordHash, and credentials unchanged.
 */
async function promoteEmployeeToServiceManager({ userId, organizationId }) {
  if (!userId || !organizationId) {
    throw makeError('userId and organizationId are required', 400);
  }
  const cleanOrgId = organizationId.trim();
  const cleanUserId = userId.trim();

  const user = await User.findByPk(cleanUserId, {
    include: [{ model: Role, as: 'role', attributes: ['id', 'name'] }],
  });

  if (!user) {
    throw makeError(`User '${cleanUserId}' not found in Auth Service`, 404);
  }

  if (user.organizationId !== cleanOrgId) {
    throw makeError('Cross-tenant Service Manager creation prohibited: user does not belong to organization', 403);
  }

  if (user.status !== 'active') {
    throw makeError(`Cannot appoint inactive employee as Service Manager (status: ${user.status})`, 400);
  }

  const role = await Role.findOne({ where: { name: 'service_manager' } });
  if (!role) {
    throw makeError("Role 'service_manager' not configured in database", 500);
  }

  if (user.roleId === role.id) {
    return {
      success: true,
      user: publicUser(user, role.name),
      alreadyServiceManager: true,
    };
  }

  const employeeRole = await Role.findOne({ where: { name: 'employee' } });
  if (employeeRole && user.roleId !== employeeRole.id) {
    const actualRoleName = user.role ? user.role.name : 'unknown';
    throw makeError(`Cannot promote user to Service Manager: user role is '${actualRoleName}', expected 'employee'`, 400);
  }

  user.roleId = role.id;
  await user.save();

  return {
    success: true,
    user: publicUser(user, role.name),
    alreadyServiceManager: false,
  };
}

/**
 * Removes Service Manager assignment by demoting user to employee role.
 * Does not delete the employee record, authentication account, or historical ticket records.
 */
async function removeServiceManagerAssignment({ userId, organizationId }) {
  if (!userId || !organizationId) {
    throw makeError('userId and organizationId are required', 400);
  }
  const cleanOrgId = organizationId.trim();
  const cleanUserId = userId.trim();

  const user = await User.findByPk(cleanUserId, {
    include: [{ model: Role, as: 'role', attributes: ['id', 'name'] }],
  });

  if (!user || user.organizationId !== cleanOrgId) {
    throw makeError('Service Manager not found in this organization', 404);
  }

  const smRole = await Role.findOne({ where: { name: 'service_manager' } });
  if (smRole && user.roleId !== smRole.id) {
    throw makeError('User does not have Service Manager role', 400);
  }

  const empRole = await Role.findOne({ where: { name: 'employee' } });
  if (empRole) {
    user.roleId = empRole.id;
    await user.save();
  }

  return {
    success: true,
    message: 'Service Manager role assignment removed successfully. Account preserved as employee.',
    user: publicUser(user, empRole ? empRole.name : 'employee'),
  };
}

/** Predefined platform industry catalog for company registration */
async function listIndustries(includeInactive = false) {
  const where = includeInactive ? {} : { isActive: true };
  const industries = await Industry.findAll({
    where,
    order: [['id', 'ASC']],
    attributes: ['id', 'name', 'description', 'isActive'],
  });
  return industries.map((ind) => ({
    id: ind.id,
    name: ind.name,
    description: ind.description,
    isActive: ind.isActive,
  }));
}

/** Synchronize industry from Help Desk / Platform Admin */
async function syncIndustry({ action, id, name, description, isActive }) {
  if (!id) throw makeError('Industry id is required', 400);
  const cleanId = String(id).trim();
  if (action === 'delete') {
    await Industry.destroy({ where: { id: cleanId } });
    return { id: cleanId, deleted: true };
  }
  const existing = await Industry.findByPk(cleanId);
  if (existing) {
    await existing.update({
      name: name !== undefined ? String(name).trim() : existing.name,
      description: description !== undefined ? description : existing.description,
      isActive: isActive !== undefined ? Boolean(isActive) : existing.isActive,
    });
    return existing;
  }
  return await Industry.create({
    id: cleanId,
    name: (name || cleanId).trim(),
    description: description || null,
    isActive: isActive !== undefined ? Boolean(isActive) : true,
  });
}

/**
 * Tenant / Company registration: creates tenant with selected industry and provisions initial org_admin.
 */
async function registerTenant({
  companyName,
  industryId,
  email,
  password,
  fullName,
  name,
  adminName,
  firstName,
  lastName,
  phone,
  phoneNumber,
}) {
  if (!companyName || typeof companyName !== 'string' || !companyName.trim()) {
    throw makeError('Company name is required', 400);
  }
  if (!industryId || typeof industryId !== 'string' || !industryId.trim()) {
    throw makeError('Industry selection is required', 400);
  }
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) {
    throw makeError('Valid email is required', 400);
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    throw makeError('Password must be at least 8 characters', 400);
  }

  // Parse names
  let first = (firstName || '').trim();
  let last = (lastName || '').trim();
  const rawFullName = (fullName || name || adminName || '').trim();
  if (rawFullName && !first && !last) {
    const parts = rawFullName.split(/\s+/);
    first = parts[0] || '';
    last = parts.slice(1).join(' ') || '';
  }
  if (!first && !last) {
    first = 'Admin';
  }

  const rawPhone = (phone || phoneNumber || '').trim();

  let industry = await Industry.findByPk(industryId.trim());
  if (!industry) {
    industry = await Industry.findOne({
      where: sequelize.where(
        sequelize.fn('LOWER', sequelize.col('name')),
        industryId.trim().toLowerCase()
      ),
    });
  }
  if (!industry || industry.isActive === false) {
    throw makeError(`Invalid industry identifier '${industryId}'`, 400);
  }

  const existingUser = await User.findOne({ where: { email: cleanEmail } });
  if (existingUser) {
    throw makeError('Email already registered', 409);
  }

  const role = await Role.findOne({ where: { name: 'org_admin' } });
  if (!role) throw makeError("Role 'org_admin' not found in database", 500);

  const passwordHash = await bcrypt.hash(password, 10);
  const tenantId = crypto.randomUUID();
  const userId = crypto.randomUUID();

  // Atomically create tenant and user in a database transaction
  const result = await sequelize.transaction(async (t) => {
    const tenant = await Tenant.create(
      {
        id: tenantId,
        name: companyName.trim(),
        industryId: industry.id,
        status: 'active',
      },
      { transaction: t }
    );

    const user = await User.create(
      {
        id: userId,
        email: cleanEmail,
        passwordHash,
        firstName: first || null,
        lastName: last || null,
        phone: rawPhone || null,
        roleId: role.id,
        organizationId: tenant.id,
        status: 'active',
        mustChangePassword: false,
      },
      { transaction: t }
    );

    return { tenant, user };
  });

  result.user.role = role;
  result.user.tenant = result.tenant;
  result.tenant.industry = industry;

  return {
    token: signToken(result.user, role.name),
    user: publicUser(result.user, role.name),
    tenant: {
      id: result.tenant.id,
      name: result.tenant.name,
      industryId: industry.id,
      industryName: industry.name,
      status: result.tenant.status,
    },
    organization: {
      id: result.tenant.id,
      name: result.tenant.name,
      industryId: industry.id,
      industryName: industry.name,
      status: result.tenant.status,
    },
  };
}

/** Internal service-to-service lookup for tenant metadata, status & verified industry */
async function getTenantDetails(tenantId) {
  if (!tenantId) return null;
  const tenant = await Tenant.findByPk(tenantId, {
    include: [{ model: Industry, as: 'industry', attributes: ['id', 'name'] }],
  });
  if (!tenant) return null;

  // Find primary admin user
  const orgAdminRole = await Role.findOne({ where: { name: 'org_admin' } });
  let adminUser = null;
  if (orgAdminRole) {
    adminUser = await User.findOne({
      where: { organizationId: tenant.id, roleId: orgAdminRole.id },
      order: [['createdAt', 'ASC']],
      attributes: ['id', 'email', 'firstName', 'lastName', 'phone', 'status', 'employeeId', 'createdAt'],
    });
  }

  return {
    id: tenant.id,
    name: tenant.name,
    industryId: tenant.industryId,
    industryName: tenant.industry ? tenant.industry.name : null,
    status: tenant.status || 'active',
    createdAt: tenant.createdAt,
    updatedAt: tenant.updatedAt,
    admin: adminUser
      ? {
          id: adminUser.id,
          email: adminUser.email,
          name: [adminUser.firstName, adminUser.lastName].filter(Boolean).join(' ') || adminUser.email,
          firstName: adminUser.firstName,
          lastName: adminUser.lastName,
          phone: adminUser.phone || null,
          status: adminUser.status,
        }
      : null,
  };
}

/** List tenants with industry and admin for Platform Admin / Helpdesk Service */
async function listAllTenants({ search, industryId, status, page = 1, limit = 50 } = {}) {
  const where = {};
  if (status) {
    where.status = status;
  }
  if (industryId) {
    where.industryId = industryId;
  }
  if (search && typeof search === 'string' && search.trim()) {
    const s = search.trim();
    if (UUID_RE.test(s)) {
      where[Op.or] = [{ id: s }, { name: { [Op.iLike]: `%${s}%` } }];
    } else {
      where.name = { [Op.iLike]: `%${s}%` };
    }
  }

  const offset = Math.max(0, (parseInt(page, 10) - 1) * parseInt(limit, 10));
  const pageLimit = Math.min(100, Math.max(1, parseInt(limit, 10)));

  const { rows, count } = await Tenant.findAndCountAll({
    where,
    include: [{ model: Industry, as: 'industry', attributes: ['id', 'name'] }],
    order: [['createdAt', 'DESC']],
    offset,
    limit: pageLimit,
  });

  const tenantIds = rows.map((r) => r.id);
  const orgAdminRole = await Role.findOne({ where: { name: 'org_admin' } });
  const adminUsersMap = {};
  if (orgAdminRole && tenantIds.length > 0) {
    const admins = await User.findAll({
      where: {
        organizationId: { [Op.in]: tenantIds },
        roleId: orgAdminRole.id,
      },
      attributes: ['id', 'email', 'firstName', 'lastName', 'phone', 'status', 'organizationId'],
    });
    for (const a of admins) {
      if (!adminUsersMap[a.organizationId]) {
        adminUsersMap[a.organizationId] = a;
      }
    }
  }

  const tenants = rows.map((t) => {
    const admin = adminUsersMap[t.id];
    return {
      id: t.id,
      name: t.name,
      industryId: t.industryId,
      industryName: t.industry ? t.industry.name : null,
      status: t.status || 'active',
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      admin: admin
        ? {
            id: admin.id,
            email: admin.email,
            name: [admin.firstName, admin.lastName].filter(Boolean).join(' ') || admin.email,
            phone: admin.phone || null,
            status: admin.status,
          }
        : null,
    };
  });

  return {
    tenants,
    total: count,
    page: parseInt(page, 10),
    limit: pageLimit,
    totalPages: Math.ceil(count / pageLimit),
  };
}

/** Update tenant status (active/inactive) */
async function updateTenantStatus(tenantId, newStatus) {
  if (!['active', 'inactive'].includes(newStatus)) {
    throw makeError("Status must be 'active' or 'inactive'", 400);
  }
  const tenant = await Tenant.findByPk(tenantId);
  if (!tenant) throw makeError('Tenant not found', 404);
  tenant.status = newStatus;
  await tenant.save();
  return { id: tenant.id, name: tenant.name, status: tenant.status };
}

/**
 * Service-to-service / Internal agent account provisioning.
 * Provisions an auth user with role 'agent' and mustChangePassword = true.
 * Idempotent: If user already exists in same org and needs setup, regenerates a fresh temp password.
 */
async function provisionAgentAccount({ email, name, firstName, lastName, role: roleName = 'agent', organizationId, forceResetPassword = false }) {
  if (!email || typeof email !== 'string') throw makeError('Valid email is required', 400);
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) throw makeError('Valid email is required', 400);
  if (!organizationId) throw makeError('organizationId is required', 400);

  const targetRole = (roleName || 'agent').trim().toLowerCase();
  let role = await Role.findOne({ where: { name: targetRole } });
  if (!role && (targetRole === 'agent' || targetRole === 'support_agent')) {
    role = await Role.findOne({ where: { name: { [Op.in]: ['agent', 'support_agent'] } } });
  }
  if (!role) throw makeError(`Role '${targetRole}' not found`, 400);

  const existing = await User.findOne({
    where: { email: cleanEmail },
    include: [{ model: Role, as: 'role', attributes: ['name'] }],
  });

  if (existing) {
    // Check if in same organization
    if (existing.organizationId && existing.organizationId !== organizationId) {
      throw makeError('Email already registered with another organization', 409);
    }

    const isDifferentRole = existing.roleId !== role.id;
    const isPendingSetup = Boolean(existing.mustChangePassword);
    const shouldRegenerate = Boolean(forceResetPassword || isPendingSetup || isDifferentRole);

    if (shouldRegenerate) {
      const tempPassword = generateTempPassword();
      existing.passwordHash = await bcrypt.hash(tempPassword, 10);
      existing.roleId = role.id;
      existing.organizationId = organizationId;
      if (name && !existing.firstName) {
        existing.firstName = name.split(' ')[0] || name;
        existing.lastName = name.split(' ').slice(1).join(' ') || null;
      }
      existing.status = 'active';
      existing.mustChangePassword = true;
      await existing.save();

      return {
        user: publicUser(existing, role.name),
        tempPassword,
        isNew: false,
        reprovisioned: true,
      };
    }

    // If agent already completed onboarding:
    return {
      user: publicUser(existing, existing.role ? existing.role.name : role.name),
      isNew: false,
      onboardingCompleted: true,
    };
  }

  // Parse name into firstName / lastName if not separated
  let fName = firstName || null;
  let lName = lastName || null;
  if (!fName && name) {
    const parts = name.trim().split(/\s+/);
    fName = parts[0] || name;
    lName = parts.slice(1).join(' ') || null;
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  const user = await User.create({
    id: crypto.randomUUID(),
    email: cleanEmail,
    passwordHash,
    firstName: fName,
    lastName: lName,
    roleId: role.id,
    organizationId,
    status: 'active',
    mustChangePassword: true,
  });

  return {
    user: publicUser(user, role.name),
    tempPassword,
    isNew: true,
  };
}

/**
 * First-time password setup:
 * Sets new permanent password for user who has mustChangePassword === true.
 * Validates temporary password, new password length, and confirmation matching.
 * Clears mustChangePassword flag and returns fresh full auth token.
 */
async function setupPassword(userId, payloadOrPassword, maybeConfirm) {
  let temporaryPassword = '';
  let newPassword = '';
  let confirmPassword = undefined;

  if (typeof payloadOrPassword === 'object' && payloadOrPassword !== null) {
    temporaryPassword = payloadOrPassword.temporaryPassword || payloadOrPassword.currentPassword || '';
    newPassword = payloadOrPassword.newPassword || '';
    confirmPassword = payloadOrPassword.confirmPassword;
  } else {
    newPassword = String(payloadOrPassword || '');
    confirmPassword = maybeConfirm;
  }

  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    throw makeError('New password must be at least 8 characters long', 400);
  }

  if (confirmPassword !== undefined && newPassword !== confirmPassword) {
    throw makeError('Passwords do not match. Please ensure both fields are identical.', 400);
  }

  const user = await findUserWithRole({ id: userId });
  if (!user) throw makeError('User not found', 404);
  if (user.status !== 'active') throw makeError('Account is not active', 401);
  if (!user.mustChangePassword) {
    throw makeError('Password setup has already been completed for this account', 400);
  }

  // If temporary password is provided, verify it against the current stored hash
  if (temporaryPassword) {
    const isTempValid = await bcrypt.compare(temporaryPassword, user.passwordHash);
    if (!isTempValid) {
      throw makeError('The temporary password you entered is incorrect. Please verify your credentials.', 400);
    }
    if (temporaryPassword === newPassword) {
      throw makeError('New permanent password must differ from temporary password', 400);
    }
  }

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  user.mustChangePassword = false;
  await user.save();

  const roleName = user.role ? user.role.name : null;
  return {
    success: true,
    message: 'Your permanent password has been set successfully.',
    token: signToken(user, roleName),
    user: publicUser(user, roleName),
  };
}

module.exports = {
  register, login, getMe,
  changePassword, requestPasswordReset, resetPassword,
  provisionUser, getUser, setStatus, setRole,
  listOrgUsersByRoles, getAccountState,
  listIndustries, registerTenant, getTenantDetails,
  listAllTenants, updateTenantStatus,
  syncIndustry,
  provisionAgentAccount, setupPassword,
  listEligibleEmployees, getEmployeeForAgentRegistration,
  promoteEmployeeToAgent, generateEmployeeId,
  listServiceManagers, promoteEmployeeToServiceManager, removeServiceManagerAssignment,
};


