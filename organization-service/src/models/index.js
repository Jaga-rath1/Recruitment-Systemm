'use strict';
const sequelize = require('../config/database');
const Organization = require('../modules/organizations/organizations.model');
const OrganizationSettings = require('../modules/settings/settings.model');
const Branch = require('../modules/branches/branches.model');
const Department = require('../modules/departments/departments.model');
const Designation = require('../modules/designations/designations.model');
const WorkingHours = require('../modules/working-hours/working_hours.model');
const Shift = require('../modules/shifts/shifts.model');
const Holiday = require('../modules/holidays/holidays.model');
const Team = require('../modules/teams/teams.model');

// Associations
Organization.hasMany(Team, { foreignKey: 'organizationId', as: 'teams' });
Team.belongsTo(Organization, { foreignKey: 'organizationId', as: 'organization' });
Department.hasMany(Team, { foreignKey: 'departmentId', as: 'teams' });
Team.belongsTo(Department, { foreignKey: 'departmentId', as: 'department' });

Organization.hasOne(OrganizationSettings, { foreignKey: 'organizationId', as: 'settings' });
OrganizationSettings.belongsTo(Organization, { foreignKey: 'organizationId', as: 'organization' });

Organization.hasMany(Branch, { foreignKey: 'organizationId', as: 'branches' });
Branch.belongsTo(Organization, { foreignKey: 'organizationId', as: 'organization' });

Organization.hasMany(Department, { foreignKey: 'organizationId', as: 'departments' });
Department.belongsTo(Organization, { foreignKey: 'organizationId', as: 'organization' });
Department.belongsTo(Department, { foreignKey: 'parentDepartmentId', as: 'parent' });
Department.hasMany(Department, { foreignKey: 'parentDepartmentId', as: 'children' });

Organization.hasMany(Designation, { foreignKey: 'organizationId', as: 'designations' });
Designation.belongsTo(Organization, { foreignKey: 'organizationId', as: 'organization' });

Organization.hasMany(WorkingHours, { foreignKey: 'organizationId', as: 'workingHours' });
WorkingHours.belongsTo(Organization, { foreignKey: 'organizationId', as: 'organization' });

Organization.hasMany(Shift, { foreignKey: 'organizationId', as: 'shifts' });
Shift.belongsTo(Organization, { foreignKey: 'organizationId', as: 'organization' });

Organization.hasMany(Holiday, { foreignKey: 'organizationId', as: 'holidays' });
Holiday.belongsTo(Organization, { foreignKey: 'organizationId', as: 'organization' });

module.exports = { sequelize, Organization, OrganizationSettings, Branch, Department, Designation, WorkingHours, Shift, Holiday, Team };
