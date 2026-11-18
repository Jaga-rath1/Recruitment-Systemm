const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const RecruitmentRole = sequelize.define(
    'RecruitmentRole',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      organisationId: { type: DataTypes.UUID, allowNull: false, field: 'organisation_id' },
      code: { type: DataTypes.STRING(80), allowNull: false },
      name: { type: DataTypes.STRING(120), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: false },
      isSystem: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'is_system' },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'is_active' }
    },
    {
      tableName: 'recruitment_roles',
      underscored: true,
      timestamps: true
    }
  );

  const RecruitmentPermission = sequelize.define(
    'RecruitmentPermission',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      code: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      name: { type: DataTypes.STRING(150), allowNull: false },
      module: { type: DataTypes.STRING(80), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: false }
    },
    {
      tableName: 'recruitment_permissions',
      underscored: true,
      timestamps: true,
      updatedAt: false
    }
  );

  const RecruitmentRolePermission = sequelize.define(
    'RecruitmentRolePermission',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      organisationId: { type: DataTypes.UUID, allowNull: false, field: 'organisation_id' },
      roleId: { type: DataTypes.UUID, allowNull: false, field: 'role_id' },
      permissionId: { type: DataTypes.UUID, allowNull: false, field: 'permission_id' }
    },
    {
      tableName: 'recruitment_role_permissions',
      underscored: true,
      timestamps: true,
      updatedAt: false
    }
  );

  const EmployeeRoleAssignment = sequelize.define(
    'EmployeeRoleAssignment',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      organisationId: { type: DataTypes.UUID, allowNull: false, field: 'organisation_id' },
      employeeId: { type: DataTypes.UUID, allowNull: false, field: 'employee_id' },
      authUserId: { type: DataTypes.UUID, allowNull: true, field: 'auth_user_id' },
      roleId: { type: DataTypes.UUID, allowNull: false, field: 'role_id' },
      customPermissions: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'custom_permissions' },
      revokedPermissions: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'revoked_permissions' },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'is_active' },
      assignedBy: { type: DataTypes.UUID, allowNull: true, field: 'assigned_by' },
      deactivatedBy: { type: DataTypes.UUID, allowNull: true, field: 'deactivated_by' },
      deactivatedAt: { type: DataTypes.DATE, allowNull: true, field: 'deactivated_at' },
      invitationStatus: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'EMPLOYEE_CREATED',
        field: 'invitation_status'
      },
      invitationTokenHash: {
        type: DataTypes.STRING(64),
        allowNull: true,
        field: 'invitation_token_hash'
      },
      invitationExpiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'invitation_expires_at'
      },
      invitationSentAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'invitation_sent_at'
      },
      invitationDeliveryStatus: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'PENDING',
        field: 'invitation_delivery_status'
      },
      invitationError: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'invitation_error'
      },
      invitationResendCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'invitation_resend_count'
      },
      accountActivatedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'account_activated_at'
      }
    },
    {
      tableName: 'employee_role_assignments',
      underscored: true,
      timestamps: true
    }
  );

  return {
    RecruitmentRole,
    RecruitmentPermission,
    RecruitmentRolePermission,
    EmployeeRoleAssignment
  };
};

