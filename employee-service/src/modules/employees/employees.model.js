'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const Employee = sequelize.define('Employee', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  organizationId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'organization_id',
  },
  employeeCode: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'employee_code',
  },

  firstName:  { type: DataTypes.STRING(100), allowNull: false, field: 'first_name' },
  middleName: { type: DataTypes.STRING(100), allowNull: true,  field: 'middle_name' },
  lastName:   { type: DataTypes.STRING(100), allowNull: false, field: 'last_name' },

  email:       { type: DataTypes.STRING(255), allowNull: true },
  phone:       { type: DataTypes.STRING(30),  allowNull: true },
  dateOfBirth: { type: DataTypes.DATEONLY,    allowNull: true, field: 'date_of_birth' },
  gender: {
    type: DataTypes.ENUM('male', 'female', 'other', 'prefer_not_to_say'),
    allowNull: true,
  },

  addressLine1: { type: DataTypes.STRING(255), allowNull: true, field: 'address_line1' },
  addressLine2: { type: DataTypes.STRING(255), allowNull: true, field: 'address_line2' },
  city:         { type: DataTypes.STRING(100), allowNull: true },
  state:        { type: DataTypes.STRING(100), allowNull: true },
  postalCode:   { type: DataTypes.STRING(20),  allowNull: true, field: 'postal_code' },
  country:      { type: DataTypes.STRING(100), allowNull: true },

  branchId:      { type: DataTypes.UUID, allowNull: true, field: 'branch_id' },
  departmentId:  { type: DataTypes.UUID, allowNull: true, field: 'department_id' },
  designationId: { type: DataTypes.UUID, allowNull: true, field: 'designation_id' },
  teamId:        { type: DataTypes.UUID, allowNull: true, field: 'team_id' },
  shiftId:       { type: DataTypes.UUID, allowNull: true, field: 'shift_id' },

  managerId: { type: DataTypes.UUID, allowNull: true, field: 'manager_id' },

  joiningDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'joining_date' },
  employmentType: {
    type: DataTypes.ENUM('full_time', 'part_time', 'contract', 'intern'),
    allowNull: true,
    field: 'employment_type',
  },
  employmentStatus: {
    type: DataTypes.ENUM('permanent', 'probation', 'notice_period', 'resigned'),
    allowNull: true,
    field: 'employment_status',
  },

  workEmail: { type: DataTypes.STRING(255), allowNull: true, field: 'work_email' },
  workPhone: { type: DataTypes.STRING(30),  allowNull: true, field: 'work_phone' },

  authUserId: { type: DataTypes.UUID, allowNull: true, field: 'auth_user_id' },

  status: {
    type: DataTypes.ENUM('draft', 'onboarding', 'active', 'inactive', 'on_leave', 'terminated'),
    allowNull: false,
    defaultValue: 'draft',
  },
}, {
  tableName: 'employees',
  underscored: true,
});

// Self-reference associations
Employee.belongsTo(Employee, { foreignKey: 'managerId', as: 'manager' });
Employee.hasMany(Employee, { foreignKey: 'managerId', as: 'directReports' });

module.exports = Employee;
