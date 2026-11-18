'use strict';
const VALID_BILLING_CYCLES = ['monthly', 'yearly'];
const VALID_STATUSES = ['active', 'inactive'];

function validateCreate(body) {
  const { name, code, price, billingCycle, trialDays, status } = body;
  if (!name || typeof name !== 'string' || !name.trim()) return 'name is required';
  if (!code || typeof code !== 'string' || !code.trim()) return 'code is required';
  if (!billingCycle) return 'billingCycle is required';
  if (!VALID_BILLING_CYCLES.includes(billingCycle)) return `billingCycle must be one of: ${VALID_BILLING_CYCLES.join(', ')}`;
  if (price !== undefined && (typeof price !== 'number' || price < 0)) return 'price must be a non-negative number';
  if (trialDays !== undefined && (typeof trialDays !== 'number' || !Number.isInteger(trialDays) || trialDays < 0)) return 'trialDays must be a non-negative integer';
  if (status !== undefined && !VALID_STATUSES.includes(status)) return `status must be one of: ${VALID_STATUSES.join(', ')}`;
  return null;
}

function validateUpdate(body) {
  const { name, code, price, billingCycle, trialDays } = body;
  if (name !== undefined && (typeof name !== 'string' || !name.trim())) return 'name must be a non-empty string';
  if (code !== undefined && (typeof code !== 'string' || !code.trim())) return 'code must be a non-empty string';
  if (billingCycle !== undefined && !VALID_BILLING_CYCLES.includes(billingCycle)) return `billingCycle must be one of: ${VALID_BILLING_CYCLES.join(', ')}`;
  if (price !== undefined && (typeof price !== 'number' || price < 0)) return 'price must be a non-negative number';
  if (trialDays !== undefined && (typeof trialDays !== 'number' || !Number.isInteger(trialDays) || trialDays < 0)) return 'trialDays must be a non-negative integer';
  return null;
}

function validateStatus(body) {
  const { status } = body;
  if (!status) return 'status is required';
  if (!VALID_STATUSES.includes(status)) return `status must be one of: ${VALID_STATUSES.join(', ')}`;
  return null;
}

module.exports = { validateCreate, validateUpdate, validateStatus };
