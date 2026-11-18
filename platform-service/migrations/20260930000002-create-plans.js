'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('plans', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
      name: { type: Sequelize.STRING(100), allowNull: false },
      code: { type: Sequelize.STRING(50), allowNull: false, unique: true },
      description: { type: Sequelize.TEXT, allowNull: true },
      price: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      billing_cycle: { type: Sequelize.ENUM('monthly', 'yearly'), allowNull: false },
      trial_days: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      status: { type: Sequelize.ENUM('active', 'inactive'), allowNull: false, defaultValue: 'active' },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
    });
    await queryInterface.addIndex('plans', ['code'], { unique: true });
    await queryInterface.addIndex('plans', ['status']);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('plans');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_plans_billing_cycle"');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_plans_status"');
  },
};
