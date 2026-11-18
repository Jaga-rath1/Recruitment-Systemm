'use strict';
const service = require('./subscriptions.service');
const { validateCreate, validateUpdate } = require('./subscriptions.validation');

const list = async (req, res, next) => {
  try {
    const data = await service.list(req.query);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

const getById = async (req, res, next) => {
  try {
    const data = await service.getById(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

const getByOrganizationId = async (req, res, next) => {
  try {
    const data = await service.getByOrganizationId(req.params.organizationId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

const create = async (req, res, next) => {
  try {
    const error = validateCreate(req.body);
    if (error) return res.status(400).json({ success: false, message: error });
    const data = await service.create(req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    const error = validateUpdate(req.body);
    if (error) return res.status(400).json({ success: false, message: error });
    const data = await service.update(req.params.id, req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

module.exports = { list, getById, getByOrganizationId, create, update };
