'use strict';
const PlanModule = require('./plan_modules.model');
const Plan = require('../plans/plans.model');
const Module = require('../modules/modules.model');
const PlanSubmodule = require('../plan_submodules/plan_submodules.model');
const Submodule = require('../submodules/submodules.model');

function makeError(message, status) {
  return Object.assign(new Error(message), { status });
}

async function listModulesForPlan(planId) {
  const plan = await Plan.findByPk(planId);
  if (!plan) throw makeError('Plan not found', 404);
  const rows = await PlanModule.findAll({
    where: { planId },
    include: [{ model: Module, as: 'module' }],
    order: [['created_at', 'ASC']],
  });
  return rows.map((r) => r.module);
}

async function addModule(planId, moduleId) {
  const plan = await Plan.findByPk(planId);
  if (!plan) throw makeError('Plan not found', 404);
  if (plan.status === 'inactive') throw makeError('Cannot add modules to an inactive plan', 409);

  const mod = await Module.findByPk(moduleId);
  if (!mod) throw makeError('Module not found', 404);
  if (mod.status === 'inactive') throw makeError('Cannot assign an inactive module to a plan', 409);

  const existing = await PlanModule.findOne({ where: { planId, moduleId } });
  if (existing) throw makeError('Module is already assigned to this plan', 409);

  return PlanModule.create({ planId, moduleId });
}

async function removeModule(planId, moduleId) {
  const plan = await Plan.findByPk(planId);
  if (!plan) throw makeError('Plan not found', 404);

  const row = await PlanModule.findOne({ where: { planId, moduleId } });
  if (!row) throw makeError('Module is not assigned to this plan', 404);

  // A plan cannot keep the submodules of a module it no longer includes.
  const subs = await Submodule.findAll({ where: { moduleId }, attributes: ['id'] });
  if (subs.length) {
    await PlanSubmodule.destroy({ where: { planId, submoduleId: subs.map((s) => s.id) } });
  }
  await row.destroy();
}

module.exports = { listModulesForPlan, addModule, removeModule };
