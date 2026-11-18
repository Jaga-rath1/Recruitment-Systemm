'use strict';
const VALID_STATUSES = ['active', 'inactive'];

function validateCreate(body) {
  const { name, code, status } = body;
  if (!name || typeof name !== 'string' || !name.trim()) return 'name is required';
  if (!code || typeof code !== 'string' || !code.trim()) return 'code is required';
  if (status !== undefined && !VALID_STATUSES.includes(status)) return `status must be one of: ${VALID_STATUSES.join(', ')}`;
  return null;
}

function validateUpdate(body) {
  const { name, code, status, parentDepartmentId } = body;
  if (name !== undefined && (typeof name !== 'string' || !name.trim())) return 'name must be a non-empty string';
  if (code !== undefined && (typeof code !== 'string' || !code.trim())) return 'code must be a non-empty string';
  if (status !== undefined && !VALID_STATUSES.includes(status)) return `status must be one of: ${VALID_STATUSES.join(', ')}`;
  return null;
}

function validateStatus(body) {
  const { status } = body;
  if (!status) return 'status is required';
  if (!VALID_STATUSES.includes(status)) return `status must be one of: ${VALID_STATUSES.join(', ')}`;
  return null;
}

module.exports = { validateCreate, validateUpdate, validateStatus };
