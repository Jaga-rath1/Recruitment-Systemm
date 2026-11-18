'use strict';
const express = require('express');
const router = express.Router({ mergeParams: true });
const controller = require('./plan_submodules.controller');
const { requirePlatformAdmin } = require('../../middlewares/authorize');

router.use(requirePlatformAdmin);

router.get('/', controller.listForPlan);
router.post('/', controller.addSubmodule);
router.delete('/:submoduleId', controller.removeSubmodule);

module.exports = router;
