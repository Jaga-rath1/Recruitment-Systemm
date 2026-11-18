const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Interview = sequelize.define(
    'Interview',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      organisationId: { type: DataTypes.UUID, allowNull: false, field: 'organisation_id' },
      applicationId: { type: DataTypes.UUID, allowNull: false, field: 'application_id' },
      roundType: { type: DataTypes.ENUM('TECHNICAL', 'MANAGERIAL'), allowNull: false, field: 'round_type' },
      roundNumber: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, field: 'round_number' },
      scheduledAt: { type: DataTypes.DATE, allowNull: false, field: 'scheduled_at' },
      durationMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 60, field: 'duration_minutes' },
      meetingMode: { type: DataTypes.ENUM('VIDEO', 'IN_PERSON', 'PHONE'), allowNull: false, defaultValue: 'VIDEO', field: 'meeting_mode' },
      meetingLinkOrLocation: { type: DataTypes.STRING(500), allowNull: false, field: 'meeting_link_or_location' },
      status: {
        type: DataTypes.ENUM('SCHEDULED', 'RESCHEDULED', 'COMPLETED', 'CANCELLED'),
        allowNull: false,
        defaultValue: 'SCHEDULED'
      },
      scheduledBy: { type: DataTypes.UUID, allowNull: false, field: 'scheduled_by' },
      rescheduleReason: { type: DataTypes.TEXT, allowNull: true, field: 'reschedule_reason' }
    },
    {
      tableName: 'interviews',
      underscored: true,
      timestamps: true
    }
  );

  const InterviewAssignment = sequelize.define(
    'InterviewAssignment',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      organisationId: { type: DataTypes.UUID, allowNull: false, field: 'organisation_id' },
      interviewId: { type: DataTypes.UUID, allowNull: false, field: 'interview_id' },
      interviewerEmployeeId: { type: DataTypes.UUID, allowNull: false, field: 'interviewer_employee_id' },
      interviewerRole: {
        type: DataTypes.ENUM('TECHNICAL_INTERVIEWER', 'SENIOR_INTERVIEWER'),
        allowNull: false,
        field: 'interviewer_role'
      },
      assignedBy: { type: DataTypes.UUID, allowNull: false, field: 'assigned_by' },
      status: {
        type: DataTypes.ENUM('ASSIGNED', 'ACCEPTED', 'COMPLETED', 'REASSIGNED'),
        allowNull: false,
        defaultValue: 'ASSIGNED'
      }
    },
    {
      tableName: 'interview_assignments',
      underscored: true,
      timestamps: true
    }
  );

  const InterviewFeedback = sequelize.define(
    'InterviewFeedback',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      organisationId: { type: DataTypes.UUID, allowNull: false, field: 'organisation_id' },
      interviewId: { type: DataTypes.UUID, allowNull: false, field: 'interview_id' },
      applicationId: { type: DataTypes.UUID, allowNull: false, field: 'application_id' },
      interviewerEmployeeId: { type: DataTypes.UUID, allowNull: false, field: 'interviewer_employee_id' },
      roundType: { type: DataTypes.ENUM('TECHNICAL', 'MANAGERIAL'), allowNull: false, field: 'round_type' },
      overallRating: { type: DataTypes.INTEGER, allowNull: false, field: 'overall_rating' },
      technicalSkillsRating: { type: DataTypes.INTEGER, allowNull: true, field: 'technical_skills_rating' },
      communicationRating: { type: DataTypes.INTEGER, allowNull: true, field: 'communication_rating' },
      behaviouralRating: { type: DataTypes.INTEGER, allowNull: true, field: 'behavioural_rating' },
      problemSolvingRating: { type: DataTypes.INTEGER, allowNull: true, field: 'problem_solving_rating' },
      leadershipRating: { type: DataTypes.INTEGER, allowNull: true, field: 'leadership_rating' },
      strengths: { type: DataTypes.TEXT, allowNull: false },
      weaknesses: { type: DataTypes.TEXT, allowNull: false },
      detailedFeedback: { type: DataTypes.TEXT, allowNull: false, field: 'detailed_feedback' },
      recommendation: {
        type: DataTypes.ENUM('SELECTED', 'REJECTED', 'ON_HOLD'),
        allowNull: false
      },
      submittedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'submitted_at' }
    },
    {
      tableName: 'interview_feedback',
      underscored: true,
      timestamps: true
    }
  );

  return { Interview, InterviewAssignment, InterviewFeedback };
};

