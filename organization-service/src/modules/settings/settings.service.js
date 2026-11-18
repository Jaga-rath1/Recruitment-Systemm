'use strict';
const OrganizationSettings = require('./settings.model');
const Organization = require('../organizations/organizations.model');

function makeError(message, status) {
  return Object.assign(new Error(message), { status });
}

async function get(organizationId) {
  const org = await Organization.findByPk(organizationId);
  if (!org) throw makeError('Organization not found', 404);
  // Settings are created lazily; a new organization starts from its profile timezone.
  const [settings] = await OrganizationSettings.findOrCreate({
    where: { organizationId },
    defaults: { organizationId, timezone: org.timezone || 'UTC' },
  });
  return settings;
}

async function upsert(organizationId, { timezone, currency, dateFormat, weekStartDay }) {
  const org = await Organization.findByPk(organizationId);
  if (!org) throw makeError('Organization not found', 404);

  const existing = await OrganizationSettings.findOne({ where: { organizationId } });
  if (existing) {
    const fields = {};
    if (timezone !== undefined) fields.timezone = timezone.trim();
    if (currency !== undefined) fields.currency = currency.trim().toUpperCase();
    if (dateFormat !== undefined) fields.dateFormat = dateFormat;
    if (weekStartDay !== undefined) fields.weekStartDay = weekStartDay;
    await existing.update(fields);
    return existing;
  }
  return OrganizationSettings.create({
    organizationId,
    timezone: timezone ? timezone.trim() : 'UTC',
    currency: currency ? currency.trim().toUpperCase() : 'USD',
    dateFormat: dateFormat || 'YYYY-MM-DD',
    weekStartDay: weekStartDay || 'monday',
  });
}

module.exports = { get, upsert };
