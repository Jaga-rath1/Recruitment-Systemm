'use strict';
const Submodule = require('./submodules.model');
const Module = require('../modules/modules.model');

function makeError(message, status) {
  return Object.assign(new Error(message), { status });
}

// Codes the HRMS services check before serving a request (see the catalog seed migration).
const ENFORCED_CODES = ['HRMS', 'EMPLOYEES', 'ATTENDANCE', 'LEAVE', 'TIMESHEET'];

async function list(query = {}) {
  const where = {};
  if (query.moduleId) where.moduleId = query.moduleId;
  if (query.status) where.status = query.status;
  return Submodule.findAll({ where, order: [['created_at', 'ASC']] });
}

async function getById(id) {
  const sub = await Submodule.findByPk(id);
  if (!sub) throw makeError('Submodule not found', 404);
  return sub;
}

async function create({ moduleId, name, code, description }) {
  const mod = await Module.findByPk(moduleId);
  if (!mod) throw makeError('Module not found', 404);

  const existing = await Submodule.findOne({ where: { moduleId, code } });
  if (existing) throw makeError('A submodule with this code already exists in this module', 409);

  return Submodule.create({ moduleId, name, code, description: description || null });
}

async function update(id, body) {
  const sub = await getById(id);
  if (body.code && body.code !== sub.code) {
    if (ENFORCED_CODES.includes(sub.code)) {
      throw makeError(`The code '${sub.code}' is used for access control and cannot be changed`, 409);
    }
    const dup = await Submodule.findOne({ where: { moduleId: sub.moduleId, code: body.code } });
    if (dup) throw makeError('A submodule with this code already exists in this module', 409);
  }
  const { name, code, description } = body;
  await sub.update({
    name: name ?? sub.name,
    code: code ?? sub.code,
    description: description ?? sub.description,
  });
  return sub;
}

async function updateStatus(id, status) {
  if (!['active', 'inactive'].includes(status)) throw makeError('Invalid status', 400);
  const sub = await getById(id);
  await sub.update({ status });
  return sub;
}

module.exports = { list, getById, create, update, updateStatus };
