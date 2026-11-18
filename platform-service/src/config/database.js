require("./dns-fallback");
const { Sequelize } = require("sequelize");
require("dotenv").config();

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: "postgres",
  logging: false,
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  // Keep one connection warm so a request after a quiet spell does not have to
  // resolve and open a new connection to the hosted database.
  pool: { max: 10, min: 1, idle: 30000, acquire: 30000 },
  // A hosted database is occasionally unreachable for a moment (DNS, wake-up,
  // dropped socket). Retry those instead of failing the request.
  retry: {
    max: 3,
    match: [
      /SequelizeConnectionError/,
      /SequelizeConnectionRefusedError/,
      /SequelizeHostNotFoundError/,
      /SequelizeHostNotReachableError/,
      /SequelizeConnectionTimedOutError/,
      /SequelizeConnectionAcquireTimeoutError/,
      /ENOTFOUND/,
      /ECONNRESET/,
      /ETIMEDOUT/,
      /Connection terminated unexpectedly/,
    ],
  },
});

module.exports = sequelize;
