'use strict';
const PlanSubmodule = require('./plan_submodules.model');
const Plan = require('../plans/plans.model');
const Submodule = require('../submodules/submodules.model');
const PlanModule = require('../plan_modules/plan_modules.model');

function makeError(message, status) {
  return Object.assign(new Error(message), { status });
}

async function listForPlan(planId) {
  const plan = await Plan.findByPk(planId);
  if (!plan) throw makeError('Plan not found', 404);
  const rows = await PlanSubmodule.findAll({
    where: { planId },
    include: [{ model: Submodule, as: 'submodule' }],
    order: [['created_at', 'ASC']],
  });
  return rows.map((r) => r.submodule);
}

async function addSubmodule(planId, submoduleId) {
  const plan = await Plan.findByPk(planId);
  if (!plan) throw makeError('Plan not found', 404);
  if (plan.status === 'inactive') throw makeError('Cannot add submodules to an inactive plan', 409);

  const sub = await Submodule.findByPk(submoduleId);
  if (!sub) throw makeError('Submodule not found', 404);
  if (sub.status === 'inactive') throw makeError('Cannot assign an inactive submodule to a plan', 409);

  const parent = await PlanModule.findOne({ where: { planId, moduleId: sub.moduleId } });
  if (!parent) throw makeError('Add the parent module to this plan before its submodules', 409);

  const existing = await PlanSubmodule.findOne({ where: { planId, submoduleId } });
  if (existing) throw makeError('Submodule is already assigned to this plan', 409);

  return PlanSubmodule.create({ planId, submoduleId });
}

async function removeSubmodule(planId, submoduleId) {
  const plan = await Plan.findByPk(planId);
  if (!plan) throw makeError('Plan not found', 404);
  const row = await PlanSubmodule.findOne({ where: { planId, submoduleId } });
  if (!row) throw makeError('Submodule is not assigned to this plan', 404);
  await row.destroy();
}

module.exports = { listForPlan, addSubmodule, removeSubmodule };
