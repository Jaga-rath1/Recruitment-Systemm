'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('trials', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
      organization_id: { type: Sequelize.UUID, allowNull: false },
      plan_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'plans', key: 'id' } },
      starts_at: { type: Sequelize.DATE, allowNull: false },
      ends_at: { type: Sequelize.DATE, allowNull: false },
      status: { type: Sequelize.ENUM('active', 'expired', 'converted', 'cancelled'), allowNull: false, defaultValue: 'active' },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
    });
    await queryInterface.addIndex('trials', ['organization_id']);
    await queryInterface.addIndex('trials', ['plan_id']);
    await queryInterface.addIndex('trials', ['status']);
    await queryInterface.addIndex('trials', ['organization_id', 'status']);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('trials');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_trials_status"');
  },
};
