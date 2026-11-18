'use strict';
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

// Load all models and associations at startup
require('./models/index');

const healthRoute = require('./routes/health');
const organizationsRoutes = require('./modules/organizations/organizations.routes');
const settingsRoutes = require('./modules/settings/settings.routes');
const branchesRoutes = require('./modules/branches/branches.routes');
const departmentsRoutes = require('./modules/departments/departments.routes');
const designationsRoutes = require('./modules/designations/designations.routes');
const workingHoursRoutes = require('./modules/working-hours/working_hours.routes');
const shiftsRoutes = require('./modules/shifts/shifts.routes');
const holidaysRoutes = require('./modules/holidays/holidays.routes');
const teamsRoutes = require('./modules/teams/teams.routes');
const errorMiddleware = require('./middlewares/error');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/health', healthRoute);

// Organizations
app.use('/api/v1/organizations', organizationsRoutes);

// Org-scoped sub-resources (all nested under /:organizationId)
app.use('/api/v1/organizations/:organizationId/settings', settingsRoutes);
app.use('/api/v1/organizations/:organizationId/branches', branchesRoutes);
app.use('/api/v1/organizations/:organizationId/departments', departmentsRoutes);
app.use('/api/v1/organizations/:organizationId/designations', designationsRoutes);
app.use('/api/v1/organizations/:organizationId/working-hours', workingHoursRoutes);
app.use('/api/v1/organizations/:organizationId/shifts', shiftsRoutes);
app.use('/api/v1/organizations/:organizationId/holidays', holidaysRoutes);
app.use('/api/v1/organizations/:organizationId/teams', teamsRoutes);

// Unknown routes answer in the same JSON shape as every other error.
app.use((req, res) => {
  res.status(404).json({ success: false, code: 'ROUTE_NOT_FOUND', message: 'Not found' });
});

app.use(errorMiddleware);
module.exports = app;
