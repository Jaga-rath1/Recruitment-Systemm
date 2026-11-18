'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const PlanModule = sequelize.define('PlanModule', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  planId: { type: DataTypes.UUID, allowNull: false, field: 'plan_id' },
  moduleId: { type: DataTypes.UUID, allowNull: false, field: 'module_id' },
}, {
  tableName: 'plan_modules',
  underscored: true,
  timestamps: true,
  updatedAt: false,
  createdAt: 'created_at',
});

module.exports = PlanModule;
