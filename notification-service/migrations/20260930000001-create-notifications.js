'use strict';
const { DataTypes, Sequelize } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('notifications', {
      id: {
        type: DataTypes.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
        allowNull: false,
      },
      organization_id: { type: DataTypes.UUID,         allowNull: false },
      user_id:         { type: DataTypes.STRING(255),   allowNull: false },
      type:            { type: DataTypes.STRING(100),   allowNull: true  },
      title:           { type: DataTypes.STRING(255),   allowNull: false },
      message:         { type: DataTypes.TEXT,          allowNull: false },
      data:            { type: DataTypes.JSONB,         allowNull: true  },
      is_read:         { type: DataTypes.BOOLEAN,       allowNull: false, defaultValue: false },
      read_at:         { type: DataTypes.DATE,          allowNull: true  },
      created_at:      { type: DataTypes.DATE,          allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      updated_at:      { type: DataTypes.DATE,          allowNull: false, defaultValue: Sequelize.literal('NOW()') },
    });

    await queryInterface.addIndex('notifications', ['organization_id']);
    await queryInterface.addIndex('notifications', ['user_id']);
    await queryInterface.addIndex('notifications', ['organization_id', 'user_id']);
    await queryInterface.addIndex('notifications', ['is_read']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('notifications');
  },
};
