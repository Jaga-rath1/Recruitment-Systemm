'use strict';
const express = require('express');
const router = express.Router({ mergeParams: true });
const controller = require('./working_hours.controller');
const { readAccess, writeAccess } = require('../../middlewares/authorize');

router.get('/', ...readAccess, controller.list);
router.get('/:id', ...readAccess, controller.getById);
router.post('/', ...writeAccess, controller.create);
router.patch('/:id', ...writeAccess, controller.update);
router.patch('/:id/status', ...writeAccess, controller.updateStatus);
router.delete('/:id', ...writeAccess, controller.remove);

module.exports = router;
