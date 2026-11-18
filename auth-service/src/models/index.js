'use strict';

const sequelize = require('../config/database');
const Role = require('../modules/roles/roles.model');
const User = require('../modules/users/users.model');
const Industry = require('../modules/industries/industries.model');
const Tenant = require('../modules/tenants/tenants.model');

// Associations
User.belongsTo(Role, { foreignKey: 'roleId', as: 'role' });
Role.hasMany(User, { foreignKey: 'roleId', as: 'users' });

Tenant.belongsTo(Industry, { foreignKey: 'industryId', as: 'industry' });
Industry.hasMany(Tenant, { foreignKey: 'industryId', as: 'tenants' });

User.belongsTo(Tenant, { foreignKey: 'organizationId', as: 'tenant' });
Tenant.hasMany(User, { foreignKey: 'organizationId', as: 'users' });

module.exports = { sequelize, Role, User, Industry, Tenant };
