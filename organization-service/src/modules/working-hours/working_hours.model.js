'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const WorkingHours = sequelize.define('WorkingHours', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  organizationId: { type: DataTypes.UUID, allowNull: false, field: 'organization_id' },
  name: { type: DataTypes.STRING(150), allowNull: false },
  startTime: { type: DataTypes.STRING(10), allowNull: false, field: 'start_time' },
  endTime: { type: DataTypes.STRING(10), allowNull: false, field: 'end_time' },
  breakMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'break_minutes' },
  status: { type: DataTypes.ENUM('active', 'inactive'), allowNull: false, defaultValue: 'active' },
}, { tableName: 'working_hours', underscored: true });

module.exports = WorkingHours;
