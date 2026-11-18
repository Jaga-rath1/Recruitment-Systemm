'use strict';
const VALID_STATUSES = ['active', 'inactive'];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function validateCreate(body) {
  const { name, code, startTime, endTime, status } = body;
  if (!name || typeof name !== 'string' || !name.trim()) return 'name is required';
  if (!code || typeof code !== 'string' || !code.trim()) return 'code is required';
  if (!startTime) return 'startTime is required';
  if (!TIME_RE.test(startTime)) return 'startTime must be in HH:MM format (24-hour)';
  if (!endTime) return 'endTime is required';
  if (!TIME_RE.test(endTime)) return 'endTime must be in HH:MM format (24-hour)';
  if (status !== undefined && !VALID_STATUSES.includes(status)) return `status must be one of: ${VALID_STATUSES.join(', ')}`;
  return null;
}

function validateUpdate(body) {
  const { name, code, startTime, endTime, status } = body;
  if (name !== undefined && (typeof name !== 'string' || !name.trim())) return 'name must be a non-empty string';
  if (code !== undefined && (typeof code !== 'string' || !code.trim())) return 'code must be a non-empty string';
  if (startTime !== undefined && !TIME_RE.test(startTime)) return 'startTime must be in HH:MM format (24-hour)';
  if (endTime !== undefined && !TIME_RE.test(endTime)) return 'endTime must be in HH:MM format (24-hour)';
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
