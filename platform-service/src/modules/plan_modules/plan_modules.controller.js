'use strict';
const service = require('./plan_modules.service');

const listModulesForPlan = async (req, res, next) => {
  try {
    const data = await service.listModulesForPlan(req.params.planId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

const addModule = async (req, res, next) => {
  try {
    const { moduleId } = req.body;
    if (!moduleId) return res.status(400).json({ success: false, message: 'moduleId is required' });
    const data = await service.addModule(req.params.planId, moduleId);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
};

const removeModule = async (req, res, next) => {
  try {
    await service.removeModule(req.params.planId, req.params.moduleId);
    res.json({ success: true, message: 'Module removed from plan' });
  } catch (err) { next(err); }
};

module.exports = { listModulesForPlan, addModule, removeModule };
