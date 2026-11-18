const defineSubscriptionModels = require('./subscriptionModels');
const defineRbacModels = require('./rbacModels');
const defineJobModels = require('./jobModels');
const defineApplicationModels = require('./applicationModels');
const defineInterviewModels = require('./interviewModels');
const defineOfferJoiningModels = require('./offerJoiningModels');
const defineNotificationHistoryModels = require('./notificationHistoryModel');

function initModels(sequelize) {
  const { Subscription, SubscriptionPayment } = defineSubscriptionModels(sequelize);
  const {
    RecruitmentRole,
    RecruitmentPermission,
    RecruitmentRolePermission,
    EmployeeRoleAssignment
  } = defineRbacModels(sequelize);
  const { JobSource, Job, JobPublication } = defineJobModels(sequelize);
  const {
    Candidate,
    Application,
    ApplicationDocument,
    ApplicationStageHistory,
    CandidateAccount
  } = defineApplicationModels(sequelize);
  const { Interview, InterviewAssignment, InterviewFeedback } = defineInterviewModels(sequelize);
  const { Offer, OfferDocument, JoiningRecord, RecruitmentAuditLog } = defineOfferJoiningModels(sequelize);
  const { RecruitmentNotificationHistory } = defineNotificationHistoryModels(sequelize);

  // Subscriptions <-> Payments
  Subscription.hasMany(SubscriptionPayment, { foreignKey: 'subscriptionId', as: 'payments', onDelete: 'CASCADE' });
  SubscriptionPayment.belongsTo(Subscription, { foreignKey: 'subscriptionId', as: 'subscription' });

  // RBAC
  RecruitmentRole.hasMany(RecruitmentRolePermission, { foreignKey: 'roleId', as: 'rolePermissions', onDelete: 'CASCADE' });
  RecruitmentRolePermission.belongsTo(RecruitmentRole, { foreignKey: 'roleId', as: 'role' });

  RecruitmentPermission.hasMany(RecruitmentRolePermission, { foreignKey: 'permissionId', as: 'rolePermissions', onDelete: 'CASCADE' });
  RecruitmentRolePermission.belongsTo(RecruitmentPermission, { foreignKey: 'permissionId', as: 'permission' });

  RecruitmentRole.hasMany(EmployeeRoleAssignment, { foreignKey: 'roleId', as: 'employeeAssignments' });
  EmployeeRoleAssignment.belongsTo(RecruitmentRole, { foreignKey: 'roleId', as: 'role' });

  // Jobs
  JobSource.hasMany(Job, { foreignKey: 'jobSourceId', as: 'jobs' });
  Job.belongsTo(JobSource, { foreignKey: 'jobSourceId', as: 'jobSource' });

  Job.hasOne(JobPublication, { foreignKey: 'jobId', as: 'publication', onDelete: 'CASCADE' });
  JobPublication.belongsTo(Job, { foreignKey: 'jobId', as: 'job' });

  // Candidates & Applications
  Job.hasMany(Application, { foreignKey: 'jobId', as: 'applications' });
  Application.belongsTo(Job, { foreignKey: 'jobId', as: 'job' });

  Candidate.hasMany(Application, { foreignKey: 'candidateId', as: 'applications' });
  Application.belongsTo(Candidate, { foreignKey: 'candidateId', as: 'candidate' });

  Candidate.hasMany(ApplicationDocument, { foreignKey: 'candidateId', as: 'documents', onDelete: 'CASCADE' });
  ApplicationDocument.belongsTo(Candidate, { foreignKey: 'candidateId', as: 'candidate' });

  Application.hasMany(ApplicationDocument, { foreignKey: 'applicationId', as: 'documents', onDelete: 'CASCADE' });
  ApplicationDocument.belongsTo(Application, { foreignKey: 'applicationId', as: 'application' });

  Application.hasMany(ApplicationStageHistory, { foreignKey: 'applicationId', as: 'stageHistory', onDelete: 'CASCADE' });
  ApplicationStageHistory.belongsTo(Application, { foreignKey: 'applicationId', as: 'application' });

  // Interviews
  Application.hasMany(Interview, { foreignKey: 'applicationId', as: 'interviews', onDelete: 'CASCADE' });
  Interview.belongsTo(Application, { foreignKey: 'applicationId', as: 'application' });

  Interview.hasMany(InterviewAssignment, { foreignKey: 'interviewId', as: 'assignments', onDelete: 'CASCADE' });
  InterviewAssignment.belongsTo(Interview, { foreignKey: 'interviewId', as: 'interview' });

  Interview.hasMany(InterviewFeedback, { foreignKey: 'interviewId', as: 'feedbacks', onDelete: 'CASCADE' });
  InterviewFeedback.belongsTo(Interview, { foreignKey: 'interviewId', as: 'interview' });

  Application.hasMany(InterviewFeedback, { foreignKey: 'applicationId', as: 'feedbacks', onDelete: 'CASCADE' });
  InterviewFeedback.belongsTo(Application, { foreignKey: 'applicationId', as: 'application' });

  // Offers & Joining
  Application.hasOne(Offer, { foreignKey: 'applicationId', as: 'offer' });
  Offer.belongsTo(Application, { foreignKey: 'applicationId', as: 'application' });

  Offer.hasMany(OfferDocument, { foreignKey: 'offerId', as: 'documents', onDelete: 'CASCADE' });
  OfferDocument.belongsTo(Offer, { foreignKey: 'offerId', as: 'offer' });

  Application.hasOne(JoiningRecord, { foreignKey: 'applicationId', as: 'joiningRecord' });
  JoiningRecord.belongsTo(Application, { foreignKey: 'applicationId', as: 'application' });

  Offer.hasOne(JoiningRecord, { foreignKey: 'offerId', as: 'joiningRecord' });
  JoiningRecord.belongsTo(Offer, { foreignKey: 'offerId', as: 'offer' });

  return {
    Subscription,
    SubscriptionPayment,
    RecruitmentRole,
    RecruitmentPermission,
    RecruitmentRolePermission,
    EmployeeRoleAssignment,
    JobSource,
    Job,
    JobPublication,
    Candidate,
    CandidateAccount,
    Application,
    ApplicationDocument,
    ApplicationStageHistory,
    Interview,
    InterviewAssignment,
    InterviewFeedback,
    Offer,
    OfferDocument,
    JoiningRecord,
    RecruitmentAuditLog,
    RecruitmentNotificationHistory
  };
}

module.exports = { initModels };

