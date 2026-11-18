'use strict';
const { DataTypes, Sequelize } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('employees', {
      id: {
        type: DataTypes.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
        allowNull: false,
      },
      organization_id: { type: DataTypes.UUID, allowNull: false },
      employee_code:   { type: DataTypes.STRING(50), allowNull: false },

      first_name:  { type: DataTypes.STRING(100), allowNull: false },
      middle_name: { type: DataTypes.STRING(100), allowNull: true },
      last_name:   { type: DataTypes.STRING(100), allowNull: false },

      email:         { type: DataTypes.STRING(255), allowNull: true },
      phone:         { type: DataTypes.STRING(30),  allowNull: true },
      date_of_birth: { type: DataTypes.DATEONLY,    allowNull: true },
      gender: {
        type: DataTypes.ENUM('male', 'female', 'other', 'prefer_not_to_say'),
        allowNull: true,
      },

      address_line1: { type: DataTypes.STRING(255), allowNull: true },
      address_line2: { type: DataTypes.STRING(255), allowNull: true },
      city:          { type: DataTypes.STRING(100), allowNull: true },
      state:         { type: DataTypes.STRING(100), allowNull: true },
      postal_code:   { type: DataTypes.STRING(20),  allowNull: true },
      country:       { type: DataTypes.STRING(100), allowNull: true },

      branch_id:      { type: DataTypes.UUID, allowNull: true },
      department_id:  { type: DataTypes.UUID, allowNull: true },
      designation_id: { type: DataTypes.UUID, allowNull: true },

      manager_id: { type: DataTypes.UUID, allowNull: true },

      joining_date: { type: DataTypes.DATEONLY, allowNull: true },
      employment_type: {
        type: DataTypes.ENUM('full_time', 'part_time', 'contract', 'intern'),
        allowNull: true,
      },
      employment_status: {
        type: DataTypes.ENUM('permanent', 'probation', 'notice_period', 'resigned'),
        allowNull: true,
      },

      work_email: { type: DataTypes.STRING(255), allowNull: true },
      work_phone: { type: DataTypes.STRING(30),  allowNull: true },

      // auth_user_id links this employee record to an auth-service user
      auth_user_id: { type: DataTypes.UUID, allowNull: true },

      status: {
        type: DataTypes.ENUM('draft', 'onboarding', 'active', 'inactive', 'on_leave', 'terminated'),
        allowNull: false,
        defaultValue: 'draft',
      },

      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
    });

    // Composite unique: employee_code per organization
    await queryInterface.addIndex('employees', ['organization_id', 'employee_code'], {
      unique: true,
      name: 'employees_org_code_unique',
    });

    // Performance indexes
    await queryInterface.addIndex('employees', ['organization_id']);
    await queryInterface.addIndex('employees', ['status']);
    await queryInterface.addIndex('employees', ['branch_id']);
    await queryInterface.addIndex('employees', ['department_id']);
    await queryInterface.addIndex('employees', ['designation_id']);
    await queryInterface.addIndex('employees', ['manager_id']);
    await queryInterface.addIndex('employees', ['auth_user_id']);
    await queryInterface.addIndex('employees', ['email']);
    await queryInterface.addIndex('employees', ['work_email']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('employees');
  },
};
