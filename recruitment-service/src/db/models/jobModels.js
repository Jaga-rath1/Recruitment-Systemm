const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const JobSource = sequelize.define(
    'JobSource',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      organisationId: { type: DataTypes.UUID, allowNull: false, field: 'organisation_id' },
      sourceType: { type: DataTypes.ENUM('HRMS', 'MANUAL'), allowNull: false, field: 'source_type' },
      externalHrmsJobId: { type: DataTypes.STRING(120), allowNull: true, field: 'external_hrms_job_id' },
      rawPayload: { type: DataTypes.JSONB, allowNull: true, field: 'raw_payload' },
      lastSyncedAt: { type: DataTypes.DATE, allowNull: true, field: 'last_synced_at' },
      syncStatus: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'ACTIVE', field: 'sync_status' }
    },
    {
      tableName: 'job_sources',
      underscored: true,
      timestamps: true
    }
  );

  const Job = sequelize.define(
    'Job',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      organisationId: { type: DataTypes.UUID, allowNull: false, field: 'organisation_id' },
      jobSourceId: { type: DataTypes.UUID, allowNull: false, field: 'job_source_id' },
      sourceType: { type: DataTypes.ENUM('HRMS', 'MANUAL'), allowNull: false, field: 'source_type' },
      hrmsJobId: { type: DataTypes.STRING(120), allowNull: true, field: 'hrms_job_id' },
      title: { type: DataTypes.STRING(200), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: false },
      department: { type: DataTypes.STRING(120), allowNull: false },
      skills: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      experienceMinYears: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'experience_min_years' },
      experienceMaxYears: { type: DataTypes.INTEGER, allowNull: true, field: 'experience_max_years' },
      experienceLabel: { type: DataTypes.STRING(80), allowNull: false, field: 'experience_label' },
      salaryMin: { type: DataTypes.INTEGER, allowNull: true, field: 'salary_min' },
      salaryMax: { type: DataTypes.INTEGER, allowNull: true, field: 'salary_max' },
      salaryCurrency: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'USD', field: 'salary_currency' },
      salaryDisplay: { type: DataTypes.STRING(120), allowNull: false, field: 'salary_display' },
      location: { type: DataTypes.STRING(160), allowNull: false },
      employmentType: { type: DataTypes.STRING(60), allowNull: false, field: 'employment_type' },
      headcount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      applicationDeadline: { type: DataTypes.DATE, allowNull: true, field: 'application_deadline' },
      hrmsJobStatus: { type: DataTypes.STRING(60), allowNull: true, field: 'hrms_job_status' },
      recruitmentConfig: { type: DataTypes.JSONB, allowNull: false, defaultValue: {}, field: 'recruitment_config' },
      status: {
        type: DataTypes.ENUM('DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'CLOSED'),
        allowNull: false,
        defaultValue: 'DRAFT'
      },
      isDiscarded: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_discarded' },
      discardedAt: { type: DataTypes.DATE, allowNull: true, field: 'discarded_at' },
      discardedBy: { type: DataTypes.UUID, allowNull: true, field: 'discarded_by' },
      discardReason: { type: DataTypes.TEXT, allowNull: true, field: 'discard_reason' },
      unpublishReason: { type: DataTypes.TEXT, allowNull: true, field: 'unpublish_reason' },
      createdBy: { type: DataTypes.UUID, allowNull: true, field: 'created_by' },
      updatedBy: { type: DataTypes.UUID, allowNull: true, field: 'updated_by' }
    },
    {
      tableName: 'jobs',
      underscored: true,
      timestamps: true
    }
  );

  const JobPublication = sequelize.define(
    'JobPublication',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      organisationId: { type: DataTypes.UUID, allowNull: false, field: 'organisation_id' },
      jobId: { type: DataTypes.UUID, allowNull: false, unique: true, field: 'job_id' },
      slug: { type: DataTypes.STRING(220), allowNull: false, unique: true },
      isPublic: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_public' },
      publishedBy: { type: DataTypes.UUID, allowNull: true, field: 'published_by' },
      publishedAt: { type: DataTypes.DATE, allowNull: true, field: 'published_at' },
      unpublishedBy: { type: DataTypes.UUID, allowNull: true, field: 'unpublished_by' },
      unpublishedAt: { type: DataTypes.DATE, allowNull: true, field: 'unpublished_at' },
      unpublishReason: { type: DataTypes.TEXT, allowNull: true, field: 'unpublish_reason' },
      closedBy: { type: DataTypes.UUID, allowNull: true, field: 'closed_by' },
      closedAt: { type: DataTypes.DATE, allowNull: true, field: 'closed_at' },
      viewsCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'views_count' }
    },
    {
      tableName: 'job_publications',
      underscored: true,
      timestamps: true
    }
  );

  return { JobSource, Job, JobPublication };
};

