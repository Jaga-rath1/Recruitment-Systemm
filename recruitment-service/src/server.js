const env = require('./config/env');
const logger = require('./config/logger');
const { checkDatabaseHealth, disconnectDatabase } = require('./config/database');
const { createApp } = require('./app');
const { seedPermissionCatalog } = require('./db/seed');

async function bootstrap() {
  await checkDatabaseHealth();
  await seedPermissionCatalog();

  const app = createApp();
  const server = app.listen(env.port, () => {
    logger.info({ port: env.port, integrationMode: env.integrationMode }, `${env.serviceName} listening`);
  });

  const shutdown = async (signal) => {
    logger.info({ signal }, 'Graceful shutdown initiated');
    server.close(async () => {
      await disconnectDatabase();
      logger.info('HTTP server and PostgreSQL connections closed cleanly');
      process.exit(0);
    });
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception detected; initiating shutdown');
    shutdown('UNCAUGHT_EXCEPTION');
  });

  process.on('unhandledRejection', (reason) => {
    logger.error(
      { reason: reason instanceof Error ? { message: reason.message, stack: reason.stack } : String(reason) },
      'Unhandled promise rejection detected'
    );
  });
}

bootstrap().catch((err) => {
  logger.fatal({ err }, 'Failed to start recruitment-service');
  process.exit(1);
});
