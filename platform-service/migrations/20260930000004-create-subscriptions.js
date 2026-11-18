'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('subscriptions', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
      organization_id: { type: Sequelize.UUID, allowNull: false },
      plan_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'plans', key: 'id' } },
      status: { type: Sequelize.ENUM('trial', 'active', 'expired', 'cancelled'), allowNull: false, defaultValue: 'active' },
      starts_at: { type: Sequelize.DATE, allowNull: false },
      ends_at: { type: Sequelize.DATE, allowNull: true },
      trial_ends_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
    });
    await queryInterface.addIndex('subscriptions', ['organization_id']);
    await queryInterface.addIndex('subscriptions', ['plan_id']);
    await queryInterface.addIndex('subscriptions', ['status']);
    await queryInterface.addIndex('subscriptions', ['organization_id', 'status']);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('subscriptions');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_subscriptions_status"');
  },
};
