'use strict';
const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');

// Initialize models + associations
require('./models/index');

const healthRoute     = require('./routes/health');
const employeesRoutes = require('./modules/employees/employees.routes');
const errorMiddleware = require('./middlewares/error');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/health', healthRoute);
app.use('/api/v1/employees', employeesRoutes);

// Unknown routes answer in the same JSON shape as every other error.
app.use((req, res) => {
  res.status(404).json({ success: false, code: 'ROUTE_NOT_FOUND', message: 'Not found' });
});

app.use(errorMiddleware);
module.exports = app;
