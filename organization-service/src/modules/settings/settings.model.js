'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const OrganizationSettings = sequelize.define('OrganizationSettings', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  organizationId: { type: DataTypes.UUID, allowNull: false, unique: true, field: 'organization_id' },
  timezone: { type: DataTypes.STRING(100), allowNull: false, defaultValue: 'UTC' },
  currency: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'USD' },
  dateFormat: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'YYYY-MM-DD', field: 'date_format' },
  weekStartDay: { type: DataTypes.ENUM('monday', 'sunday', 'saturday'), allowNull: false, defaultValue: 'monday', field: 'week_start_day' },
}, { tableName: 'organization_settings', underscored: true });

module.exports = OrganizationSettings;
