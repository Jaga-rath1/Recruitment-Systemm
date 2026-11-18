'use strict';

const templatesService = require('./templates.service');

async function list(req, res, next) {
  try {
    const templates = templatesService.listTemplates();
    res.json({ success: true, data: templates });
  } catch (err) {
    next(err);
  }
}

async function preview(req, res, next) {
  try {
    const { type, params } = req.body || {};
    if (!type) {
      return res.status(400).json({ success: false, message: 'Template "type" is required' });
    }
    if (!templatesService.hasTemplate(type)) {
      return res.status(404).json({ success: false, message: `Template "${type}" not found` });
    }
    const rendered = templatesService.renderTemplate(type, params || {});
    res.json({ success: true, data: rendered });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  list,
  preview,
};
