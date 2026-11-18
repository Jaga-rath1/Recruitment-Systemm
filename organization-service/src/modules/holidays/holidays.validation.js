'use strict';
const VALID_STATUSES = ['active', 'inactive'];

function validateCreate(body) {
  const { name, date, status } = body;
  if (!name || typeof name !== 'string' || !name.trim()) return 'name is required';
  if (!date) return 'date is required';
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'date must be a valid date (YYYY-MM-DD)';
  if (status !== undefined && !VALID_STATUSES.includes(status)) return `status must be one of: ${VALID_STATUSES.join(', ')}`;
  return null;
}

function validateUpdate(body) {
  const { name, date, status } = body;
  if (name !== undefined && (typeof name !== 'string' || !name.trim())) return 'name must be a non-empty string';
  if (date !== undefined) {
    const d = new Date(date);
    if (isNaN(d.getTime())) return 'date must be a valid date (YYYY-MM-DD)';
  }
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
