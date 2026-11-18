'use strict';
const { Op } = require('sequelize');
const Subscription = require('../subscriptions/subscriptions.model');
const Plan = require('../plans/plans.model');
const PlanModule = require('../plan_modules/plan_modules.model');
const PlanSubmodule = require('../plan_submodules/plan_submodules.model');
const Module = require('../modules/modules.model');
const Submodule = require('../submodules/submodules.model');
const { getOrganizationStatus } = require('../../clients/organizationClient');

/**
 * Resolve what an organization can use RIGHT NOW based on its subscription/plan.
 * Rules:
 *  - the organization itself must be active
 *  - must have a subscription in status 'active' or 'trial'
 *  - an active subscription must not be past ends_at; a trial must not be past trial_ends_at
 *  - plan must be active
 *  - only active modules/submodules are returned
 *
 * `features` is the flat list of entitled module and submodule codes (upper-case)
 * that the HRMS services check before serving a request.
 */
async function resolveForOrg(organizationId) {
  const base = {
    organizationId,
    active: false,
    reason: null,
    subscription: null,
    modules: [],
    features: [],
  };

  const orgStatus = await getOrganizationStatus(organizationId);
  if (orgStatus === 'not_found') return { ...base, reason: 'organization_not_found' };
  if (orgStatus === 'inactive') return { ...base, reason: 'organization_inactive' };

  const sub = await Subscription.findOne({
    where: { organizationId, status: { [Op.in]: ['active', 'trial'] } },
    include: [{ model: Plan, as: 'plan' }],
    order: [['created_at', 'DESC']],
  });
  if (!sub) return { ...base, reason: 'no_subscription' };

  const now = new Date();
  const periodEnd = sub.status === 'trial' ? (sub.trialEndsAt || sub.endsAt) : sub.endsAt;
  const expired = !!periodEnd && new Date(periodEnd) < now;
  const planActive = !!sub.plan && sub.plan.status === 'active';

  base.subscription = {
    id: sub.id,
    status: sub.status,
    startsAt: sub.startsAt,
    endsAt: sub.endsAt,
    trialEndsAt: sub.trialEndsAt,
    expired,
    plan: sub.plan ? { id: sub.plan.id, code: sub.plan.code, name: sub.plan.name, status: sub.plan.status } : null,
  };

  if (expired) return { ...base, reason: sub.status === 'trial' ? 'trial_expired' : 'subscription_expired' };
  if (!planActive) return { ...base, reason: 'plan_inactive' };

  base.active = true;
  const planId = sub.plan.id;

  const [planMods, planSubs] = await Promise.all([
    PlanModule.findAll({ where: { planId }, include: [{ model: Module, as: 'module' }] }),
    PlanSubmodule.findAll({ where: { planId }, include: [{ model: Submodule, as: 'submodule' }] }),
  ]);

  const activeModules = planMods.map((p) => p.module).filter((m) => m && m.status === 'active');
  const activeSubs = planSubs.map((p) => p.submodule).filter((s) => s && s.status === 'active');

  base.modules = activeModules.map((m) => ({
    id: m.id,
    code: m.code,
    name: m.name,
    submodules: activeSubs
      .filter((s) => s.moduleId === m.id)
      .map((s) => ({ id: s.id, code: s.code, name: s.name })),
  }));

  const features = new Set();
  for (const m of base.modules) {
    features.add(m.code.toUpperCase());
    for (const s of m.submodules) features.add(s.code.toUpperCase());
  }
  base.features = [...features];

  return base;
}

module.exports = { resolveForOrg };
