'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const Plan = sequelize.define('Plan', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING(100), allowNull: false },
  code: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  description: { type: DataTypes.TEXT, allowNull: true },
  price: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  billingCycle: { type: DataTypes.ENUM('monthly', 'yearly'), allowNull: false, field: 'billing_cycle' },
  trialDays: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'trial_days' },
  status: { type: DataTypes.ENUM('active', 'inactive'), allowNull: false, defaultValue: 'active' },
}, { tableName: 'plans', underscored: true });

module.exports = Plan;
