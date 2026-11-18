'use strict';
const Subscription = require('../subscriptions/subscriptions.model');
const Plan = require('../plans/plans.model');
const subscriptions = require('../subscriptions/subscriptions.service');

function makeError(message, status) {
  return Object.assign(new Error(message), { status });
}

// A trial is a subscription in status "trial": that is what entitlements read.
// These endpoints are a trial-shaped view over subscriptions so there is one
// source of truth for what an organization can use.
const TRIAL_OUTCOMES = { converted: 'active', cancelled: 'cancelled', expired: 'expired' };

async function getByOrganizationId(organizationId) {
  const trial = await Subscription.findOne({
    where: { organizationId, status: 'trial' },
    include: [{ model: Plan, as: 'plan' }],
    order: [['created_at', 'DESC']],
  });
  if (!trial) throw makeError('No active trial found for this organization', 404);
  return trial;
}

/** Starts a trial. Its length follows the plan's trialDays unless endsAt is given. */
function create({ organizationId, planId, startsAt, endsAt }) {
  return subscriptions.create({ organizationId, planId, status: 'trial', startsAt, trialEndsAt: endsAt });
}

/** Ends a trial: converted (becomes an active subscription), cancelled or expired. */
async function updateStatus(id, outcome) {
  const trial = await Subscription.findByPk(id);
  if (!trial) throw makeError('Trial not found', 404);
  if (trial.status !== 'trial') throw makeError(`This subscription is not a trial (it is '${trial.status}')`, 409);
  return subscriptions.update(id, { status: TRIAL_OUTCOMES[outcome] });
}

module.exports = { getByOrganizationId, create, updateStatus, TRIAL_OUTCOMES };
