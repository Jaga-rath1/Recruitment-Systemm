'use strict';
const VALID_DATE_FORMATS = ['YYYY-MM-DD', 'DD-MM-YYYY', 'MM-DD-YYYY', 'DD/MM/YYYY', 'MM/DD/YYYY'];
const VALID_WEEK_DAYS = ['monday', 'sunday', 'saturday'];

function validateUpsert(body) {
  const { timezone, currency, dateFormat, weekStartDay } = body;
  if (timezone !== undefined && (typeof timezone !== 'string' || !timezone.trim())) return 'timezone must be a non-empty string';
  if (currency !== undefined && (typeof currency !== 'string' || !currency.trim())) return 'currency must be a non-empty string';
  if (dateFormat !== undefined && !VALID_DATE_FORMATS.includes(dateFormat)) return `dateFormat must be one of: ${VALID_DATE_FORMATS.join(', ')}`;
  if (weekStartDay !== undefined && !VALID_WEEK_DAYS.includes(weekStartDay)) return `weekStartDay must be one of: ${VALID_WEEK_DAYS.join(', ')}`;
  return null;
}

module.exports = { validateUpsert };
