'use strict';
const express    = require('express');
const controller = require('./notifications.controller');
const { requireAuth, requireOrgContext, requireNotifier } = require('../../middlewares/authorize');

const router = express.Router();
const auth = [requireAuth, requireOrgContext];

const templatesController = require('../templates/templates.controller');

// Static paths must come before /:id to avoid param capture
router.get('/unread-count',       ...auth, controller.unreadCount);
router.patch('/read-all',         ...auth, controller.markAllRead);
router.get('/templates',          ...auth, templatesController.list);
router.post('/templates/preview', ...auth, templatesController.preview);

router.get('/',               ...auth, controller.list);
router.post('/',              ...auth, requireNotifier, controller.create);
router.get('/:id',            ...auth, controller.getById);
router.patch('/:id/read',     ...auth, controller.markRead);
router.delete('/:id',         ...auth, controller.deleteById);

module.exports = router;
