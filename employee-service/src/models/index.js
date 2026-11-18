'use strict';
const sequelize = require('../config/database');
const Employee = require('../modules/employees/employees.model');

module.exports = { sequelize, Employee };
