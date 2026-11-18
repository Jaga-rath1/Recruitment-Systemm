'use strict';
const { Op } = require('sequelize');
const Employee = require('./employees.model');
const { validateStatusTransition } = require('./employees.validation');
const { existsInOrg } = require('../../clients/organizationClient');
const { ORG_WIDE_ROLES } = require('../../middlewares/authorize');

function makeError(message, status) {
  return Object.assign(new Error(message), { status });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MANAGER_INCLUDE = [{
  model: Employee,
  as: 'manager',
  attributes: ['id', 'firstName', 'lastName', 'employeeCode'],
}];

// Fields an HR/admin user may set on an employee record.
const WRITABLE_FIELDS = [
  'employeeCode', 'firstName', 'middleName', 'lastName',
  'email', 'phone', 'dateOfBirth', 'gender',
  'addressLine1', 'addressLine2', 'city', 'state', 'postalCode', 'country',
  'branchId', 'departmentId', 'designationId', 'teamId', 'shiftId',
  'managerId', 'joiningDate', 'employmentType', 'employmentStatus',
  'workEmail', 'workPhone',
];
const TRIMMED_FIELDS = ['employeeCode', 'firstName', 'middleName', 'lastName'];

// Fields an employee may change on their own profile.
const SELF_SERVICE_FIELDS = [
  'phone', 'email', 'addressLine1', 'addressLine2', 'city', 'state', 'postalCode', 'country',
];

// Organization-owned references: employee field -> organization-service collection.
const ORG_REFERENCES = {
  branchId: ['branches', 'Branch'],
  departmentId: ['departments', 'Department'],
  designationId: ['designations', 'Designation'],
  teamId: ['teams', 'Team'],
  shiftId: ['shifts', 'Shift'],
};

function pickFields(data, allowed) {
  const fields = {};
  for (const key of allowed) {
    if (data[key] === undefined) continue;
    let value = data[key];
    if (typeof value === 'string' && TRIMMED_FIELDS.includes(key)) value = value.trim();
    fields[key] = value === '' ? null : value;
  }
  return fields;
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function assertBelongsToOrg(id, organizationId, options = {}) {
  const emp = await Employee.findOne({ where: { id, organizationId }, ...options });
  if (!emp) throw makeError('Employee not found', 404);
  return emp;
}

async function checkDuplicateCode(organizationId, employeeCode, excludeId = null) {
  const where = { organizationId, employeeCode: employeeCode.trim() };
  if (excludeId) where.id = { [Op.ne]: excludeId };
  const existing = await Employee.findOne({ where });
  if (existing) throw makeError('Employee code already exists in this organization', 409);
}

/** Ids of everyone below `managerId` in the reporting hierarchy (direct and indirect). */
async function subordinateIds(organizationId, managerId) {
  const found = [];
  const seen = new Set([managerId]);
  let frontier = [managerId];
  while (frontier.length) {
    const rows = await Employee.findAll({
      where: { organizationId, managerId: { [Op.in]: frontier } },
      attributes: ['id'],
    });
    frontier = [];
    for (const row of rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      found.push(row.id);
      frontier.push(row.id);
    }
  }
  return found;
}

async function validateManager(managerId, organizationId, selfId = null) {
  if (!managerId) return;
  if (selfId && managerId === selfId) throw makeError('Employee cannot be their own manager', 400);
  const mgr = await Employee.findOne({ where: { id: managerId, organizationId } });
  if (!mgr) throw makeError('Manager not found or belongs to another organization', 404);
  if (['inactive', 'terminated'].includes(mgr.status)) throw makeError('Manager must not be an inactive or terminated employee', 400);
  if (selfId) {
    const below = await subordinateIds(organizationId, selfId);
    if (below.includes(managerId)) {
      throw makeError('Reporting loop: the selected manager already reports to this employee', 400);
    }
  }
}

async function validateOrgReferences(organizationId, fields) {
  for (const [field, [collection, label]] of Object.entries(ORG_REFERENCES)) {
    const id = fields[field];
    if (!id) continue;
    const exists = await existsInOrg(organizationId, collection, id);
    if (exists === null) throw makeError('Could not verify organization data right now. Please try again.', 503);
    if (!exists) throw makeError(`${label} not found in this organization`, 400);
  }
}

// ── access scope ─────────────────────────────────────────────────────────────

/**
 * Which employees may this user see and act on?
 *   organization — everyone (org_admin, hr, platform admin, backend services)
 *   team         — the user's direct and indirect reports (manager)
 *   self         — only their own record (employee)
 * `employeeId` is the caller's own employee record, when they have one.
 */
async function resolveScope(user) {
  // Backend services call with a non-UUID service id and have no employee record.
  const self = UUID_RE.test(user.userId)
    ? await Employee.findOne({
      where: { authUserId: user.userId, organizationId: user.organizationId },
      attributes: ['id'],
    })
    : null;
  const employeeId = self ? self.id : null;

  if (ORG_WIDE_ROLES.includes(user.role)) return { scope: 'organization', employeeId, employeeIds: null };
  if (user.role === 'manager') {
    const employeeIds = employeeId ? await subordinateIds(user.organizationId, employeeId) : [];
    return { scope: 'team', employeeId, employeeIds };
  }
  return { scope: 'self', employeeId, employeeIds: [] };
}

function assertInScope(scope, employeeId) {
  if (scope.scope === 'organization') return;
  if (employeeId === scope.employeeId || scope.employeeIds.includes(employeeId)) return;
  throw makeError('Employee not found', 404);
}

// ── service methods ───────────────────────────────────────────────────────────

async function create(organizationId, data) {
  const fields = pickFields(data, WRITABLE_FIELDS);
  await checkDuplicateCode(organizationId, fields.employeeCode);
  await validateManager(fields.managerId, organizationId);
  await validateOrgReferences(organizationId, fields);

  return Employee.create({ ...fields, organizationId, status: data.status || 'draft' });
}

async function list(user, query) {
  let { page = 1, limit = 20, search, status, branchId, departmentId, designationId, teamId, managerId, employmentType } = query;

  page  = parseInt(page,  10);
  limit = parseInt(limit, 10);

  if (isNaN(page)  || page  < 1)   throw makeError('page must be a positive integer', 400);
  if (isNaN(limit) || limit < 1)   throw makeError('limit must be a positive integer', 400);
  if (limit > 100)                  throw makeError('limit cannot exceed 100', 400);

  const where = { organizationId: user.organizationId };
  const scope = await resolveScope(user);
  if (scope.scope !== 'organization') where.id = { [Op.in]: scope.employeeIds };

  if (status)          where.status          = status;
  if (branchId)        where.branchId        = branchId;
  if (departmentId)    where.departmentId    = departmentId;
  if (designationId)   where.designationId   = designationId;
  if (teamId)          where.teamId          = teamId;
  if (managerId)       where.managerId       = managerId;
  if (employmentType)  where.employmentType  = employmentType;

  if (search && search.trim()) {
    const s = `%${search.trim()}%`;
    where[Op.or] = [
      { employeeCode: { [Op.iLike]: s } },
      { firstName:    { [Op.iLike]: s } },
      { lastName:     { [Op.iLike]: s } },
      { email:        { [Op.iLike]: s } },
      { workEmail:    { [Op.iLike]: s } },
      { phone:        { [Op.iLike]: s } },
    ];
  }

  const offset = (page - 1) * limit;
  const { rows, count } = await Employee.findAndCountAll({
    where,
    limit,
    offset,
    order: [['createdAt', 'DESC']],
  });

  return {
    data: rows,
    pagination: {
      page,
      limit,
      total: count,
      totalPages: Math.ceil(count / limit),
    },
  };
}

async function getById(user, id) {
  const scope = await resolveScope(user);
  assertInScope(scope, id);
  return assertBelongsToOrg(id, user.organizationId, { include: MANAGER_INCLUDE });
}

async function getByAuthUserId(authUserId, organizationId) {
  const emp = UUID_RE.test(authUserId)
    ? await Employee.findOne({ where: { authUserId, organizationId }, include: MANAGER_INCLUDE })
    : null;
  if (!emp) throw makeError('Employee profile not found for current user', 404);
  return emp;
}

async function update(organizationId, id, data) {
  const emp = await assertBelongsToOrg(id, organizationId);
  const fields = pickFields(data, WRITABLE_FIELDS);

  if (fields.employeeCode !== undefined) await checkDuplicateCode(organizationId, fields.employeeCode, id);
  if (fields.managerId    !== undefined) await validateManager(fields.managerId, organizationId, id);
  await validateOrgReferences(organizationId, fields);

  await emp.update(fields);
  return assertBelongsToOrg(id, organizationId, { include: MANAGER_INCLUDE });
}

async function updateOwnProfile(user, data) {
  const emp = await getByAuthUserId(user.userId, user.organizationId);
  await emp.update(pickFields(data, SELF_SERVICE_FIELDS));
  return emp;
}

async function updateStatus(organizationId, id, newStatus) {
  const emp = await assertBelongsToOrg(id, organizationId);
  const err = validateStatusTransition(emp.status, newStatus);
  if (err) throw makeError(err, 400);
  await emp.update({ status: newStatus });
  return emp;
}

async function remove(organizationId, id) {
  const emp = await assertBelongsToOrg(id, organizationId);
  const reports = await Employee.count({ where: { organizationId, managerId: id } });
  if (reports > 0) throw makeError('Reassign this employee\'s direct reports before deleting them', 409);
  await emp.destroy();
  return emp;
}

async function getForProvisioning(organizationId, id) {
  const emp = await assertBelongsToOrg(id, organizationId);
  if (emp.authUserId) throw makeError('Employee already has a login account', 409);
  if (!(emp.workEmail || emp.email)) throw makeError('Employee has no email address to provision login', 400);
  return emp;
}

module.exports = {
  create, list, getById, getByAuthUserId, update, updateOwnProfile, updateStatus, remove,
  getForProvisioning, resolveScope,
};
