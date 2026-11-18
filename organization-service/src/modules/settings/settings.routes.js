'use strict';
const express = require('express');
const router = express.Router({ mergeParams: true });
const controller = require('./settings.controller');
const { readAccess, writeAccess } = require('../../middlewares/authorize');

router.get('/', ...readAccess, controller.get);
router.put('/', ...writeAccess, controller.upsert);

module.exports = router;
