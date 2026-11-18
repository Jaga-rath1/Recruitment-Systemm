'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('employees', 'team_id', { type: Sequelize.UUID, allowNull: true });
    await queryInterface.addColumn('employees', 'shift_id', { type: Sequelize.UUID, allowNull: true });
    await queryInterface.addIndex('employees', ['team_id']);
    await queryInterface.addIndex('employees', ['shift_id']);
    // One login maps to at most one employee record.
    await queryInterface.addIndex('employees', ['auth_user_id'], {
      unique: true,
      name: 'employees_auth_user_unique',
      where: { auth_user_id: { [Sequelize.Op.ne]: null } },
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('employees', 'employees_auth_user_unique');
    await queryInterface.removeColumn('employees', 'shift_id');
    await queryInterface.removeColumn('employees', 'team_id');
  },
};
