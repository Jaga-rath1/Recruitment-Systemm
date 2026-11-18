'use strict';
const express = require('express');
const router = express.Router({ mergeParams: true });
const controller = require('./plan_modules.controller');
const { requirePlatformAdmin } = require('../../middlewares/authorize');

router.use(requirePlatformAdmin);

router.get('/', controller.listModulesForPlan);
router.post('/', controller.addModule);
router.delete('/:moduleId', controller.removeModule);

module.exports = router;
