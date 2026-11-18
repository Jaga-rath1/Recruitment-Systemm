'use strict';
const service = require('./settings.service');
const { validateUpsert } = require('./settings.validation');

const get = async (req, res, next) => {
  try {
    const data = await service.get(req.params.organizationId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

const upsert = async (req, res, next) => {
  try {
    const error = validateUpsert(req.body);
    if (error) return res.status(400).json({ success: false, message: error });
    const data = await service.upsert(req.params.organizationId, req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

module.exports = { get, upsert };
