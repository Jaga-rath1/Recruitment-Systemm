'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const Submodule = sequelize.define('Submodule', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  moduleId: { type: DataTypes.UUID, allowNull: false, field: 'module_id' },
  name: { type: DataTypes.STRING(100), allowNull: false },
  code: { type: DataTypes.STRING(50), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  status: { type: DataTypes.ENUM('active', 'inactive'), allowNull: false, defaultValue: 'active' },
}, { tableName: 'submodules', underscored: true });

module.exports = Submodule;
