'use strict';
const sequelize = require('../config/database');
const Module = require('../modules/modules/modules.model');
const Plan = require('../modules/plans/plans.model');
const PlanModule = require('../modules/plan_modules/plan_modules.model');
const Subscription = require('../modules/subscriptions/subscriptions.model');
const Submodule = require('../modules/submodules/submodules.model');
const PlanSubmodule = require('../modules/plan_submodules/plan_submodules.model');

// Plan ↔ Module (many-to-many through plan_modules)
Plan.belongsToMany(Module, { through: PlanModule, foreignKey: 'planId', otherKey: 'moduleId', as: 'modules' });
Module.belongsToMany(Plan, { through: PlanModule, foreignKey: 'moduleId', otherKey: 'planId', as: 'plans' });
PlanModule.belongsTo(Plan, { foreignKey: 'planId', as: 'plan' });
PlanModule.belongsTo(Module, { foreignKey: 'moduleId', as: 'module' });

// Module → Submodule (one-to-many)
Module.hasMany(Submodule, { foreignKey: 'moduleId', as: 'submodules' });
Submodule.belongsTo(Module, { foreignKey: 'moduleId', as: 'module' });

// Plan ↔ Submodule (many-to-many through plan_submodules)
Plan.belongsToMany(Submodule, { through: PlanSubmodule, foreignKey: 'planId', otherKey: 'submoduleId', as: 'submodules' });
Submodule.belongsToMany(Plan, { through: PlanSubmodule, foreignKey: 'submoduleId', otherKey: 'planId', as: 'plans' });
PlanSubmodule.belongsTo(Plan, { foreignKey: 'planId', as: 'plan' });
PlanSubmodule.belongsTo(Submodule, { foreignKey: 'submoduleId', as: 'submodule' });

// Subscription → Plan
Subscription.belongsTo(Plan, { foreignKey: 'planId', as: 'plan' });
Plan.hasMany(Subscription, { foreignKey: 'planId', as: 'subscriptions' });

module.exports = { sequelize, Module, Plan, PlanModule, Subscription, Submodule, PlanSubmodule };
