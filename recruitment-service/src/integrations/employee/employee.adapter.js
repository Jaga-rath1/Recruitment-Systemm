const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const env = require('../../config/env');
const logger = require('../../config/logger');
const { requestJson } = require('../common/httpClient');
const organisationAdapter = require('../organisation/organisation.adapter');
const { ForbiddenError, NotFoundError } = require('../../utils/AppError');

// Standalone dev/test fixture store (never used when INTEGRATION_MODE=live)
const standaloneEmployeesByOrg = new Map();
const STANDALONE_EMPLOYEE_STORE_PATH = path.resolve(__dirname, '../../../storage/.standalone-employees.json');

function shouldPersistStandaloneStore() {
  return env.integrationMode === 'standalone' && process.env.NODE_ENV !== 'test';
}

function saveStandaloneEmployeesToDisk() {
  if (!shouldPersistStandaloneStore()) return;
  try {
    const dir = path.dirname(STANDALONE_EMPLOYEE_STORE_PATH);
    fs.mkdirSync(dir, { recursive: true });
    const serialized = [];
    for (const [orgId, empMap] of standaloneEmployeesByOrg.entries()) {
      for (const emp of empMap.values()) {
        serialized.push({ ...emp, organisationId: orgId });
      }
    }
    fs.writeFileSync(STANDALONE_EMPLOYEE_STORE_PATH, JSON.stringify(serialized, null, 2), 'utf8');
  } catch (err) {
    logger.warn({ err: err.message }, '[Standalone Employee Adapter] Failed to persist standalone employees store');
  }
}

function loadStandaloneEmployeesFromDisk() {
  if (!shouldPersistStandaloneStore()) return;
  try {
    if (!fs.existsSync(STANDALONE_EMPLOYEE_STORE_PATH)) return;
    const raw = fs.readFileSync(STANDALONE_EMPLOYEE_STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      for (const emp of parsed) {
        if (emp && (emp.employeeId || emp.id) && emp.organisationId) {
          const empId = emp.employeeId || emp.id;
          const normalized = { ...emp, employeeId: empId, id: empId };
          ensureOrgStore(emp.organisationId).set(empId, normalized);
        }
      }
    }
  } catch (err) {
    logger.warn({ err: err.message }, '[Standalone Employee Adapter] Failed to load standalone employees store');
  }
}

// Initial load for standalone mode
loadStandaloneEmployeesFromDisk();

function ensureOrgStore(organisationId) {
  if (!standaloneEmployeesByOrg.has(organisationId)) {
    standaloneEmployeesByOrg.set(organisationId, new Map());
  }
  return standaloneEmployeesByOrg.get(organisationId);
}

function normalizeEmployeeDto(emp, fallbackOrgId = null) {
  if (!emp) return null;
  const fullName =
    emp.fullName ||
    [emp.firstName, emp.middleName, emp.lastName].filter(Boolean).join(' ').trim() ||
    emp.email ||
    'Team Member';
  const status = String(emp.status || 'active').toLowerCase();
  const isActive = !['inactive', 'terminated'].includes(status);

  return {
    employeeId: emp.id || emp.employeeId,
    id: emp.id || emp.employeeId,
    authUserId: emp.authUserId || null,
    organisationId: emp.organizationId || emp.organisationId || fallbackOrgId,
    employeeCode: emp.employeeCode || null,
    fullName,
    firstName: emp.firstName || fullName.split(/\s+/)[0] || fullName,
    lastName: emp.lastName || fullName.split(/\s+/).slice(1).join(' ') || '',
    email: (emp.workEmail || emp.email || '').toLowerCase(),
    workEmail: emp.workEmail || null,
    personalEmail: emp.email || null,
    phone: emp.workPhone || emp.phone || null,
    departmentId: emp.departmentId || null,
    designationId: emp.designationId || null,
    department: emp.department || 'People & Talent',
    designation: emp.designation || 'Team Member',
    employmentType: emp.employmentType || null,
    employmentStatus: emp.employmentStatus || null,
    joiningDate: emp.joiningDate || null,
    status: emp.status || 'active',
    isActive,
    createdAt: emp.createdAt || emp.created_at || null
  };
}

function splitFullName(fullName = '') {
  const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: 'Team', lastName: 'Member' };
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' ')
  };
}

