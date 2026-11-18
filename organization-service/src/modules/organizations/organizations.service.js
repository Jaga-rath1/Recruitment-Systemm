'use strict';
const { Op } = require('sequelize');
const Organization = require('./organizations.model');

function makeError(message, status) {
  return Object.assign(new Error(message), { status });
}

async function list({ search, status, page = 1, limit = 50 } = {}) {
  const where = {};
  if (status) where.status = status;
  if (search) {
    where[Op.or] = [
      { name: { [Op.iLike]: `%${search}%` } },
      { code: { [Op.iLike]: `%${search}%` } },
      { email: { [Op.iLike]: `%${search}%` } },
    ];
  }
  const p = Math.max(1, parseInt(page) || 1);
  const l = Math.min(200, Math.max(1, parseInt(limit) || 50));
  const { count, rows } = await Organization.findAndCountAll({
    where, limit: l, offset: (p - 1) * l, order: [['name', 'ASC']],
  });
  return { data: rows, pagination: { page: p, limit: l, total: count, totalPages: Math.ceil(count / l) } };
}

async function getById(id) {
  const org = await Organization.findByPk(id);
  if (!org) throw makeError('Organization not found', 404);
  return org;
}

async function create({ name, code, email, phone, address, city, state, country, timezone, status = 'active' }) {
  const existing = await Organization.findOne({ where: { code } });
  if (existing) throw makeError(`Organization with code '${code}' already exists`, 409);
  return Organization.create({ name: name.trim(), code: code.trim(), email: email || null, phone: phone || null, address: address || null, city: city || null, state: state || null, country: country || null, timezone: timezone || null, status });
}

async function update(id, { name, code, email, phone, address, city, state, country, timezone }) {
  const org = await Organization.findByPk(id);
  if (!org) throw makeError('Organization not found', 404);
  if (code !== undefined && code !== org.code) {
    const existing = await Organization.findOne({ where: { code, id: { [Op.ne]: id } } });
    if (existing) throw makeError(`Organization with code '${code}' already exists`, 409);
  }
  const fields = {};
  if (name !== undefined) fields.name = name.trim();
  if (code !== undefined) fields.code = code.trim();
  if (email !== undefined) fields.email = email || null;
  if (phone !== undefined) fields.phone = phone || null;
  if (address !== undefined) fields.address = address || null;
  if (city !== undefined) fields.city = city || null;
  if (state !== undefined) fields.state = state || null;
  if (country !== undefined) fields.country = country || null;
  if (timezone !== undefined) fields.timezone = timezone || null;
  await org.update(fields);
  return org;
}

async function updateStatus(id, status) {
  const org = await Organization.findByPk(id);
  if (!org) throw makeError('Organization not found', 404);
  await org.update({ status });
  return org;
}

module.exports = { list, getById, create, update, updateStatus };
