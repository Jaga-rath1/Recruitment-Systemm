'use strict';
const service = require('./branches.service');
const { validateCreate, validateUpdate, validateStatus } = require('./branches.validation');

const list = async (req, res, next) => {
  try {
    const data = await service.list(req.params.organizationId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

const getById = async (req, res, next) => {
  try {
    const data = await service.getById(req.params.organizationId, req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

const create = async (req, res, next) => {
  try {
    const error = validateCreate(req.body);
    if (error) return res.status(400).json({ success: false, message: error });
    const data = await service.create(req.params.organizationId, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    const error = validateUpdate(req.body);
    if (error) return res.status(400).json({ success: false, message: error });
    const data = await service.update(req.params.organizationId, req.params.id, req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

const updateStatus = async (req, res, next) => {
  try {
    const error = validateStatus(req.body);
    if (error) return res.status(400).json({ success: false, message: error });
    const data = await service.updateStatus(req.params.organizationId, req.params.id, req.body.status);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

const remove = async (req, res, next) => {
  try {
    await service.remove(req.params.organizationId, req.params.id);
    res.json({ success: true, message: 'Branch deleted' });
  } catch (err) { next(err); }
};

module.exports = { list, getById, create, update, updateStatus, remove };
