'use strict';
const { Op } = require('sequelize');
const Shift = require('./shifts.model');
const Organization = require('../organizations/organizations.model');

function makeError(message, status) {
  return Object.assign(new Error(message), { status });
}

async function list(organizationId) {
  const org = await Organization.findByPk(organizationId);
  if (!org) throw makeError('Organization not found', 404);
  return Shift.findAll({ where: { organizationId }, order: [['name', 'ASC']] });
}

async function getById(organizationId, id) {
  const item = await Shift.findOne({ where: { id, organizationId } });
  if (!item) throw makeError('Shift not found', 404);
  return item;
}

async function create(organizationId, { name, code, startTime, endTime, status = 'active' }) {
  const org = await Organization.findByPk(organizationId);
  if (!org) throw makeError('Organization not found', 404);
  const existing = await Shift.findOne({ where: { organizationId, code } });
  if (existing) throw makeError(`Shift with code '${code}' already exists in this organization`, 409);
  return Shift.create({ organizationId, name: name.trim(), code: code.trim(), startTime, endTime, status });
}

async function update(organizationId, id, { name, code, startTime, endTime, status }) {
  const item = await Shift.findOne({ where: { id, organizationId } });
  if (!item) throw makeError('Shift not found', 404);
  if (code !== undefined && code !== item.code) {
    const existing = await Shift.findOne({ where: { organizationId, code, id: { [Op.ne]: id } } });
    if (existing) throw makeError(`Shift with code '${code}' already exists in this organization`, 409);
  }
  const fields = {};
  if (name !== undefined) fields.name = name.trim();
  if (code !== undefined) fields.code = code.trim();
  if (startTime !== undefined) fields.startTime = startTime;
  if (endTime !== undefined) fields.endTime = endTime;
  if (status !== undefined) fields.status = status;
  await item.update(fields);
  return item;
}

async function updateStatus(organizationId, id, status) {
  const item = await Shift.findOne({ where: { id, organizationId } });
  if (!item) throw makeError('Shift not found', 404);
  await item.update({ status });
  return item;
}

async function remove(organizationId, id) {
  const item = await Shift.findOne({ where: { id, organizationId } });
  if (!item) throw makeError('Shift not found', 404);
  await item.destroy();
  return { id };
}

module.exports = { list, getById, create, update, updateStatus, remove };
