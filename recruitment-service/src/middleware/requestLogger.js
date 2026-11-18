const logger = require('../config/logger');

function requestLoggerMiddleware(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    logger.info(
      {
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Number(durationMs.toFixed(2)),
        organisationId: req.auth?.organisationId || null,
        userId: req.auth?.userId || null
      },
      'HTTP request completed'
    );
  });
  next();
}

module.exports = requestLoggerMiddleware;

