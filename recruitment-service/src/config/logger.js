const pino = require('pino');
const env = require('./env');

const logger = pino({
  level: env.logLevel,
  base: {
    service: env.serviceName,
    env: env.nodeEnv
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers["x-internal-token"]',
      'req.headers.cookie',
      'headers.authorization',
      'headers["x-internal-token"]',
      'err.config.headers.authorization',
      'err.config.headers["x-internal-token"]',
      'password',
      '*.password',
      'temporaryPassword',
      '*.temporaryPassword',
      'tempPassword',
      '*.tempPassword',
      'activationToken',
      '*.activationToken',
      'token',
      '*.token',
      'otp',
      '*.otp',
      'verificationCode',
      '*.verificationCode',
      'verificationToken',
      '*.verificationToken',
      'resetToken',
      '*.resetToken',
      'currentPassword',
      '*.currentPassword',
      'newPassword',
      '*.newPassword',
      'confirmPassword',
      '*.confirmPassword',
      'apiKey',
      '*.apiKey',
      'pass',
      '*.pass',
      'internalToken',
      'secret',
      '*.secret',
      'candidateSecret',
      'tokenHashSecret',
      'databaseUrl'
    ],
    censor: '[REDACTED]'
  }
});

module.exports = logger;
