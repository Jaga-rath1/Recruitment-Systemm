'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const Subscription = sequelize.define('Subscription', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  organizationId: { type: DataTypes.UUID, allowNull: false, field: 'organization_id' },
  planId: { type: DataTypes.UUID, allowNull: false, field: 'plan_id' },
  status: { type: DataTypes.ENUM('trial', 'active', 'expired', 'cancelled'), allowNull: false, defaultValue: 'active' },
  startsAt: { type: DataTypes.DATE, allowNull: false, field: 'starts_at' },
  endsAt: { type: DataTypes.DATE, allowNull: true, field: 'ends_at' },
  trialEndsAt: { type: DataTypes.DATE, allowNull: true, field: 'trial_ends_at' },
}, { tableName: 'subscriptions', underscored: true });

module.exports = Subscription;
