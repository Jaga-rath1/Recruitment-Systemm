'use strict';
const express = require('express');
const router = express.Router();
const controller = require('./trials.controller');
const { requirePlatformAdmin } = require('../../middlewares/authorize');

router.use(requirePlatformAdmin);

// PATCH /api/v1/platform/trials/:id
router.patch('/:id', controller.updateStatus);

module.exports = router;