function mapRecruitmentStatusToEmployeeStatus(status = 'active') {
  const s = String(status).toUpperCase();
  if (s === 'INVITED') return 'onboarding';
  if (s === 'ACTIVE') return 'active';
  if (s === 'INACTIVE' || s === 'DEACTIVATED') return 'inactive';
  if (s === 'TERMINATED') return 'terminated';
  return 'onboarding';
}

// Organization profile delegation for backward compatibility
function seedOrganisationProfile(organisationId, profile) {
  return organisationAdapter.seedOrganisationProfile(organisationId, profile);
}

async function getOrganisationProfile(organisationId, options = {}) {
  return organisationAdapter.getOrganisation(organisationId, options);
}

async function listEmployees(organisationId, { search = '', status = '', limit = 50, page = 1 } = {}, context = {}) {
  if (env.integrationMode === 'live') {
    const res = await requestJson({
      serviceName: 'Employee Service',
      baseUrl: env.services.employeeUrl,
      method: 'GET',
      path: '/api/v1/employees',
      organisationId,
      actor: {
        userId: context.actorUserId || 'svc-recruitment',
        role: 'super_admin',
        email: context.actorEmail || 'recruitment@nexnuv.internal'
      },
      query: {
        page,
        limit: Math.min(Number(limit) || 50, 100),
        ...(search ? { search } : {}),
        ...(status ? { status } : {})
      },
      requestId: context.requestId
    });

    const rows = Array.isArray(res.data?.data) ? res.data.data : [];
    return rows.map((emp) => normalizeEmployeeDto(emp, organisationId));
  }

  loadStandaloneEmployeesFromDisk();
  const store = ensureOrgStore(organisationId);

  // If in-memory store is still empty for this organisation, reconcile from DB assignments
  if (store.size === 0) {
    try {
      const { isDatabaseInitialized, getModels } = require('../../config/database');
      if (isDatabaseInitialized()) {
        const { EmployeeRoleAssignment } = getModels();
        const assignments = await EmployeeRoleAssignment.findAll({
          where: { organisationId }
        });
        const authAdapter = require('../auth/auth.adapter');
        for (const assign of assignments) {
          const authUser = assign.authUserId ? authAdapter.findStandaloneUserById(assign.authUserId) : null;
          const name = authUser?.name || 'Team Member';
          const { firstName, lastName } = splitFullName(name);
          const emp = {
            employeeId: assign.employeeId,
            id: assign.employeeId,
            authUserId: assign.authUserId || null,
            organisationId,
            employeeCode: `EMP-${assign.employeeId.slice(0, 6).toUpperCase()}`,
            fullName: name,
            firstName,
            lastName,
            email: (authUser?.email || '').toLowerCase(),
            department: 'People & Talent',
            designation: 'Recruiter',
            phone: null,
            status: assign.invitationStatus === 'ACCOUNT_ACTIVATED' ? 'ACTIVE' : 'INVITED',
            isActive: assign.isActive !== false,
            createdAt: assign.createdAt || new Date().toISOString()
          };
          store.set(assign.employeeId, emp);
        }
        if (store.size > 0) saveStandaloneEmployeesToDisk();
      }
    } catch (_dbErr) {}
  }

  const orgEmployees = Array.from(store.values());
  if (!search) return orgEmployees;
  const q = search.toLowerCase();
  return orgEmployees.filter(
    (emp) =>
      emp.fullName.toLowerCase().includes(q) ||
      emp.email.toLowerCase().includes(q) ||
      (emp.department || '').toLowerCase().includes(q)
  );
}

