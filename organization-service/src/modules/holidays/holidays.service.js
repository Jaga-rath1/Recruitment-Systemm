'use strict';
const Holiday = require('./holidays.model');
const Organization = require('../organizations/organizations.model');

function makeError(message, status) {
  return Object.assign(new Error(message), { status });
}

async function list(organizationId) {
  const org = await Organization.findByPk(organizationId);
  if (!org) throw makeError('Organization not found', 404);
  return Holiday.findAll({ where: { organizationId }, order: [['date', 'ASC']] });
}

async function getById(organizationId, id) {
  const item = await Holiday.findOne({ where: { id, organizationId } });
  if (!item) throw makeError('Holiday not found', 404);
  return item;
}

async function create(organizationId, { name, date, description, status = 'active' }) {
  const org = await Organization.findByPk(organizationId);
  if (!org) throw makeError('Organization not found', 404);
  const existing = await Holiday.findOne({ where: { organizationId, date, name: name.trim() } });
  if (existing) throw makeError('A holiday with this name and date already exists in this organization', 409);
  return Holiday.create({ organizationId, name: name.trim(), date, description: description || null, status });
}

async function update(organizationId, id, { name, date, description, status }) {
  const item = await Holiday.findOne({ where: { id, organizationId } });
  if (!item) throw makeError('Holiday not found', 404);
  const fields = {};
  if (name !== undefined) fields.name = name.trim();
  if (date !== undefined) fields.date = date;
  if (description !== undefined) fields.description = description || null;
  if (status !== undefined) fields.status = status;
  await item.update(fields);
  return item;
}

async function updateStatus(organizationId, id, status) {
  const item = await Holiday.findOne({ where: { id, organizationId } });
  if (!item) throw makeError('Holiday not found', 404);
  await item.update({ status });
  return item;
}

async function remove(organizationId, id) {
  const item = await Holiday.findOne({ where: { id, organizationId } });
  if (!item) throw makeError('Holiday not found', 404);
  await item.destroy();
}

module.exports = { list, getById, create, update, updateStatus, remove };
