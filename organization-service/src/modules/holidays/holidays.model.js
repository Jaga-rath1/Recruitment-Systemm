'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const Holiday = sequelize.define('Holiday', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  organizationId: { type: DataTypes.UUID, allowNull: false, field: 'organization_id' },
  name: { type: DataTypes.STRING(150), allowNull: false },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  status: { type: DataTypes.ENUM('active', 'inactive'), allowNull: false, defaultValue: 'active' },
}, { tableName: 'holidays', underscored: true });

module.exports = Holiday;