async function getEmployeeById(organisationId, employeeId, context = {}) {
  if (env.integrationMode === 'live') {
    try {
      const res = await requestJson({
        serviceName: 'Employee Service',
        baseUrl: env.services.employeeUrl,
        method: 'GET',
        path: `/api/v1/employees/${encodeURIComponent(employeeId)}`,
        organisationId,
        actor: {
          userId: context.actorUserId || 'svc-recruitment',
          role: 'super_admin',
          email: context.actorEmail || 'recruitment@nexnuv.internal'
        },
        requestId: context.requestId
      });
      const raw = res.data?.data || res.data;
      if (!raw) return null;
      const emp = normalizeEmployeeDto(raw, organisationId);
      // Enforce strict organisation association even if upstream response skipped isolation
      if (emp.organisationId && emp.organisationId !== organisationId) {
        return null;
      }
      return emp;
    } catch (err) {
      if (err instanceof NotFoundError || err.statusCode === 404) {
        return null;
      }
      throw err;
    }
  }

  let emp = ensureOrgStore(organisationId).get(employeeId);
  if (emp) return emp;

  // Standalone fallback: reload disk in case another process or restart happened
  loadStandaloneEmployeesFromDisk();
  emp = ensureOrgStore(organisationId).get(employeeId);
  if (emp) return emp;

  // Standalone database fallback: Check if EmployeeRoleAssignment exists in database
  try {
    const { isDatabaseInitialized, getModels } = require('../../config/database');
    if (isDatabaseInitialized()) {
      const { EmployeeRoleAssignment } = getModels();
      const assignment = await EmployeeRoleAssignment.findOne({
        where: { organisationId, employeeId }
      });
      if (assignment) {
        const authAdapter = require('../auth/auth.adapter');
        const authUser = assignment.authUserId ? authAdapter.findStandaloneUserById(assignment.authUserId) : null;
        const name = authUser?.name || 'Team Member';
        const { firstName, lastName } = splitFullName(name);
        const reconstructed = {
          employeeId,
          id: employeeId,
          authUserId: assignment.authUserId || null,
          organisationId,
          employeeCode: `EMP-${employeeId.slice(0, 6).toUpperCase()}`,
          fullName: name,
          firstName,
          lastName,
          email: (authUser?.email || '').toLowerCase(),
          department: 'People & Talent',
          designation: 'Recruiter',
          phone: null,
          status: assignment.invitationStatus === 'ACCOUNT_ACTIVATED' ? 'ACTIVE' : 'INVITED',
          isActive: assignment.isActive !== false,
          createdAt: assignment.createdAt || new Date().toISOString()
        };
        ensureOrgStore(organisationId).set(employeeId, reconstructed);
        saveStandaloneEmployeesToDisk();
        return reconstructed;
      }
    }
  } catch (_dbErr) {}

  return null;
}

async function validateActiveEmployeeInOrg(organisationId, employeeId, context = {}) {
  const emp = await getEmployeeById(organisationId, employeeId, context);
  if (!emp) {
    throw new NotFoundError('Employee not found in Employee Service for this organisation');
  }
  if (!emp.isActive) {
    throw new ForbiddenError(
      `Employee status is '${emp.status}'. Deactivated or terminated employees cannot hold active recruitment access.`,
      'EMPLOYEE_INACTIVE'
    );
  }
  return emp;
}

