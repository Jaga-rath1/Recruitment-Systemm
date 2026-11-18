'use strict';
const { Op } = require('sequelize');
const Subscription = require('./subscriptions.model');
const Plan = require('../plans/plans.model');

function makeError(message, status) {
  return Object.assign(new Error(message), { status });
}

const ACTIVE_STATUSES = ['active', 'trial'];
const DEFAULT_TRIAL_DAYS = 14;

async function list({ status, organizationId } = {}) {
  const where = {};
  if (status) where.status = status;
  if (organizationId) where.organizationId = organizationId;
  return Subscription.findAll({
    where,
    include: [{ model: Plan, as: 'plan', attributes: ['id', 'name', 'code', 'billingCycle', 'price'] }],
    order: [['created_at', 'DESC']],
  });
}

async function getById(id) {
  const sub = await Subscription.findByPk(id, { include: [{ model: Plan, as: 'plan' }] });
  if (!sub) throw makeError('Subscription not found', 404);
  return sub;
}

async function getByOrganizationId(organizationId) {
  const sub = await Subscription.findOne({
    where: { organizationId, status: { [Op.in]: ACTIVE_STATUSES } },
    include: [{ model: Plan, as: 'plan' }],
    order: [['created_at', 'DESC']],
  });
  if (!sub) throw makeError('No active subscription found for this organization', 404);
  return sub;
}

async function create({ organizationId, planId, status = 'active', startsAt, endsAt, trialEndsAt }) {
  const plan = await Plan.findByPk(planId);
  if (!plan) throw makeError('Plan not found', 404);
  if (plan.status !== 'active') throw makeError('Cannot create subscription for an inactive plan', 409);

  const existing = await Subscription.findOne({ where: { organizationId, status: { [Op.in]: ACTIVE_STATUSES } } });
  if (existing) throw makeError('Organization already has an active or trial subscription', 409);

  const start = new Date(startsAt);
  let trialEnd = null;
  if (status === 'trial') {
    // A trial always has an end: the given date, else the plan's trial length.
    trialEnd = trialEndsAt ? new Date(trialEndsAt) : new Date(start.getTime() + (plan.trialDays > 0 ? plan.trialDays : DEFAULT_TRIAL_DAYS) * 86400000);
    if (trialEnd <= start) throw makeError('trialEndsAt must be after startsAt', 400);
  }

  return Subscription.create({ organizationId, planId, status, startsAt: start, endsAt: endsAt ? new Date(endsAt) : null, trialEndsAt: trialEnd });
}

async function update(id, { status, endsAt, trialEndsAt }) {
  const sub = await Subscription.findByPk(id);
  if (!sub) throw makeError('Subscription not found', 404);

  if (status !== undefined) {
    const current = sub.status;
    // Allowed transitions
    const allowed = {
      trial: ['active', 'cancelled', 'expired'],
      active: ['cancelled', 'expired'],
      expired: [],
      cancelled: [],
    };
    if (status === current) throw makeError(`Subscription is already '${current}'`, 409);
    if (!allowed[current].includes(status)) {
      throw makeError(`Cannot transition subscription from '${current}' to '${status}'`, 409);
    }
  }

  const fields = {};
  if (status !== undefined) fields.status = status;
  if (endsAt !== undefined) {
    const end = new Date(endsAt);
    if (sub.startsAt && end <= sub.startsAt) throw makeError('endsAt must be after startsAt', 400);
    fields.endsAt = end;
  }
  if (trialEndsAt !== undefined) fields.trialEndsAt = new Date(trialEndsAt);

  await sub.update(fields);
  return sub;
}

module.exports = { list, getById, getByOrganizationId, create, update };
