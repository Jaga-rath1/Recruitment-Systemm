'use strict';
const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');

require('./models/index');

const healthRoute         = require('./routes/health');
const readyRoute          = require('./routes/ready');
const notificationsRoutes = require('./modules/notifications/notifications.routes');
const errorMiddleware     = require('./middlewares/error');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const templatesRoutes     = require('./modules/templates/templates.routes');

app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    service: 'notification-service',
    message: 'NexnuvTKT Notification Service is running',
    timestamp: new Date().toISOString(),
  });
});

app.use(['/health', '/healthy'],  healthRoute);
app.use('/ready',                   readyRoute);
app.use('/api/v1/notifications',    notificationsRoutes);
app.use('/api/v1/templates',        templatesRoutes);

// Unknown routes answer in the same JSON shape as every other error.
app.use((req, res) => {
  res.status(404).json({
    success: false,
    service: 'notification-service',
    code: 'ROUTE_NOT_FOUND',
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: 'Route not found',
      details: null,
    },
    timestamp: new Date().toISOString(),
  });
});

app.use(errorMiddleware);
module.exports = app;
