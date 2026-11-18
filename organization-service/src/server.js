'use strict';
require('dotenv').config();
const app = require('./app');
const { PORT } = require('./config/env');
const sequelize = require('./config/database');

const DB_CONNECT_ATTEMPTS = 5;
const DB_RETRY_DELAY_MS = 3000;

// The hosted database can take a moment to resolve or wake up; retry before giving up.
async function connectDatabase() {
  for (let attempt = 1; ; attempt++) {
    try {
      await sequelize.authenticate();
      return;
    } catch (err) {
      if (attempt >= DB_CONNECT_ATTEMPTS) throw err;
      console.warn(`[organization-service] Database not reachable (attempt ${attempt}/${DB_CONNECT_ATTEMPTS}), retrying…`);
      await new Promise((resolve) => setTimeout(resolve, DB_RETRY_DELAY_MS));
    }
  }
}

async function start() {
  await connectDatabase();
  console.log('[organization-service] Database connected');
  app.listen(PORT, () => {
    console.log(`[organization-service] Running on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('[organization-service] Failed to start:', err.code || err.name || 'error');
  process.exit(1);
});
