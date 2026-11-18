'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const Tenant = sequelize.define(
  'Tenant',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    industryId: {
      type: DataTypes.STRING(20),
      allowNull: false,
      field: 'industry_id',
    },
  },
  {
    tableName: 'tenants',
    underscored: true,
    timestamps: true,
  }
);

module.exports = Tenant;
