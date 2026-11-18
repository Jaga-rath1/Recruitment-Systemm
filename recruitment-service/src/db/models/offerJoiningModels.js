const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Offer = sequelize.define(
    'Offer',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      organisationId: { type: DataTypes.UUID, allowNull: false, field: 'organisation_id' },
      applicationId: { type: DataTypes.UUID, allowNull: false, unique: true, field: 'application_id' },
      offeredSalary: { type: DataTypes.INTEGER, allowNull: false, field: 'offered_salary' },
      salaryCurrency: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'USD', field: 'salary_currency' },
      designation: { type: DataTypes.STRING(160), allowNull: false },
      department: { type: DataTypes.STRING(120), allowNull: false },
      joiningDate: { type: DataTypes.DATE, allowNull: false, field: 'joining_date' },
      offerValidUntil: { type: DataTypes.DATE, allowNull: false, field: 'offer_valid_until' },
      termsSummary: { type: DataTypes.TEXT, allowNull: true, field: 'terms_summary' },
      status: {
        type: DataTypes.ENUM('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'WITHDRAWN'),
        allowNull: false,
        defaultValue: 'DRAFT'
      },
      sentBy: { type: DataTypes.UUID, allowNull: true, field: 'sent_by' },
      sentAt: { type: DataTypes.DATE, allowNull: true, field: 'sent_at' },
      candidateRespondedAt: { type: DataTypes.DATE, allowNull: true, field: 'candidate_responded_at' },
      candidateResponseNote: { type: DataTypes.TEXT, allowNull: true, field: 'candidate_response_note' },
      idempotencyKey: { type: DataTypes.STRING(128), allowNull: true, unique: true, field: 'idempotency_key' }
    },
    {
      tableName: 'offers',
      underscored: true,
      timestamps: true
    }
  );

  const OfferDocument = sequelize.define(
    'OfferDocument',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      organisationId: { type: DataTypes.UUID, allowNull: false, field: 'organisation_id' },
      offerId: { type: DataTypes.UUID, allowNull: false, field: 'offer_id' },
      documentType: {
        type: DataTypes.ENUM('OFFER_LETTER', 'SIGNED_OFFER'),
        allowNull: false,
        defaultValue: 'OFFER_LETTER',
        field: 'document_type'
      },
      fileName: { type: DataTypes.STRING(255), allowNull: false, field: 'file_name' },
      mimeType: { type: DataTypes.STRING(120), allowNull: false, field: 'mime_type' },
      fileSizeBytes: { type: DataTypes.INTEGER, allowNull: false, field: 'file_size_bytes' },
      storageProvider: { type: DataTypes.STRING(40), allowNull: false, field: 'storage_provider' },
      storageKey: { type: DataTypes.STRING(500), allowNull: false, unique: true, field: 'storage_key' },
      cloudinaryPublicId: { type: DataTypes.STRING(500), allowNull: true, field: 'cloudinary_public_id' },
      cloudinaryResourceType: { type: DataTypes.STRING(30), allowNull: true, field: 'cloudinary_resource_type' },
      cloudinaryFormat: { type: DataTypes.STRING(30), allowNull: true, field: 'cloudinary_format' },
      cloudinaryVersion: { type: DataTypes.STRING(60), allowNull: true, field: 'cloudinary_version' },
      storageVisibility: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'AUTHENTICATED', field: 'storage_visibility' },
      checksumSha256: { type: DataTypes.STRING(128), allowNull: true, field: 'checksum_sha256' },
      scanStatus: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'NOT_SCANNED', field: 'scan_status' },
      scanCheckedAt: { type: DataTypes.DATE, allowNull: true, field: 'scan_checked_at' },
      scanEngine: { type: DataTypes.STRING(80), allowNull: true, field: 'scan_engine' },
      uploadedBy: { type: DataTypes.UUID, allowNull: false, field: 'uploaded_by' }
    },
    {
      tableName: 'offer_documents',
      underscored: true,
      timestamps: true,
      updatedAt: false
    }
  );

  const JoiningRecord = sequelize.define(
    'JoiningRecord',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      organisationId: { type: DataTypes.UUID, allowNull: false, field: 'organisation_id' },
      applicationId: { type: DataTypes.UUID, allowNull: false, unique: true, field: 'application_id' },
      offerId: { type: DataTypes.UUID, allowNull: false, unique: true, field: 'offer_id' },
      expectedJoiningDate: { type: DataTypes.DATE, allowNull: false, field: 'expected_joining_date' },
      actualJoiningDate: { type: DataTypes.DATE, allowNull: true, field: 'actual_joining_date' },
      joiningLocation: { type: DataTypes.STRING(200), allowNull: false, field: 'joining_location' },
      reportingManager: { type: DataTypes.STRING(160), allowNull: true, field: 'reporting_manager' },
      onboardingNotes: { type: DataTypes.TEXT, allowNull: true, field: 'onboarding_notes' },
      joiningLetterFileName: { type: DataTypes.STRING(255), allowNull: true, field: 'joining_letter_file_name' },
      joiningLetterMimeType: { type: DataTypes.STRING(120), allowNull: true, field: 'joining_letter_mime_type' },
      joiningLetterFileSizeBytes: { type: DataTypes.INTEGER, allowNull: true, field: 'joining_letter_file_size_bytes' },
      joiningLetterStorageProvider: { type: DataTypes.STRING(40), allowNull: true, field: 'joining_letter_storage_provider' },
      joiningLetterStorageKey: { type: DataTypes.STRING(500), allowNull: true, field: 'joining_letter_storage_key' },
      joiningLetterCloudinaryPublicId: { type: DataTypes.STRING(500), allowNull: true, field: 'joining_letter_cloudinary_public_id' },
      joiningLetterCloudinaryResourceType: { type: DataTypes.STRING(30), allowNull: true, field: 'joining_letter_cloudinary_resource_type' },
      joiningLetterCloudinaryFormat: { type: DataTypes.STRING(30), allowNull: true, field: 'joining_letter_cloudinary_format' },
      joiningLetterCloudinaryVersion: { type: DataTypes.STRING(60), allowNull: true, field: 'joining_letter_cloudinary_version' },
      joiningLetterVisibility: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'AUTHENTICATED', field: 'joining_letter_visibility' },
      joiningLetterChecksumSha256: { type: DataTypes.STRING(128), allowNull: true, field: 'joining_letter_checksum_sha256' },
      joiningLetterScanStatus: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'NOT_SCANNED', field: 'joining_letter_scan_status' },
      joiningLetterScanCheckedAt: { type: DataTypes.DATE, allowNull: true, field: 'joining_letter_scan_checked_at' },
      status: {
        type: DataTypes.ENUM('INITIATED', 'LETTER_SENT', 'CONFIRMED', 'JOINED', 'NO_SHOW', 'CANCELLED'),
        allowNull: false,
        defaultValue: 'INITIATED'
      },
      initiatedBy: { type: DataTypes.UUID, allowNull: false, field: 'initiated_by' },
      confirmedBy: { type: DataTypes.UUID, allowNull: true, field: 'confirmed_by' },
      hiredAt: { type: DataTypes.DATE, allowNull: true, field: 'hired_at' },
      idempotencyKey: { type: DataTypes.STRING(128), allowNull: true, unique: true, field: 'idempotency_key' }
    },
    {
      tableName: 'joining_records',
      underscored: true,
      timestamps: true
    }
  );

  const RecruitmentAuditLog = sequelize.define(
    'RecruitmentAuditLog',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      organisationId: { type: DataTypes.UUID, allowNull: true, field: 'organisation_id' },
      actorUserId: { type: DataTypes.UUID, allowNull: true, field: 'actor_user_id' },
      actorEmployeeId: { type: DataTypes.UUID, allowNull: true, field: 'actor_employee_id' },
      actorRole: { type: DataTypes.STRING(80), allowNull: true, field: 'actor_role' },
      entityType: { type: DataTypes.STRING(80), allowNull: false, field: 'entity_type' },
      entityId: { type: DataTypes.STRING(120), allowNull: true, field: 'entity_id' },
      action: { type: DataTypes.STRING(120), allowNull: false },
      requestId: { type: DataTypes.STRING(120), allowNull: true, field: 'request_id' },
      ipAddress: { type: DataTypes.STRING(80), allowNull: true, field: 'ip_address' },
      userAgent: { type: DataTypes.STRING(400), allowNull: true, field: 'user_agent' },
      beforeState: { type: DataTypes.JSONB, allowNull: true, field: 'before_state' },
      afterState: { type: DataTypes.JSONB, allowNull: true, field: 'after_state' }
    },
    {
      tableName: 'recruitment_audit_logs',
      underscored: true,
      timestamps: true,
      updatedAt: false
    }
  );

  return { Offer, OfferDocument, JoiningRecord, RecruitmentAuditLog };
};

