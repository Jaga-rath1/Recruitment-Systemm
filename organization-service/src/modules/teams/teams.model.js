'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const Team = sequelize.define('Team', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  organizationId: { type: DataTypes.UUID, allowNull: false, field: 'organization_id' },
  departmentId: { type: DataTypes.UUID, allowNull: true, field: 'department_id' },
  name: { type: DataTypes.STRING(150), allowNull: false },
  code: { type: DataTypes.STRING(50), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  // Employee (employee-service id) who leads the team. Not a foreign key: employees live in another service.
  leadEmployeeId: { type: DataTypes.UUID, allowNull: true, field: 'lead_employee_id' },
  status: { type: DataTypes.ENUM('active', 'inactive'), allowNull: false, defaultValue: 'active' },
}, { tableName: 'teams', underscored: true });

module.exports = Team;
