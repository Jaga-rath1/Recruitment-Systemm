'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

/** Stores only a HASH of the reset token, never the raw token. */
const PasswordResetToken = sequelize.define(
  'PasswordResetToken',
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false, field: 'user_id' },
    tokenHash: { type: DataTypes.STRING(255), allowNull: false, field: 'token_hash' },
    expiresAt: { type: DataTypes.DATE, allowNull: false, field: 'expires_at' },
    usedAt: { type: DataTypes.DATE, allowNull: true, field: 'used_at' },
  },
  { tableName: 'password_reset_tokens', underscored: true }
);

module.exports = PasswordResetToken;