async function createEmployee(organisationId, payload, context = {}) {
  const normalizedEmail = payload.email.trim().toLowerCase();

  if (env.integrationMode === 'live') {
    const matches = await listEmployees(organisationId, { search: normalizedEmail, limit: 25 }, context);
    const existing = matches.find(
      (emp) =>
        (!emp.organisationId || emp.organisationId === organisationId) &&
        [emp.email, emp.personalEmail, emp.workEmail]
          .filter(Boolean)
          .some((candidateEmail) => candidateEmail.toLowerCase() === normalizedEmail)
    );
    if (existing) {
      if (!existing.isActive) {
        throw new ForbiddenError(
          `Employee '${normalizedEmail}' is currently '${existing.status}' and cannot receive active recruitment access.`,
          'EMPLOYEE_INACTIVE'
        );
      }
      return existing;
    }

    const { firstName, lastName } =
      payload.firstName && payload.lastName
        ? { firstName: payload.firstName, lastName: payload.lastName }
        : splitFullName(payload.fullName);
    const employeeCode =
      payload.employeeCode ||
      `REC-${Math.floor(10000 + Math.random() * 90000)}`;

    try {
      const res = await requestJson({
        serviceName: 'Employee Service',
        baseUrl: env.services.employeeUrl,
        method: 'POST',
        path: '/api/v1/employees',
        organisationId,
        actor: {
          userId: context.actorUserId || 'svc-recruitment',
          role: 'super_admin',
          email: context.actorEmail || 'recruitment@nexnuv.internal'
        },
        requestId: context.requestId,
        body: {
          employeeCode,
          firstName,
          lastName,
          email: normalizedEmail,
          workEmail: normalizedEmail,
          phone: payload.phone || undefined,
          departmentId: payload.departmentId || undefined,
          designationId: payload.designationId || undefined,
          status: mapRecruitmentStatusToEmployeeStatus(payload.status)
        }
      });

      return normalizeEmployeeDto(res.data?.data || res.data, organisationId);
    } catch (err) {
      if (err.statusCode === 409) {
        const retryMatches = await listEmployees(organisationId, { search: normalizedEmail, limit: 25 }, context);
        const retryExisting = retryMatches.find(
          (emp) =>
            (!emp.organisationId || emp.organisationId === organisationId) &&
            [emp.email, emp.personalEmail, emp.workEmail]
              .filter(Boolean)
              .some((candidateEmail) => candidateEmail.toLowerCase() === normalizedEmail)
        );
        if (retryExisting) {
          if (!retryExisting.isActive) {
            throw new ForbiddenError(
              `Employee '${normalizedEmail}' is currently '${retryExisting.status}' and cannot receive active recruitment access.`,
              'EMPLOYEE_INACTIVE'
            );
          }
          return retryExisting;
        }
      }
      throw err;
    }
  }

  const store = ensureOrgStore(organisationId);
  const existing = Array.from(store.values()).find(
    (e) => e.email.toLowerCase() === normalizedEmail
  );
  if (existing) {
    if (!existing.isActive) {
      throw new ForbiddenError(
        `Employee '${normalizedEmail}' is currently '${existing.status}' and cannot receive active recruitment access.`,
        'EMPLOYEE_INACTIVE'
      );
    }
    return existing;
  }

  const employeeId = payload.employeeId || payload.id || uuidv4();
  const { firstName, lastName } = splitFullName(payload.fullName);
  const employee = {
    employeeId,
    id: employeeId,
    authUserId: payload.authUserId || null,
    organisationId,
    employeeCode: payload.employeeCode || `EMP-${Math.floor(1000 + Math.random() * 9000)}`,
    fullName: payload.fullName.trim(),
    firstName,
    lastName,
    email: payload.email.trim().toLowerCase(),
    department: payload.department || 'People & Talent',
    designation: payload.designation || 'Team Member',
    phone: payload.phone || null,
    status: payload.status || 'INVITED',
    isActive: true,
    createdAt: new Date().toISOString()
  };

  store.set(employee.employeeId, employee);
  saveStandaloneEmployeesToDisk();
  return employee;
}

function updateStandaloneEmployeeAuthId(organisationId, employeeId, authUserId, status = 'ACTIVE') {
  if (env.integrationMode === 'live') return null;
  const emp = ensureOrgStore(organisationId).get(employeeId);
  if (emp) {
    emp.authUserId = authUserId;
    emp.status = status;
    saveStandaloneEmployeesToDisk();
  }
  return emp;
}

function updateStandaloneEmployeeStatus(organisationId, employeeId, status) {
  if (env.integrationMode === 'live') return;
  const emp = ensureOrgStore(organisationId).get(employeeId);
  if (emp) {
    emp.status = status;
    saveStandaloneEmployeesToDisk();
  }
}

function deleteStandaloneEmployee(organisationId, employeeId) {
  if (env.integrationMode === 'live') return true;
  const orgStore = standaloneEmployeesByOrg.get(organisationId);
  if (orgStore) {
    orgStore.delete(employeeId);
    saveStandaloneEmployeesToDisk();
  }
  return true;
}

function clearStandaloneEmployeeStore() {
  organisationAdapter.clearStandaloneOrganisations();
  standaloneEmployeesByOrg.clear();
  if (fs.existsSync(STANDALONE_EMPLOYEE_STORE_PATH)) {
    try {
      fs.unlinkSync(STANDALONE_EMPLOYEE_STORE_PATH);
    } catch (_e) {}
  }
}

module.exports = {
  normalizeEmployeeDto,
  seedOrganisationProfile,
  getOrganisationProfile,
  listEmployees,
  getEmployeeById,
  validateActiveEmployeeInOrg,
  createEmployee,
  updateStandaloneEmployeeAuthId,
  updateStandaloneEmployeeStatus,
  deleteStandaloneEmployee,
  clearStandaloneEmployeeStore
};
