const fs = require('fs');
const net = require('net');
const path = require('path');
const { PGlite } = require('@electric-sql/pglite');
const { PGLiteSocketServer } = require('@electric-sql/pglite-socket');
const env = require('../src/config/env');
const logger = require('../src/config/logger');
const { setTestDatabaseUrl, checkDatabaseHealth, disconnectDatabase } = require('../src/config/database');
const { createApp } = require('../src/app');
const { seedPermissionCatalog } = require('../src/db/seed');
const { INIT_SQL } = require('../src/db/migrations/20261110000001-init-recruitment-schema');
const { MIGRATION_SQL: ADD_CANDIDATE_ACCOUNTS_SQL } = require('../src/db/migrations/20261111000001-add-candidate-accounts-and-indexes');
const { MIGRATION_SQL: ADD_DOC_SECURITY_SQL } = require('../src/db/migrations/20261111000002-add-document-security-metadata');
const { MIGRATION_SQL: ADD_CLOUDINARY_META_SQL } = require('../src/db/migrations/20261111000003-add-cloudinary-document-metadata');
const { MIGRATION_SQL: ADD_CANDIDATE_IDENTITY_SQL } = require('../src/db/migrations/20261112000001-add-candidate-identity-lifecycle');
const { MIGRATION_SQL: ADD_TRIAL_SQL } = require('../src/db/migrations/20261113000001-add-trial-and-tiered-plans');
const { MIGRATION_SQL: ADD_PROVISIONING_LIFECYCLE_SQL } = require('../src/db/migrations/20261114000001-add-provisioning-lifecycle');
const { MIGRATION_SQL: ADD_PAYMENT_VOID_LIFECYCLE_SQL } = require('../src/db/migrations/20261115000001-add-payment-void-and-archive-lifecycle');
const { MIGRATION_SQL: ADD_NOTIFICATION_HISTORY_SQL } = require('../src/db/migrations/20261116000001-add-recruitment-notification-history');

function getFreePort(preferredPort = 54321) {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', () => {
      const fallback = net.createServer();
      fallback.unref();
      fallback.on('error', reject);
      fallback.listen(0, '127.0.0.1', () => {
        const { port } = fallback.address();
        fallback.close(() => resolve(port));
      });
    });
    srv.listen(preferredPort, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function startLocalDev() {
  const dataDir = path.resolve(__dirname, '../.pglite-data');
  fs.mkdirSync(dataDir, { recursive: true });
  const pidFile = path.join(dataDir, 'postmaster.pid');
  if (fs.existsSync(pidFile)) {
    fs.rmSync(pidFile, { force: true });
  }

  const pglite = new PGlite(dataDir);
  await pglite.waitReady;

  const check = await pglite.query(`SELECT to_regclass('public.subscriptions') AS tbl`);
  if (!check.rows[0]?.tbl) {
    await pglite.exec(INIT_SQL);
    logger.info('Applied initial PostgreSQL migration to local .pglite-data store');
  }

  // Ensure all subsequent incremental migrations are applied
  try {
    await pglite.exec(ADD_CANDIDATE_ACCOUNTS_SQL);
    await pglite.exec(ADD_DOC_SECURITY_SQL);
    await pglite.exec(ADD_CLOUDINARY_META_SQL);
    await pglite.exec(ADD_CANDIDATE_IDENTITY_SQL);
    await pglite.exec(ADD_TRIAL_SQL);
    await pglite.exec(ADD_PROVISIONING_LIFECYCLE_SQL);
    await pglite.exec(ADD_PAYMENT_VOID_LIFECYCLE_SQL);
    await pglite.exec(ADD_NOTIFICATION_HISTORY_SQL);
  } catch (migErr) {
    logger.debug({ err: migErr.message }, 'Local PGlite migration advisory');
  }

  const pgPort = await getFreePort(54321);
  const socketServer = new PGLiteSocketServer({
    db: pglite,
    host: '127.0.0.1',
    port: pgPort
  });
  await socketServer.start();

  const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${pgPort}/postgres`;
  await setTestDatabaseUrl(databaseUrl);
  await checkDatabaseHealth();
  await seedPermissionCatalog();

  const app = createApp();
  const server = app.listen(env.port, () => {
    logger.info(
      { port: env.port, pgPort, dataDir, integrationMode: env.integrationMode },
      `${env.serviceName} running with local embedded PostgreSQL`
    );
  });

  const shutdown = async (signal) => {
    logger.info({ signal }, 'Shutting down local dev server...');
    server.close(async () => {
      await disconnectDatabase();
      await socketServer.stop();
      await pglite.close();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

startLocalDev().catch((err) => {
  logger.fatal({ err }, 'Failed to start local embedded PostgreSQL dev server');
  process.exit(1);
});
