const { Sequelize } = require('sequelize');
const env = require('./env');
const logger = require('./logger');
const { normalizePostgresConnection } = require('../db/config');
const { initModels } = require('../db/models');

let sequelizeInstance = null;
let modelsInstance = null;

function createSequelize(rawUrl = process.env.DATABASE_URL || env.databaseUrl, poolOverrides = {}) {
  const { url, dialectOptions } = normalizePostgresConnection(rawUrl);

  const sequelize = new Sequelize(url, {
    dialect: 'postgres',
    dialectOptions,
    pool: {
      max: poolOverrides.max ?? env.pgPoolMax,
      min: 0,
      idle: env.pgIdleTimeoutMs,
      acquire: 30000,
      evict: 10000
    },
    logging: env.nodeEnv === 'development' ? (msg) => logger.debug(msg) : false
  });

  const models = initModels(sequelize);
  return { sequelize, models };
}

function getSequelize() {
  if (!sequelizeInstance) {
    const created = createSequelize();
    sequelizeInstance = created.sequelize;
    modelsInstance = created.models;
  }
  return sequelizeInstance;
}

function getModels() {
  if (!modelsInstance) {
    getSequelize();
  }
  return modelsInstance;
}

async function setTestDatabaseUrl(databaseUrl) {
  await disconnectDatabase();
  process.env.DATABASE_URL = databaseUrl;
  const created = createSequelize(databaseUrl, { max: 1 });
  sequelizeInstance = created.sequelize;
  modelsInstance = created.models;
  return sequelizeInstance;
}

async function withTransaction(fn) {
  const sequelize = getSequelize();
  return sequelize.transaction(fn);
}

async function checkDatabaseHealth() {
  const sequelize = getSequelize();
  await sequelize.authenticate();
  await sequelize.query('SELECT 1');
  return true;
}

async function disconnectDatabase() {
  if (sequelizeInstance) {
    await sequelizeInstance.close();
    sequelizeInstance = null;
    modelsInstance = null;
  }
}

function isDatabaseInitialized() {
  return Boolean(sequelizeInstance && modelsInstance);
}

module.exports = {
  getSequelize,
  getModels,
  isDatabaseInitialized,
  setTestDatabaseUrl,
  withTransaction,
  checkDatabaseHealth,
  disconnectDatabase
};
