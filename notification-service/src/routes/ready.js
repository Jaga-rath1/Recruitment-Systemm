'use strict';
const express = require('express');
const router = express.Router();
const sequelize = require('../config/database');
const { logger } = require('../config/logger');

const emailProvider = require('../providers/email.provider');

const DB_CHECK_TIMEOUT_MS = 5000;

router.get('/', async (req, res) => {
  try {
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Database check timeout')), DB_CHECK_TIMEOUT_MS);
      if (timer.unref) timer.unref();
    });

    await Promise.race([
      sequelize.authenticate(),
      timeoutPromise,
    ]);

    clearTimeout(timer);
    logger.debug({ service: 'notification-service' }, 'Readiness probe succeeded');

    return res.status(200).json({
      success: true,
      service: 'notification-service',
      status: 'ready',
      timestamp: new Date().toISOString(),
      checks: {
        database: 'up',
        email: {
          configured: emailProvider.isConfigured(),
          mode: emailProvider.getMode(),
        },
      },
    });
  } catch (err) {
    logger.warn({ service: 'notification-service', err: err.message }, 'Readiness probe failed');
    return res.status(503).json({
      success: false,
      service: 'notification-service',
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      checks: {
        database: 'down',
      },
    });
  }
});

module.exports = router;
