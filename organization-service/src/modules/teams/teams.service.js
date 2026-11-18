'use strict';
const { Op } = require('sequelize');
const Team = require('./teams.model');
const Department = require('../departments/departments.model');
const Organization = require('../organizations/organizations.model');

function makeError(message, status) {
  return Object.assign(new Error(message), { status });
}

const withDepartment = [{ model: Department, as: 'department', attributes: ['id', 'name', 'code'] }];

async function assertDepartment(organizationId, departmentId) {
  if (!departmentId) return;
  const dept = await Department.findOne({ where: { id: departmentId, organizationId } });
  if (!dept) throw makeError('Department not found in this organization', 404);
}

async function list(organizationId, { departmentId } = {}) {
  const org = await Organization.findByPk(organizationId);
  if (!org) throw makeError('Organization not found', 404);
  const where = { organizationId };
  if (departmentId) where.departmentId = departmentId;
  return Team.findAll({ where, include: withDepartment, order: [['name', 'ASC']] });
}

async function getById(organizationId, id) {
  const team = await Team.findOne({ where: { id, organizationId }, include: withDepartment });
  if (!team) throw makeError('Team not found', 404);
  return team;
}

async function create(organizationId, { name, code, description, departmentId, leadEmployeeId, status = 'active' }) {
  const org = await Organization.findByPk(organizationId);
  if (!org) throw makeError('Organization not found', 404);
  const existing = await Team.findOne({ where: { organizationId, code: code.trim() } });
  if (existing) throw makeError(`Team with code '${code}' already exists in this organization`, 409);
  await assertDepartment(organizationId, departmentId);
  const team = await Team.create({
    organizationId,
    name: name.trim(),
    code: code.trim(),
    description: description || null,
    departmentId: departmentId || null,
    leadEmployeeId: leadEmployeeId || null,
    status,
  });
  return getById(organizationId, team.id);
}

async function update(organizationId, id, { name, code, description, departmentId, leadEmployeeId, status }) {
  const team = await Team.findOne({ where: { id, organizationId } });
  if (!team) throw makeError('Team not found', 404);
  if (code !== undefined && code.trim() !== team.code) {
    const existing = await Team.findOne({ where: { organizationId, code: code.trim(), id: { [Op.ne]: id } } });
    if (existing) throw makeError(`Team with code '${code}' already exists in this organization`, 409);
  }
  if (departmentId) await assertDepartment(organizationId, departmentId);
  const fields = {};
  if (name !== undefined) fields.name = name.trim();
  if (code !== undefined) fields.code = code.trim();
  if (description !== undefined) fields.description = description || null;
  if (departmentId !== undefined) fields.departmentId = departmentId || null;
  if (leadEmployeeId !== undefined) fields.leadEmployeeId = leadEmployeeId || null;
  if (status !== undefined) fields.status = status;
  await team.update(fields);
  return getById(organizationId, id);
}

async function updateStatus(organizationId, id, status) {
  const team = await Team.findOne({ where: { id, organizationId } });
  if (!team) throw makeError('Team not found', 404);
  await team.update({ status });
  return team;
}

async function remove(organizationId, id) {
  const team = await Team.findOne({ where: { id, organizationId } });
  if (!team) throw makeError('Team not found', 404);
  await team.destroy();
  return { id };
}

module.exports = { list, getById, create, update, updateStatus, remove };
