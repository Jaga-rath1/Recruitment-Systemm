const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Candidate = sequelize.define(
    'Candidate',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      organisationId: { type: DataTypes.UUID, allowNull: false, field: 'organisation_id' },
      authUserId: { type: DataTypes.UUID, allowNull: true, field: 'auth_user_id' },
      fullName: { type: DataTypes.STRING(180), allowNull: false, field: 'full_name' },
      email: { type: DataTypes.STRING(255), allowNull: false },
      mobileNumber: { type: DataTypes.STRING(40), allowNull: false, field: 'mobile_number' },
      location: { type: DataTypes.STRING(160), allowNull: false },
      totalExperienceYears: { type: DataTypes.FLOAT, allowNull: false, field: 'total_experience_years' },
      currentCompany: { type: DataTypes.STRING(160), allowNull: true, field: 'current_company' },
      currentSalary: { type: DataTypes.STRING(80), allowNull: true, field: 'current_salary' },
      expectedSalary: { type: DataTypes.STRING(80), allowNull: true, field: 'expected_salary' },
      noticePeriodDays: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'notice_period_days' },
      skills: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      headline: { type: DataTypes.STRING(255), allowNull: true },
      linkedinUrl: { type: DataTypes.STRING(300), allowNull: true, field: 'linkedin_url' },
      portfolioUrl: { type: DataTypes.STRING(300), allowNull: true, field: 'portfolio_url' },
      claimedAt: { type: DataTypes.DATE, allowNull: true, field: 'claimed_at' }
    },
    {
      tableName: 'candidates',
      underscored: true,
      timestamps: true
    }
  );

  const Application = sequelize.define(
    'Application',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      organisationId: { type: DataTypes.UUID, allowNull: false, field: 'organisation_id' },
      jobId: { type: DataTypes.UUID, allowNull: false, field: 'job_id' },
      candidateId: { type: DataTypes.UUID, allowNull: false, field: 'candidate_id' },
      applicationReference: { type: DataTypes.STRING(60), allowNull: false, unique: true, field: 'application_reference' },
      coverLetter: { type: DataTypes.TEXT, allowNull: true, field: 'cover_letter' },
      screeningStatus: {
        type: DataTypes.ENUM('PENDING', 'SHORTLISTED', 'REJECTED', 'ON_HOLD'),
        allowNull: false,
        defaultValue: 'PENDING',
        field: 'screening_status'
      },
      screeningNotes: { type: DataTypes.TEXT, allowNull: true, field: 'screening_notes' },
      screenedBy: { type: DataTypes.UUID, allowNull: true, field: 'screened_by' },
      screenedAt: { type: DataTypes.DATE, allowNull: true, field: 'screened_at' },
      currentStage: {
        type: DataTypes.ENUM(
          'APPLIED',
          'SCREENING',
          'TECHNICAL_INTERVIEW',
          'MANAGERIAL_INTERVIEW',
          'FINAL_SELECTION',
          'OFFER_PROCESSING',
          'OFFER_ACCEPTED',
          'JOINING',
          'HIRED',
          'REJECTED',
          'ON_HOLD'
        ),
        allowNull: false,
        defaultValue: 'APPLIED',
        field: 'current_stage'
      },
      finalDecisionBy: { type: DataTypes.UUID, allowNull: true, field: 'final_decision_by' },
      finalDecisionAt: { type: DataTypes.DATE, allowNull: true, field: 'final_decision_at' },
      finalDecisionNotes: { type: DataTypes.TEXT, allowNull: true, field: 'final_decision_notes' },
      sourceChannel: { type: DataTypes.STRING(60), allowNull: false, defaultValue: 'CAREERS_PORTAL', field: 'source_channel' }
    },
    {
      tableName: 'applications',
      underscored: true,
      timestamps: true
    }
  );

  const ApplicationDocument = sequelize.define(
    'ApplicationDocument',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      organisationId: { type: DataTypes.UUID, allowNull: false, field: 'organisation_id' },
      applicationId: { type: DataTypes.UUID, allowNull: false, field: 'application_id' },
      candidateId: { type: DataTypes.UUID, allowNull: false, field: 'candidate_id' },
      documentType: {
        type: DataTypes.ENUM('RESUME', 'COVER_LETTER', 'PORTFOLIO', 'OTHER'),
        allowNull: false,
        defaultValue: 'RESUME',
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
      checksumSha256: { type: DataTypes.STRING(128), allowNull: false, field: 'checksum_sha256' },
      scanStatus: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'NOT_SCANNED', field: 'scan_status' },
      scanCheckedAt: { type: DataTypes.DATE, allowNull: true, field: 'scan_checked_at' },
      scanEngine: { type: DataTypes.STRING(80), allowNull: true, field: 'scan_engine' },
      uploadedBy: { type: DataTypes.UUID, allowNull: true, field: 'uploaded_by' }
    },
    {
      tableName: 'application_documents',
      underscored: true,
      timestamps: true,
      updatedAt: false
    }
  );

  const ApplicationStageHistory = sequelize.define(
    'ApplicationStageHistory',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      organisationId: { type: DataTypes.UUID, allowNull: false, field: 'organisation_id' },
      applicationId: { type: DataTypes.UUID, allowNull: false, field: 'application_id' },
      fromStage: { type: DataTypes.STRING(60), allowNull: true, field: 'from_stage' },
      toStage: { type: DataTypes.STRING(60), allowNull: false, field: 'to_stage' },
      action: { type: DataTypes.STRING(100), allowNull: false },
      actorUserId: { type: DataTypes.UUID, allowNull: true, field: 'actor_user_id' },
      actorRole: { type: DataTypes.STRING(80), allowNull: true, field: 'actor_role' },
      internalRemark: { type: DataTypes.TEXT, allowNull: true, field: 'internal_remark' },
      candidateVisibleNote: { type: DataTypes.TEXT, allowNull: true, field: 'candidate_visible_note' },
      metadata: { type: DataTypes.JSONB, allowNull: true }
    },
    {
      tableName: 'application_stage_history',
      underscored: true,
      timestamps: true,
      updatedAt: false
    }
  );

  const CandidateAccount = sequelize.define(
    'CandidateAccount',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
      fullName: { type: DataTypes.STRING(180), allowNull: false, field: 'full_name' },
      passwordHash: { type: DataTypes.STRING(255), allowNull: false, field: 'password_hash' },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'is_active' },
      emailVerified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'email_verified' },
      emailVerifiedAt: { type: DataTypes.DATE, allowNull: true, field: 'email_verified_at' },
      verificationTokenHash: { type: DataTypes.STRING(128), allowNull: true, field: 'verification_token_hash' },
      verificationExpiresAt: { type: DataTypes.DATE, allowNull: true, field: 'verification_expires_at' },
      verificationAttempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'verification_attempts' },
      verificationLockedUntil: { type: DataTypes.DATE, allowNull: true, field: 'verification_locked_until' },
      verificationSentAt: { type: DataTypes.DATE, allowNull: true, field: 'verification_sent_at' },
      resetTokenHash: { type: DataTypes.STRING(128), allowNull: true, field: 'reset_token_hash' },
      resetExpiresAt: { type: DataTypes.DATE, allowNull: true, field: 'reset_expires_at' },
      resetAttempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'reset_attempts' },
      resetSentAt: { type: DataTypes.DATE, allowNull: true, field: 'reset_sent_at' },
      passwordChangedAt: { type: DataTypes.DATE, allowNull: true, field: 'password_changed_at' },
      tokenVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, field: 'token_version' },
      failedLoginAttempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'failed_login_attempts' },
      lockedUntil: { type: DataTypes.DATE, allowNull: true, field: 'locked_until' },
      lastLoginAt: { type: DataTypes.DATE, allowNull: true, field: 'last_login_at' },
      lastSecurityEventAt: { type: DataTypes.DATE, allowNull: true, field: 'last_security_event_at' }
    },
    {
      tableName: 'candidate_accounts',
      underscored: true,
      timestamps: true
    }
  );

  return { Candidate, Application, ApplicationDocument, ApplicationStageHistory, CandidateAccount };
};

