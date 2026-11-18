'use strict';
const OUTCOMES = ['converted', 'cancelled', 'expired'];

function validateCreate(body) {
  const { organizationId, planId, startsAt, endsAt } = body;
  if (!organizationId) return 'organizationId is required';
  if (!planId) return 'planId is required';
  if (!startsAt) return 'startsAt is required';
  const start = new Date(startsAt);
  if (isNaN(start.getTime())) return 'startsAt must be a valid date';
  if (endsAt !== undefined && endsAt !== null) {
    const end = new Date(endsAt);
    if (isNaN(end.getTime())) return 'endsAt must be a valid date';
    if (end <= start) return 'endsAt must be after startsAt';
  }
  return null;
}

function validateUpdate(body) {
  const { status } = body;
  if (!status) return 'status is required';
  if (!OUTCOMES.includes(status)) return `status must be one of: ${OUTCOMES.join(', ')}`;
  return null;
}

module.exports = { validateCreate, validateUpdate };
