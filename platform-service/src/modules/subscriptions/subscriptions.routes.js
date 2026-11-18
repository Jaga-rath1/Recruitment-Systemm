'use strict';
const express = require('express');
const router = express.Router();
const controller = require('./subscriptions.controller');
const { requirePlatformAdmin } = require('../../middlewares/authorize');

router.use(requirePlatformAdmin);

router.get('/', controller.list);
router.get('/:id', controller.getById);
router.post('/', controller.create);
router.patch('/:id', controller.update);

module.exports = router;
