const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const RecruitmentNotificationHistory = sequelize.define(
    'RecruitmentNotificationHistory',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      notificationId: {
        type: DataTypes.STRING(128),
        allowNull: false,
        unique: true,
        field: 'notification_id'
      },
      eventType: {
        type: DataTypes.STRING(100),
        allowNull: false,
        field: 'event_type'
      },
      category: {
        type: DataTypes.STRING(100),
        allowNull: false,
        defaultValue: 'RECRUITMENT'
      },
      recipientEmail: {
        type: DataTypes.STRING(255),
        allowNull: false,
        field: 'recipient_email'
      },
      recipientName: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'recipient_name'
      },
      recipientType: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'ORGANISATION_ADMIN',
        field: 'recipient_type'
      },
      organisationId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'organisation_id'
      },
      organisationName: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'organisation_name'
      },
      title: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      message: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      deliveryStatus: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'ACCEPTED',
        field: 'delivery_status'
      },
      provider: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'STANDALONE'
      },
      providerMessageId: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'provider_message_id'
      },
      deliveryError: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'delivery_error'
      },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {}
      },
      isDeleted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'is_deleted'
      },
      deletedBy: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'deleted_by'
      },
      deletedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'deleted_at'
      },
      deleteReason: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'delete_reason'
      }
    },
    {
      tableName: 'recruitment_notification_history',
      timestamps: true,
      underscored: true
    }
  );

  return { RecruitmentNotificationHistory };
};
