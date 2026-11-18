'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const Shift = sequelize.define('Shift', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  organizationId: { type: DataTypes.UUID, allowNull: false, field: 'organization_id' },
  name: { type: DataTypes.STRING(150), allowNull: false },
  code: { type: DataTypes.STRING(50), allowNull: false },
  startTime: { type: DataTypes.STRING(10), allowNull: false, field: 'start_time' },
  endTime: { type: DataTypes.STRING(10), allowNull: false, field: 'end_time' },
  status: { type: DataTypes.ENUM('active', 'inactive'), allowNull: false, defaultValue: 'active' },
}, { tableName: 'shifts', underscored: true });

module.exports = Shift;
