'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('holidays', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
      organization_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'organizations', key: 'id' }, onDelete: 'CASCADE' },
      name: { type: Sequelize.STRING(150), allowNull: false },
      date: { type: Sequelize.DATEONLY, allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      status: { type: Sequelize.ENUM('active', 'inactive'), allowNull: false, defaultValue: 'active' },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
    });
    await queryInterface.addIndex('holidays', ['organization_id', 'date', 'name'], { unique: true });
    await queryInterface.addIndex('holidays', ['organization_id']);
    await queryInterface.addIndex('holidays', ['date']);
    await queryInterface.addIndex('holidays', ['status']);
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('holidays');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_holidays_status"');
  },
};
