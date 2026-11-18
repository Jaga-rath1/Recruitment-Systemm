const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Subscription = sequelize.define(
    'Subscription',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      organisationId: { type: DataTypes.UUID, allowNull: true, field: 'organisation_id' },
      organisationName: { type: DataTypes.STRING(200), allowNull: false, field: 'organisation_name' },
      organisationDomain: { type: DataTypes.STRING(255), allowNull: false, field: 'organisation_domain' },
      industry: { type: DataTypes.STRING(120), allowNull: false },
      companySize: { type: DataTypes.STRING(60), allowNull: false, field: 'company_size' },
      adminName: { type: DataTypes.STRING(160), allowNull: false, field: 'admin_name' },
      adminEmail: { type: DataTypes.STRING(255), allowNull: false, field: 'admin_email' },
      planCode: { type: DataTypes.STRING(80), allowNull: false, defaultValue: 'RECRUITMENT_PREMIUM', field: 'plan_code' },
      billingCycle: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'ANNUAL', field: 'billing_cycle' },
      amountCents: { type: DataTypes.INTEGER, allowNull: false, field: 'amount_cents' },
      currency: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'USD' },
      status: {
        type: DataTypes.ENUM(
          'PENDING_PAYMENT',
          'PENDING_VERIFICATION',
          'APPROVED',
          'REJECTED',
          'TRIAL',
          'ACTIVE',
          'EXPIRED',
          'SUSPENDED',
          'CANCELLED'
        ),
        allowNull: false,
        defaultValue: 'PENDING_PAYMENT'
      },
      paymentInstructions: { type: DataTypes.JSONB, allowNull: false, field: 'payment_instructions' },
      activationTokenHash: { type: DataTypes.STRING(128), allowNull: true, unique: true, field: 'activation_token_hash' },
      activationExpiresAt: { type: DataTypes.DATE, allowNull: true, field: 'activation_expires_at' },
      activatedAt: { type: DataTypes.DATE, allowNull: true, field: 'activated_at' },
      approvedBy: { type: DataTypes.UUID, allowNull: true, field: 'approved_by' },
      approvedAt: { type: DataTypes.DATE, allowNull: true, field: 'approved_at' },
      rejectedReason: { type: DataTypes.TEXT, allowNull: true, field: 'rejected_reason' },
      provisioningStatus: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'PENDING', field: 'provisioning_status' },
      provisioningError: { type: DataTypes.TEXT, allowNull: true, field: 'provisioning_error' },
      invitationSentAt: { type: DataTypes.DATE, allowNull: true, field: 'invitation_sent_at' },
      invitationResendCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'invitation_resend_count' },
      startsAt: { type: DataTypes.DATE, allowNull: true, field: 'starts_at' },
      expiresAt: { type: DataTypes.DATE, allowNull: true, field: 'expires_at' },
      idempotencyKey: { type: DataTypes.STRING(128), allowNull: true, unique: true, field: 'idempotency_key' },
      isArchived: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_archived' },
      archivedAt: { type: DataTypes.DATE, allowNull: true, field: 'archived_at' },
      archivedBy: { type: DataTypes.UUID, allowNull: true, field: 'archived_by' },
      archiveReason: { type: DataTypes.TEXT, allowNull: true, field: 'archive_reason' },
      cancelledAt: { type: DataTypes.DATE, allowNull: true, field: 'cancelled_at' },
      cancelledBy: { type: DataTypes.UUID, allowNull: true, field: 'cancelled_by' },
      cancellationReason: { type: DataTypes.TEXT, allowNull: true, field: 'cancellation_reason' }
    },
    {
      tableName: 'subscriptions',
      underscored: true,
      timestamps: true
    }
  );

  const SubscriptionPayment = sequelize.define(
    'SubscriptionPayment',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      subscriptionId: { type: DataTypes.UUID, allowNull: false, field: 'subscription_id' },
      paymentReference: { type: DataTypes.STRING(160), allowNull: false, unique: true, field: 'payment_reference' },
      paymentMethod: { type: DataTypes.STRING(60), allowNull: false, field: 'payment_method' },
      amountCents: { type: DataTypes.INTEGER, allowNull: false, field: 'amount_cents' },
      currency: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'USD' },
      proofFileKey: { type: DataTypes.STRING(500), allowNull: true, field: 'proof_file_key' },
      proofFileName: { type: DataTypes.STRING(255), allowNull: true, field: 'proof_file_name' },
      proofMimeType: { type: DataTypes.STRING(120), allowNull: true, field: 'proof_mime_type' },
      proofFileSizeBytes: { type: DataTypes.INTEGER, allowNull: true, field: 'proof_file_size_bytes' },
      proofStorageProvider: { type: DataTypes.STRING(40), allowNull: true, field: 'proof_storage_provider' },
      proofCloudinaryPublicId: { type: DataTypes.STRING(500), allowNull: true, field: 'proof_cloudinary_public_id' },
      proofCloudinaryResourceType: { type: DataTypes.STRING(30), allowNull: true, field: 'proof_cloudinary_resource_type' },
      proofCloudinaryFormat: { type: DataTypes.STRING(30), allowNull: true, field: 'proof_cloudinary_format' },
      proofCloudinaryVersion: { type: DataTypes.STRING(60), allowNull: true, field: 'proof_cloudinary_version' },
      proofVisibility: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'AUTHENTICATED', field: 'proof_visibility' },
      proofChecksumSha256: { type: DataTypes.STRING(128), allowNull: true, field: 'proof_checksum_sha256' },
      proofScanStatus: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'NOT_SCANNED', field: 'proof_scan_status' },
      proofScanCheckedAt: { type: DataTypes.DATE, allowNull: true, field: 'proof_scan_checked_at' },
      submittedByEmail: { type: DataTypes.STRING(255), allowNull: false, field: 'submitted_by_email' },
      status: {
        type: DataTypes.ENUM('SUBMITTED', 'VERIFIED', 'REJECTED', 'VOIDED', 'ARCHIVED'),
        allowNull: false,
        defaultValue: 'SUBMITTED'
      },
      verifiedBy: { type: DataTypes.UUID, allowNull: true, field: 'verified_by' },
      verifiedAt: { type: DataTypes.DATE, allowNull: true, field: 'verified_at' },
      rejectionReason: { type: DataTypes.TEXT, allowNull: true, field: 'rejection_reason' },
      voidedBy: { type: DataTypes.UUID, allowNull: true, field: 'voided_by' },
      voidedAt: { type: DataTypes.DATE, allowNull: true, field: 'voided_at' },
      voidReason: { type: DataTypes.TEXT, allowNull: true, field: 'void_reason' },
      notes: { type: DataTypes.TEXT, allowNull: true },
      idempotencyKey: { type: DataTypes.STRING(128), allowNull: true, unique: true, field: 'idempotency_key' }
    },
    {
      tableName: 'subscription_payments',
      underscored: true,
      timestamps: true
    }
  );

  return { Subscription, SubscriptionPayment };
};

