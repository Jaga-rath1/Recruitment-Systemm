'use strict';
const VALID_STATUSES = ['active', 'inactive'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function optionalUuid(value, field) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !UUID_RE.test(value)) return `${field} must be a valid id`;
  return null;
}

function validateCreate(body) {
  const { name, code, status, departmentId, leadEmployeeId } = body;
  if (!name || typeof name !== 'string' || !name.trim()) return 'name is required';
  if (!code || typeof code !== 'string' || !code.trim()) return 'code is required';
  if (status !== undefined && !VALID_STATUSES.includes(status)) return `status must be one of: ${VALID_STATUSES.join(', ')}`;
  return optionalUuid(departmentId, 'departmentId') || optionalUuid(leadEmployeeId, 'leadEmployeeId');
}

function validateUpdate(body) {
  const { name, code, status, departmentId, leadEmployeeId } = body;
  if (name !== undefined && (typeof name !== 'string' || !name.trim())) return 'name must be a non-empty string';
  if (code !== undefined && (typeof code !== 'string' || !code.trim())) return 'code must be a non-empty string';
  if (status !== undefined && !VALID_STATUSES.includes(status)) return `status must be one of: ${VALID_STATUSES.join(', ')}`;
  return optionalUuid(departmentId, 'departmentId') || optionalUuid(leadEmployeeId, 'leadEmployeeId');
}

function validateStatus(body) {
  const { status } = body;
  if (!status) return 'status is required';
  if (!VALID_STATUSES.includes(status)) return `status must be one of: ${VALID_STATUSES.join(', ')}`;
  return null;
}

module.exports = { validateCreate, validateUpdate, validateStatus };
