'use strict';
const dns = require('node:dns');
try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch {}

const originalLookup = dns.lookup;
dns.lookup = function (hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  if (hostname && (hostname.includes('neon.tech') || hostname.includes('aws'))) {
    dns.resolve4(hostname, (err, addrs) => {
      if (!err && addrs && addrs.length > 0) {
        if (options && options.all) {
          return callback(null, addrs.map((a) => ({ address: a, family: 4 })));
        }
        return callback(null, addrs[0], 4);
      }
      originalLookup(hostname, options, callback);
    });
    return;
  }
  originalLookup(hostname, options, callback);
};
require('dotenv').config();
const app = require('./app');
const { PORT } = require('./config/env');
const sequelize = require('./config/database');
const { logger } = require('./config/logger');

const DB_CONNECT_ATTEMPTS = 5;
const DB_RETRY_DELAY_MS = 3000;

// The hosted database can take a moment to resolve or wake up; retry before giving up.
async function connectDatabase() {
  for (let attempt = 1; ; attempt++) {
    try {
      await sequelize.authenticate();
      return;
    } catch (err) {
      if (attempt >= DB_CONNECT_ATTEMPTS) {
        logger.error({ service: 'notification-service', attempt, err: err.message }, 'Exhausted database connection attempts');
        throw err;
      }
      logger.warn({ service: 'notification-service', attempt, maxAttempts: DB_CONNECT_ATTEMPTS, err: err.code || err.name || err.message }, 'Database not reachable, retrying…');
      await new Promise((resolve) => setTimeout(resolve, DB_RETRY_DELAY_MS));
    }
  }
}

async function start() {
  await connectDatabase();
  logger.info({ service: 'notification-service', dialect: 'postgres' }, 'Database connection established successfully');

  const server = app.listen(PORT, () => {
    logger.info({ service: 'notification-service', port: PORT }, 'Notification Service started successfully');
  });

  server.on('error', (err) => {
    logger.error({ service: 'notification-service', err: err.message }, 'Server startup failed');
  });

  function shutdown(signal) {
    logger.info({ service: 'notification-service', signal }, 'Graceful shutdown initiated');
    server.close(async () => {
      try {
        await sequelize.close();
        logger.info({ service: 'notification-service' }, 'Database connection closed cleanly');
      } catch (err) {
        logger.error({ service: 'notification-service', err: err.message }, 'Error closing database connection');
      }
      logger.info({ service: 'notification-service' }, 'Notification Service shutdown complete');
      process.exit(0);
    });
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('uncaughtException', (err) => {
  logger.error({ service: 'notification-service', err: err.message, stack: err.stack }, 'Uncaught exception detected');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error({ service: 'notification-service', reason: String(reason) }, 'Unhandled promise rejection detected');
});

start().catch((err) => {
  logger.error({ service: 'notification-service', err: err.code || err.name || err.message }, 'Failed to start Notification Service');
  process.exit(1);
});
