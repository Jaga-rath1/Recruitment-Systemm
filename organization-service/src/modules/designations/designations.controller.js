'use strict';
const service = require('./designations.service');
const { validateCreate, validateUpdate, validateStatus } = require('./designations.validation');

const list = async (req, res, next) => {
  try { res.json({ success: true, data: await service.list(req.params.organizationId) }); } catch (err) { next(err); }
};
const getById = async (req, res, next) => {
  try { res.json({ success: true, data: await service.getById(req.params.organizationId, req.params.id) }); } catch (err) { next(err); }
};
const create = async (req, res, next) => {
  try {
    const error = validateCreate(req.body);
    if (error) return res.status(400).json({ success: false, message: error });
    res.status(201).json({ success: true, data: await service.create(req.params.organizationId, req.body) });
  } catch (err) { next(err); }
};
const update = async (req, res, next) => {
  try {
    const error = validateUpdate(req.body);
    if (error) return res.status(400).json({ success: false, message: error });
    res.json({ success: true, data: await service.update(req.params.organizationId, req.params.id, req.body) });
  } catch (err) { next(err); }
};
const updateStatus = async (req, res, next) => {
  try {
    const error = validateStatus(req.body);
    if (error) return res.status(400).json({ success: false, message: error });
    res.json({ success: true, data: await service.updateStatus(req.params.organizationId, req.params.id, req.body.status) });
  } catch (err) { next(err); }
};

const remove = async (req, res, next) => {
  try { res.json({ success: true, data: await service.remove(req.params.organizationId, req.params.id) }); } catch (err) { next(err); }
};

module.exports = { list, getById, create, update, updateStatus, remove };
