'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const PlanSubmodule = sequelize.define('PlanSubmodule', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  planId: { type: DataTypes.UUID, allowNull: false, field: 'plan_id' },
  submoduleId: { type: DataTypes.UUID, allowNull: false, field: 'submodule_id' },
}, {
  tableName: 'plan_submodules',
  underscored: true,
  timestamps: true,
  updatedAt: false,
  createdAt: 'created_at',
});

module.exports = PlanSubmodule;
