'use strict';
const service = require('./trials.service');
const { validateCreate, validateUpdate } = require('./trials.validation');

const getByOrganizationId = async (req, res, next) => {
  try {
    const data = await service.getByOrganizationId(req.params.organizationId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

const create = async (req, res, next) => {
  try {
    const error = validateCreate({ ...req.body, organizationId: req.params.organizationId });
    if (error) return res.status(400).json({ success: false, message: error });
    const data = await service.create({ ...req.body, organizationId: req.params.organizationId });
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
};

const updateStatus = async (req, res, next) => {
  try {
    const error = validateUpdate(req.body);
    if (error) return res.status(400).json({ success: false, message: error });
    const data = await service.updateStatus(req.params.id, req.body.status);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

module.exports = { getByOrganizationId, create, updateStatus };
