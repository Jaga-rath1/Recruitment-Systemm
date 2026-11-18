const dns = require('node:dns');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {}

const originalLookup = dns.lookup;
dns.lookup = function (hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  originalLookup(hostname, options, (err, address, family) => {
    if (!err) {
      return callback(null, address, family);
    }
    if (hostname && (hostname.includes('neon.tech') || hostname.includes('aws'))) {
      dns.resolve4(hostname, (resolveErr, addrs) => {
        if (!resolveErr && addrs && addrs.length > 0) {
          if (options && options.all) {
            return callback(null, addrs.map((a) => ({ address: a, family: 4 })));
          }
          return callback(null, addrs[0], 4);
        }
        return callback(err);
      });
      return;
    }
    return callback(err);
  });
};

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
const { Sequelize } = require("sequelize");

const dbUrl = process.env.AUTH_DATABASE_URL || process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/nexnuv_auth';
const sequelize = new Sequelize(dbUrl, {
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
