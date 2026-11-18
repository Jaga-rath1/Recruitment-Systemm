'use strict';

const VALID_STATUSES      = ['draft', 'onboarding', 'active', 'inactive', 'on_leave', 'terminated'];
const VALID_EMP_TYPES     = ['full_time', 'part_time', 'contract', 'intern'];
const VALID_EMP_STATUSES  = ['permanent', 'probation', 'notice_period', 'resigned'];
const VALID_GENDERS       = ['male', 'female', 'other', 'prefer_not_to_say'];
const LOGIN_ROLES         = ['employee', 'manager', 'hr', 'org_admin'];
const REFERENCE_FIELDS    = ['branchId', 'departmentId', 'designationId', 'teamId', 'shiftId', 'managerId'];

// Valid lifecycle transitions
const STATUS_TRANSITIONS = {
  draft:       ['onboarding', 'active'],
  onboarding:  ['active'],
  active:      ['inactive', 'on_leave', 'terminated'],
  inactive:    ['active', 'terminated'],
  on_leave:    ['active', 'terminated'],
  terminated:  [],
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[\d\s\-().]{7,20}$/;
const DATE_RE  = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE  = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateEmail(val) {
  if (val && !EMAIL_RE.test(val)) return 'Invalid email format';
  return null;
}

function validatePhone(val) {
  if (val && !PHONE_RE.test(val)) return 'Invalid phone format';
  return null;
}

function validateDate(val, field) {
  if (val && !DATE_RE.test(val)) return `${field} must be YYYY-MM-DD`;
  return null;
}

function validateReferences(body) {
  for (const field of REFERENCE_FIELDS) {
    const value = body[field];
    if (value === undefined || value === null || value === '') continue;
    if (typeof value !== 'string' || !UUID_RE.test(value)) return `${field} must be a valid id`;
  }
  return null;
}

function validateLoginRole(role) {
  if (role !== undefined && role !== null && !LOGIN_ROLES.includes(role)) {
    return `role must be one of: ${LOGIN_ROLES.join(', ')}`;
  }
  return null;
}

function validateCommon(body) {
  const { email, workEmail, phone, workPhone, employmentType, employmentStatus, gender, dateOfBirth, joiningDate } = body;

  const emailErr = validateEmail(email);       if (emailErr) return emailErr;
  const weErr    = validateEmail(workEmail);   if (weErr)    return weErr;
  const phoneErr = validatePhone(phone);       if (phoneErr) return phoneErr;
  const wpErr    = validatePhone(workPhone);   if (wpErr)    return wpErr;

  if (dateOfBirth) { const e = validateDate(dateOfBirth, 'dateOfBirth'); if (e) return e; }
  if (joiningDate) { const e = validateDate(joiningDate, 'joiningDate'); if (e) return e; }

  if (employmentType   && !VALID_EMP_TYPES.includes(employmentType))
    return `employmentType must be one of: ${VALID_EMP_TYPES.join(', ')}`;
  if (employmentStatus && !VALID_EMP_STATUSES.includes(employmentStatus))
    return `employmentStatus must be one of: ${VALID_EMP_STATUSES.join(', ')}`;
  if (gender && !VALID_GENDERS.includes(gender))
    return `gender must be one of: ${VALID_GENDERS.join(', ')}`;

  return validateReferences(body);
}

function validateCreate(body) {
  const { firstName, lastName, employeeCode, email, workEmail, status } = body;

  if (!firstName || !firstName.trim()) return 'firstName is required';
  if (!lastName  || !lastName.trim())  return 'lastName is required';
  if (!employeeCode || !employeeCode.trim()) return 'employeeCode is required';

  const commonErr = validateCommon(body);
  if (commonErr) return commonErr;

  // A new record starts before or at "active"; later states are reached through status changes.
  if (status && !['draft', 'onboarding', 'active'].includes(status))
    return 'status of a new employee must be draft, onboarding or active';
  if (body.createLogin && !(workEmail || email)) return 'An email address is required to create a login';

  return validateLoginRole(body.role);
}

function validateUpdate(body) {
  const { firstName, lastName, employeeCode } = body;

  if (firstName  !== undefined && (!firstName  || !firstName.trim()))  return 'firstName must be a non-empty string';
  if (lastName   !== undefined && (!lastName   || !lastName.trim()))   return 'lastName must be a non-empty string';
  if (employeeCode !== undefined && (!employeeCode || !employeeCode.trim())) return 'employeeCode must be a non-empty string';

  return validateCommon(body);
}

function validateSelfUpdate(body) {
  return validateEmail(body.email) || validatePhone(body.phone);
}

function validateStatusTransition(currentStatus, newStatus) {
  if (!newStatus) return 'status is required';
  if (!VALID_STATUSES.includes(newStatus)) return `status must be one of: ${VALID_STATUSES.join(', ')}`;
  if (newStatus === currentStatus) return `Employee is already ${currentStatus}`;
  const allowed = STATUS_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(newStatus))
    return `Cannot transition from ${currentStatus} to ${newStatus}`;
  return null;
}

module.exports = {
  validateCreate,
  validateUpdate,
  validateSelfUpdate,
  validateLoginRole,
  validateStatusTransition,
  VALID_STATUSES,
  STATUS_TRANSITIONS,
};
