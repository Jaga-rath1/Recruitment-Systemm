'use strict';
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

// Ensure models and associations are loaded at startup
require('./models/index');

const healthRoute = require('./routes/health');
const organizationsRoute = require('./routes/organizations');
const modulesRoutes = require('./modules/modules/modules.routes');
const submodulesRoutes = require('./modules/submodules/submodules.routes');
const plansRoutes = require('./modules/plans/plans.routes');
const planModulesRoutes = require('./modules/plan_modules/plan_modules.routes');
const planSubmodulesRoutes = require('./modules/plan_submodules/plan_submodules.routes');
const subscriptionsRoutes = require('./modules/subscriptions/subscriptions.routes');
const trialsRoutes = require('./modules/trials/trials.routes');
const entitlementsRoutes = require('./modules/entitlements/entitlements.routes');
const errorMiddleware = require('./middlewares/error');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/health', healthRoute);

// Platform API routes
app.use('/api/v1/platform/modules', modulesRoutes);
app.use('/api/v1/platform/submodules', submodulesRoutes);
app.use('/api/v1/platform/plans', plansRoutes);
app.use('/api/v1/platform/plans/:planId/modules', planModulesRoutes);
app.use('/api/v1/platform/plans/:planId/submodules', planSubmodulesRoutes);
app.use('/api/v1/platform/subscriptions', subscriptionsRoutes);
app.use('/api/v1/platform/trials', trialsRoutes);
app.use('/api/v1/platform/entitlements', entitlementsRoutes);
app.use('/api/v1/platform/organizations', organizationsRoute);

// Unknown routes answer in the same JSON shape as every other error.
app.use((req, res) => {
  res.status(404).json({ success: false, code: 'ROUTE_NOT_FOUND', message: 'Not found' });
});

app.use(errorMiddleware);
module.exports = app;
