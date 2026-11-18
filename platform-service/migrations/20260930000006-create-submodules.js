'use strict';
const { DataTypes, Sequelize } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('submodules', {
      id: { type: DataTypes.UUID, defaultValue: Sequelize.literal('gen_random_uuid()'), primaryKey: true, allowNull: false },
      module_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'modules', key: 'id' }, onDelete: 'CASCADE' },
      name: { type: DataTypes.STRING(100), allowNull: false },
      code: { type: DataTypes.STRING(50), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      status: { type: DataTypes.ENUM('active', 'inactive'), allowNull: false, defaultValue: 'active' },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
    });
    await queryInterface.addIndex('submodules', ['module_id']);
    await queryInterface.addIndex('submodules', ['status']);
    await queryInterface.addIndex('submodules', ['module_id', 'code'], { unique: true, name: 'submodules_module_code_unique' });

    await queryInterface.createTable('plan_submodules', {
      id: { type: DataTypes.UUID, defaultValue: Sequelize.literal('gen_random_uuid()'), primaryKey: true, allowNull: false },
      plan_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'plans', key: 'id' }, onDelete: 'CASCADE' },
      submodule_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'submodules', key: 'id' }, onDelete: 'CASCADE' },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
    });
    await queryInterface.addIndex('plan_submodules', ['plan_id']);
    await queryInterface.addIndex('plan_submodules', ['submodule_id']);
    await queryInterface.addIndex('plan_submodules', ['plan_id', 'submodule_id'], { unique: true, name: 'plan_submodules_plan_sub_unique' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('plan_submodules');
    await queryInterface.dropTable('submodules');
  },
};
