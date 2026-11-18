'use strict';
const service = require('./submodules.service');
const { validateCreate, validateUpdate, validateStatus } = require('./submodules.validation');

async function list(req, res, next) {
  try {
    const data = await service.list(req.query);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function getById(req, res, next) {
  try {
    const data = await service.getById(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const error = validateCreate(req.body);
    if (error) return res.status(400).json({ success: false, message: error });
    const data = await service.create(req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const error = validateUpdate(req.body);
    if (error) return res.status(400).json({ success: false, message: error });
    const data = await service.update(req.params.id, req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function updateStatus(req, res, next) {
  try {
    const error = validateStatus(req.body);
    if (error) return res.status(400).json({ success: false, message: error });
    const data = await service.updateStatus(req.params.id, req.body.status);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

module.exports = { list, getById, create, update, updateStatus };
