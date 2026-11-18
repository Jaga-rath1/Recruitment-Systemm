'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const Industry = sequelize.define(
  'Industry',
  {
    id: {
      type: DataTypes.STRING(20),
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active',
    },
  },
  {
    tableName: 'industries',
    underscored: true,
    timestamps: true,
  }
);

module.exports = Industry;
