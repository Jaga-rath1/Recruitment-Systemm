'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('working_hours', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
      organization_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'organizations', key: 'id' }, onDelete: 'CASCADE' },
      name: { type: Sequelize.STRING(150), allowNull: false },
      start_time: { type: Sequelize.STRING(10), allowNull: false },
      end_time: { type: Sequelize.STRING(10), allowNull: false },
      break_minutes: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      status: { type: Sequelize.ENUM('active', 'inactive'), allowNull: false, defaultValue: 'active' },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
    });
    await queryInterface.addIndex('working_hours', ['organization_id']);
    await queryInterface.addIndex('working_hours', ['status']);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('working_hours');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_working_hours_status"');
  },
};
