'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('organization_settings', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
      organization_id: { type: Sequelize.UUID, allowNull: false, unique: true, references: { model: 'organizations', key: 'id' }, onDelete: 'CASCADE' },
      timezone: { type: Sequelize.STRING(100), allowNull: false, defaultValue: 'UTC' },
      currency: { type: Sequelize.STRING(10), allowNull: false, defaultValue: 'USD' },
      date_format: { type: Sequelize.STRING(30), allowNull: false, defaultValue: 'YYYY-MM-DD' },
      week_start_day: { type: Sequelize.ENUM('monday', 'sunday', 'saturday'), allowNull: false, defaultValue: 'monday' },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('organization_settings');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_organization_settings_week_start_day"');
  },
};
