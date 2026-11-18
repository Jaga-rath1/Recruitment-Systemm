'use strict';
const { Op } = require('sequelize');
const Department = require('./departments.model');
const Organization = require('../organizations/organizations.model');

function makeError(message, status) {
  return Object.assign(new Error(message), { status });
}

async function list(organizationId) {
  const org = await Organization.findByPk(organizationId);
  if (!org) throw makeError('Organization not found', 404);
  return Department.findAll({ where: { organizationId }, order: [['name', 'ASC']] });
}

async function getById(organizationId, id) {
  const dept = await Department.findOne({ where: { id, organizationId } });
  if (!dept) throw makeError('Department not found', 404);
  return dept;
}

async function create(organizationId, { name, code, description, parentDepartmentId, status = 'active' }) {
  const org = await Organization.findByPk(organizationId);
  if (!org) throw makeError('Organization not found', 404);
  const existing = await Department.findOne({ where: { organizationId, code } });
  if (existing) throw makeError(`Department with code '${code}' already exists in this organization`, 409);
  if (parentDepartmentId) {
    const parent = await Department.findOne({ where: { id: parentDepartmentId, organizationId } });
    if (!parent) throw makeError('Parent department not found in this organization', 404);
  }
  return Department.create({ organizationId, name: name.trim(), code: code.trim(), description: description || null, parentDepartmentId: parentDepartmentId || null, status });
}

async function update(organizationId, id, { name, code, description, parentDepartmentId, status }) {
  const dept = await Department.findOne({ where: { id, organizationId } });
  if (!dept) throw makeError('Department not found', 404);
  if (code !== undefined && code !== dept.code) {
    const existing = await Department.findOne({ where: { organizationId, code, id: { [Op.ne]: id } } });
    if (existing) throw makeError(`Department with code '${code}' already exists in this organization`, 409);
  }
  if (parentDepartmentId !== undefined && parentDepartmentId !== null) {
    if (parentDepartmentId === id) throw makeError('A department cannot be its own parent', 400);
    const parent = await Department.findOne({ where: { id: parentDepartmentId, organizationId } });
    if (!parent) throw makeError('Parent department not found in this organization', 404);
  }
  const fields = {};
  if (name !== undefined) fields.name = name.trim();
  if (code !== undefined) fields.code = code.trim();
  if (description !== undefined) fields.description = description || null;
  if (parentDepartmentId !== undefined) fields.parentDepartmentId = parentDepartmentId || null;
  if (status !== undefined) fields.status = status;
  await dept.update(fields);
  return dept;
}

async function updateStatus(organizationId, id, status) {
  const dept = await Department.findOne({ where: { id, organizationId } });
  if (!dept) throw makeError('Department not found', 404);
  await dept.update({ status });
  return dept;
}

async function remove(organizationId, id) {
  const dept = await Department.findOne({ where: { id, organizationId } });
  if (!dept) throw makeError('Department not found', 404);
  await dept.destroy();
}

module.exports = { list, getById, create, update, updateStatus, remove };
