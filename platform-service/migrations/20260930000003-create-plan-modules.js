'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('plan_modules', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
      plan_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'plans', key: 'id' }, onDelete: 'CASCADE' },
      module_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'modules', key: 'id' }, onDelete: 'CASCADE' },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
    });
    await queryInterface.addIndex('plan_modules', ['plan_id', 'module_id'], { unique: true });
    await queryInterface.addIndex('plan_modules', ['plan_id']);
    await queryInterface.addIndex('plan_modules', ['module_id']);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('plan_modules');
  },
};
