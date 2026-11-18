'use strict';
const service = require('./plan_submodules.service');

async function listForPlan(req, res, next) {
  try {
    const data = await service.listForPlan(req.params.planId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function addSubmodule(req, res, next) {
  try {
    const { submoduleId } = req.body;
    if (!submoduleId) return res.status(400).json({ success: false, message: 'submoduleId is required' });
    const data = await service.addSubmodule(req.params.planId, submoduleId);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

async function removeSubmodule(req, res, next) {
  try {
    await service.removeSubmodule(req.params.planId, req.params.submoduleId);
    res.json({ success: true, message: 'Submodule removed from plan' });
  } catch (err) { next(err); }
}

module.exports = { listForPlan, addSubmodule, removeSubmodule };
