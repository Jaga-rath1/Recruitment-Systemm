'use strict';
const service    = require('./notifications.service');
const { validateCreate } = require('./notifications.validation');

async function list(req, res, next) {
  try {
    const result = await service.list(req.user.organizationId, req.user.userId, req.query);
    res.json({ success: true, data: result.items, pagination: result.pagination });
  } catch (err) { next(err); }
}

async function getById(req, res, next) {
  try {
    const n = await service.getById(req.user.organizationId, req.user.userId, req.params.id);
    res.json({ success: true, data: n });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const error = validateCreate(req.body);
    if (error) return res.status(400).json({ success: false, message: error });
    const n = await service.create(req.user.organizationId, req.body);
    res.status(201).json({ success: true, data: n });
  } catch (err) { next(err); }
}

async function markRead(req, res, next) {
  try {
    const n = await service.markRead(req.user.organizationId, req.user.userId, req.params.id);
    res.json({ success: true, data: n });
  } catch (err) { next(err); }
}

async function markAllRead(req, res, next) {
  try {
    const result = await service.markAllRead(req.user.organizationId, req.user.userId);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

async function deleteById(req, res, next) {
  try {
    await service.deleteById(req.user.organizationId, req.user.userId, req.params.id);
    res.json({ success: true, message: 'Notification deleted' });
  } catch (err) { next(err); }
}

async function unreadCount(req, res, next) {
  try {
    const result = await service.unreadCount(req.user.organizationId, req.user.userId);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

module.exports = { list, getById, create, markRead, markAllRead, deleteById, unreadCount };
