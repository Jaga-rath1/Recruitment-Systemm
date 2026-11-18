const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

function normalizePostgresConnection(rawUrl) {
  const fallback = 'postgresql://nexnuv_user:nexnuv_pass@localhost:5432/nexnuv_recruitment';
  const input = rawUrl || fallback;

  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    return { url: input, dialectOptions: {} };
  }

  const sslMode = parsed.searchParams.get('sslmode');
  const isNeon = parsed.hostname.includes('neon.tech');
  const requiresSsl = isNeon || ['require', 'verify-ca', 'verify-full', 'prefer'].includes(sslMode);

  // PgBouncer (-pooler) on Neon can hang with SCRAM channel_binding=require in node-postgres;
  // strip channel_binding & normalize sslmode while enforcing TLS via dialectOptions.ssl.
  parsed.searchParams.delete('channel_binding');
  parsed.searchParams.delete('sslmode');
  parsed.searchParams.delete('uselibpqcompat');
  parsed.searchParams.delete('connection_limit');
  parsed.searchParams.delete('schema');

  const dialectOptions = requiresSsl
    ? {
        ssl: {
          require: true,
          rejectUnauthorized: isNeon ? true : false
        }
      }
    : {};

  return {
    url: parsed.toString(),
    dialectOptions
  };
}

function buildCliConfig(rawUrl, isProduction = false) {
  if (isProduction && !rawUrl) {
    throw new Error('FATAL: DATABASE_URL must be explicitly configured for Sequelize in production');
  }
  const { url, dialectOptions } = normalizePostgresConnection(rawUrl);
  return {
    url,
    dialect: 'postgres',
    dialectOptions,
    logging: false
  };
}

module.exports = {
  normalizePostgresConnection,
  development: buildCliConfig(process.env.DATABASE_URL, false),
  test: buildCliConfig(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL, false),
  production: buildCliConfig(process.env.DATABASE_URL, process.env.NODE_ENV === 'production')
};

