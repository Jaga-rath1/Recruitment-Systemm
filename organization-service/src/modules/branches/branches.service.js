'use strict';
const { Op } = require('sequelize');
const Branch = require('./branches.model');
const Organization = require('../organizations/organizations.model');

function makeError(message, status) {
  return Object.assign(new Error(message), { status });
}

async function ensureOrg(organizationId) {
  const org = await Organization.findByPk(organizationId);
  if (!org) throw makeError('Organization not found', 404);
  return org;
}

async function list(organizationId) {
  await ensureOrg(organizationId);
  return Branch.findAll({ where: { organizationId }, order: [['name', 'ASC']] });
}

async function getById(organizationId, id) {
  const branch = await Branch.findOne({ where: { id, organizationId } });
  if (!branch) throw makeError('Branch not found', 404);
  return branch;
}

async function create(organizationId, { name, code, address, city, state, country, status = 'active' }) {
  await ensureOrg(organizationId);
  const existing = await Branch.findOne({ where: { organizationId, code } });
  if (existing) throw makeError(`Branch with code '${code}' already exists in this organization`, 409);
  return Branch.create({ organizationId, name: name.trim(), code: code.trim(), address: address || null, city: city || null, state: state || null, country: country || null, status });
}

async function update(organizationId, id, { name, code, address, city, state, country, status }) {
  const branch = await Branch.findOne({ where: { id, organizationId } });
  if (!branch) throw makeError('Branch not found', 404);
  if (code !== undefined && code !== branch.code) {
    const existing = await Branch.findOne({ where: { organizationId, code, id: { [Op.ne]: id } } });
    if (existing) throw makeError(`Branch with code '${code}' already exists in this organization`, 409);
  }
  const fields = {};
  if (name !== undefined) fields.name = name.trim();
  if (code !== undefined) fields.code = code.trim();
  if (address !== undefined) fields.address = address || null;
  if (city !== undefined) fields.city = city || null;
  if (state !== undefined) fields.state = state || null;
  if (country !== undefined) fields.country = country || null;
  if (status !== undefined) fields.status = status;
  await branch.update(fields);
  return branch;
}

async function updateStatus(organizationId, id, status) {
  const branch = await Branch.findOne({ where: { id, organizationId } });
  if (!branch) throw makeError('Branch not found', 404);
  await branch.update({ status });
  return branch;
}

async function remove(organizationId, id) {
  const branch = await Branch.findOne({ where: { id, organizationId } });
  if (!branch) throw makeError('Branch not found', 404);
  await branch.destroy();
}

module.exports = { list, getById, create, update, updateStatus, remove };
