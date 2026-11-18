'use strict';
const WorkingHours = require('./working_hours.model');
const Organization = require('../organizations/organizations.model');

function makeError(message, status) {
  return Object.assign(new Error(message), { status });
}

async function list(organizationId) {
  const org = await Organization.findByPk(organizationId);
  if (!org) throw makeError('Organization not found', 404);
  return WorkingHours.findAll({ where: { organizationId }, order: [['name', 'ASC']] });
}

async function getById(organizationId, id) {
  const item = await WorkingHours.findOne({ where: { id, organizationId } });
  if (!item) throw makeError('Working hours record not found', 404);
  return item;
}

async function create(organizationId, { name, startTime, endTime, breakMinutes = 0, status = 'active' }) {
  const org = await Organization.findByPk(organizationId);
  if (!org) throw makeError('Organization not found', 404);
  return WorkingHours.create({ organizationId, name: name.trim(), startTime, endTime, breakMinutes, status });
}

async function update(organizationId, id, { name, startTime, endTime, breakMinutes, status }) {
  const item = await WorkingHours.findOne({ where: { id, organizationId } });
  if (!item) throw makeError('Working hours record not found', 404);
  const fields = {};
  if (name !== undefined) fields.name = name.trim();
  if (startTime !== undefined) fields.startTime = startTime;
  if (endTime !== undefined) fields.endTime = endTime;
  if (breakMinutes !== undefined) fields.breakMinutes = breakMinutes;
  if (status !== undefined) fields.status = status;
  await item.update(fields);
  return item;
}

async function updateStatus(organizationId, id, status) {
  const item = await WorkingHours.findOne({ where: { id, organizationId } });
  if (!item) throw makeError('Working hours record not found', 404);
  await item.update({ status });
  return item;
}

async function remove(organizationId, id) {
  const item = await WorkingHours.findOne({ where: { id, organizationId } });
  if (!item) throw makeError('Working hours record not found', 404);
  await item.destroy();
  return { id };
}

module.exports = { list, getById, create, update, updateStatus, remove };
