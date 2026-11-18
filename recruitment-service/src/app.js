const express = require('express');
const cors = require('cors');
const compression = require('compression');
const env = require('./config/env');
const { checkDatabaseHealth } = require('./config/database');
const { GATEWAY_ROUTES_MANIFEST } = require('./integrations/gateway/gateway.config');
const requestIdMiddleware = require('./middleware/requestId');
const requestLoggerMiddleware = require('./middleware/requestLogger');
const securityHeadersMiddleware = require('./middleware/securityHeaders');
const { apiRateLimiter } = require('./middleware/rateLimiter');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./modules/auth/auth.routes');
const subscriptionRoutes = require('./modules/subscription/subscription.routes');
const organisationRoutes = require('./modules/organisation/organisation.routes');
const roleRoutes = require('./modules/role/role.routes');
const jobRoutes = require('./modules/job/job.routes');
const candidateRoutes = require('./modules/candidate/candidate.routes');
const applicationRoutes = require('./modules/application/application.routes');
const interviewRoutes = require('./modules/interview/interview.routes');
const offerRoutes = require('./modules/offer/offer.routes');
const joiningRoutes = require('./modules/joining/joining.routes');
const { portalRouter, reportsRouter } = require('./modules/tracking/tracking.routes');
const auditRoutes = require('./modules/audit/audit.routes');
const storageRoutes = require('./modules/storage/storage.routes');

function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(requestIdMiddleware);
  app.use(securityHeadersMiddleware);
  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true,
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'Idempotency-Key',
        'X-Request-Id',
        'X-Tenant-Id',
        'X-Organisation-Id',
        'X-Organization-Id',
        'x-internal-token',
        'x-service-name',
        'x-user-id',
        'x-user-role',
        'x-user-email',
        'x-user-name'
      ],
      exposedHeaders: ['X-Request-Id', 'x-request-id', 'x-organization-id', 'x-tenant-id']
    })
  );
  app.use(compression());
  app.use(
    express.json({
      limit: '2mb',
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      }
    })
  );
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(requestLoggerMiddleware);
  app.use(apiRateLimiter);

  app.get(['/health', '/healthy'], (_req, res) => {
    res.status(200).json({
      success: true,
      status: 'ok',
      service: env.serviceName,
      port: env.port,
      integrationMode: env.integrationMode,
      timestamp: new Date().toISOString()
    });
  });

  app.get('/ready', async (_req, res) => {
    const checks = {
      database: 'down'
    };

    try {
      await checkDatabaseHealth();
      checks.database = 'up';
    } catch (_err) {
      return res.status(503).json({
        success: false,
        status: 'not_ready',
        database: 'disconnected',
        checks
      });
    }

    if (env.integrationMode === 'live') {
      const probe = async (baseUrl, timeoutMs = 1500) => {
        if (!baseUrl) return 'unconfigured';
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const resp = await fetch(`${String(baseUrl).replace(/\/+$/, '')}/health`, {
            signal: controller.signal
          });
          return resp.ok ? 'up' : `http_${resp.status}`;
        } catch (_e) {
          return 'down';
        } finally {
          clearTimeout(timer);
        }
      };

      const [authStatus, orgStatus, platformStatus, employeeStatus, notificationStatus] = await Promise.all([
        probe(env.services.authUrl),
        probe(env.services.organisationUrl),
        probe(env.services.platformUrl),
        probe(env.services.employeeUrl),
        probe(env.services.notificationUrl)
      ]);

      checks.authService = authStatus;
      checks.organisationService = orgStatus;
      checks.platformService = platformStatus;
      checks.employeeService = employeeStatus;
      checks.notificationService = notificationStatus === 'up' ? 'up' : 'degraded';

      const mandatoryOk =
        authStatus === 'up' &&
        orgStatus === 'up' &&
        platformStatus === 'up' &&
        employeeStatus === 'up';

      if (!mandatoryOk) {
        return res.status(503).json({
          success: false,
          status: 'not_ready',
          database: 'connected',
          checks
        });
      }
    }

    return res.status(200).json({
      success: true,
      status: 'ready',
      database: 'connected',
      checks
    });
  });

  app.get(`${env.apiPrefix}/gateway/manifest`, (_req, res) => {
    res.status(200).json({
      success: true,
      data: GATEWAY_ROUTES_MANIFEST
    });
  });

  const api = express.Router();
  api.use('/auth', authRoutes);
  api.use('/subscriptions', subscriptionRoutes);
  api.use('/organisations', organisationRoutes);
  api.use('/roles', roleRoutes);
  api.use('/jobs', jobRoutes);
  api.use('/candidates', candidateRoutes);
  api.use('/applications', applicationRoutes);
  api.use('/interviews', interviewRoutes);
  api.use('/offers', offerRoutes);
  api.use('/joining', joiningRoutes);
  api.use('/portal', portalRouter);
  api.use('/reports', reportsRouter);
  api.use('/audit-logs', auditRoutes);
  api.use('/files', storageRoutes);

  app.use(env.apiPrefix, api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
