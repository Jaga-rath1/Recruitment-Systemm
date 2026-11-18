'use strict';
const express = require('express');
const router = express.Router();
const controller = require('./submodules.controller');
const { requirePlatformAdmin } = require('../../middlewares/authorize');

router.use(requirePlatformAdmin);

router.get('/', controller.list);          // ?moduleId= & ?status=
router.post('/', controller.create);
router.get('/:id', controller.getById);
router.patch('/:id', controller.update);
router.patch('/:id/status', controller.updateStatus);

module.exports = router;
