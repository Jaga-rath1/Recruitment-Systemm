'use strict';
const { Op } = require('sequelize');
const Plan = require('./plans.model');
const Subscription = require('../subscriptions/subscriptions.model');

function makeError(message, status) {
  return Object.assign(new Error(message), { status });
}

async function list() {
  return Plan.findAll({ order: [['name', 'ASC']] });
}

async function getById(id) {
  const plan = await Plan.findByPk(id);
  if (!plan) throw makeError('Plan not found', 404);
  return plan;
}

async function create({ name, code, description, price = 0, billingCycle, trialDays = 0, status = 'active' }) {
  const existing = await Plan.findOne({ where: { code } });
  if (existing) throw makeError(`Plan with code '${code}' already exists`, 409);
  return Plan.create({ name: name.trim(), code: code.trim(), description: description || null, price, billingCycle, trialDays, status });
}

async function update(id, { name, code, description, price, billingCycle, trialDays }) {
  const plan = await Plan.findByPk(id);
  if (!plan) throw makeError('Plan not found', 404);
  if (code !== undefined && code !== plan.code) {
    const existing = await Plan.findOne({ where: { code, id: { [Op.ne]: id } } });
    if (existing) throw makeError(`Plan with code '${code}' already exists`, 409);
  }
  const fields = {};
  if (name !== undefined) fields.name = name.trim();
  if (code !== undefined) fields.code = code.trim();
  if (description !== undefined) fields.description = description;
  if (price !== undefined) fields.price = price;
  if (billingCycle !== undefined) fields.billingCycle = billingCycle;
  if (trialDays !== undefined) fields.trialDays = trialDays;
  await plan.update(fields);
  return plan;
}

async function updateStatus(id, status) {
  const plan = await Plan.findByPk(id);
  if (!plan) throw makeError('Plan not found', 404);
  if (status === 'inactive') {
    const activeCount = await Subscription.count({
      where: { planId: id, status: { [Op.in]: ['active', 'trial'] } },
    });
    if (activeCount > 0) throw makeError('Cannot deactivate plan: it has active or trial subscriptions', 409);
  }
  await plan.update({ status });
  return plan;
}

module.exports = { list, getById, create, update, updateStatus };
