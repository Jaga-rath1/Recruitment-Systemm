'use strict';

const CODE_RE = /^[A-Za-z0-9_-]{2,50}$/;

function validateCreate(body) {
  const { moduleId, name, code } = body;
  if (!moduleId || typeof moduleId !== 'string') return 'moduleId is required';
  if (!name || typeof name !== 'string' || !name.trim()) return 'name is required';
  if (name.length > 100) return 'name must not exceed 100 characters';
  if (!code || !CODE_RE.test(code)) return 'code is required (2–50 chars: letters, numbers, _ or -)';
  return null;
}

function validateUpdate(body) {
  if (body.name !== undefined && (!String(body.name).trim() || String(body.name).length > 100)) return 'name must be 1–100 characters';
  if (body.code !== undefined && !CODE_RE.test(body.code)) return 'code must be 2–50 chars (letters, numbers, _ or -)';
  return null;
}

function validateStatus(body) {
  if (!body.status || !['active', 'inactive'].includes(body.status)) return 'status must be active or inactive';
  return null;
}

module.exports = { validateCreate, validateUpdate, validateStatus };
