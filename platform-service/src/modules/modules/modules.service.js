'use strict';
const { Op } = require('sequelize');
const Module = require('./modules.model');

function makeError(message, status) {
  return Object.assign(new Error(message), { status });
}

// Codes the HRMS services check before serving a request (see the catalog seed migration).
const ENFORCED_CODES = ['HRMS', 'EMPLOYEES', 'ATTENDANCE', 'LEAVE', 'TIMESHEET'];

async function list() {
  return Module.findAll({ order: [['name', 'ASC']] });
}

async function getById(id) {
  const mod = await Module.findByPk(id);
  if (!mod) throw makeError('Module not found', 404);
  return mod;
}

async function create({ name, code, description, status = 'active' }) {
  const existing = await Module.findOne({ where: { code } });
  if (existing) throw makeError(`Module with code '${code}' already exists`, 409);
  return Module.create({ name: name.trim(), code: code.trim(), description: description || null, status });
}

async function update(id, { name, code, description }) {
  const mod = await Module.findByPk(id);
  if (!mod) throw makeError('Module not found', 404);
  if (code !== undefined && code !== mod.code) {
    if (ENFORCED_CODES.includes(mod.code)) {
      throw makeError(`The code '${mod.code}' is used for access control and cannot be changed`, 409);
    }
    const existing = await Module.findOne({ where: { code, id: { [Op.ne]: id } } });
    if (existing) throw makeError(`Module with code '${code}' already exists`, 409);
  }
  const fields = {};
  if (name !== undefined) fields.name = name.trim();
  if (code !== undefined) fields.code = code.trim();
  if (description !== undefined) fields.description = description;
  await mod.update(fields);
  return mod;
}

async function updateStatus(id, status) {
  const mod = await Module.findByPk(id);
  if (!mod) throw makeError('Module not found', 404);
  await mod.update({ status });
  return mod;
}

module.exports = { list, getById, create, update, updateStatus };
