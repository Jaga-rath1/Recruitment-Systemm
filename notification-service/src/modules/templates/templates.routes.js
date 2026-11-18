'use strict';

const express = require('express');
const controller = require('./templates.controller');
const { requireAuth } = require('../../middlewares/authorize');

const router = express.Router();

router.get('/', requireAuth, controller.list);
router.post('/preview', requireAuth, controller.preview);

module.exports = router;
