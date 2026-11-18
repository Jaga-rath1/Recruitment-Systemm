'use strict';
const sequelize    = require('../config/database');
const Notification = require('../modules/notifications/notifications.model');

module.exports = { sequelize, Notification };
