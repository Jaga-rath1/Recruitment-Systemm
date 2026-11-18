'use strict';
const VALID_STATUSES = ['trial', 'active', 'expired', 'cancelled'];

function validateCreate(body) {
  const { organizationId, planId, startsAt, endsAt, status } = body;
  if (!organizationId) return 'organizationId is required';
  if (!planId) return 'planId is required';
  if (!startsAt) return 'startsAt is required';
  const start = new Date(startsAt);
  if (isNaN(start.getTime())) return 'startsAt must be a valid date';
  if (endsAt !== undefined) {
    const end = new Date(endsAt);
    if (isNaN(end.getTime())) return 'endsAt must be a valid date';
    if (end <= start) return 'endsAt must be after startsAt';
  }
  if (status !== undefined && !['trial', 'active'].includes(status)) return 'a new subscription must start as trial or active';
  return null;
}

function validateUpdate(body) {
  const { status, endsAt, trialEndsAt } = body;
  if (status !== undefined && !VALID_STATUSES.includes(status)) return `status must be one of: ${VALID_STATUSES.join(', ')}`;
  if (endsAt !== undefined) {
    const d = new Date(endsAt);
    if (isNaN(d.getTime())) return 'endsAt must be a valid date';
  }
  if (trialEndsAt !== undefined) {
    const d = new Date(trialEndsAt);
    if (isNaN(d.getTime())) return 'trialEndsAt must be a valid date';
  }
  return null;
}

module.exports = { validateCreate, validateUpdate };
