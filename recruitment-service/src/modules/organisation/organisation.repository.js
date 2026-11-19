const { Op, fn, col } = require('sequelize');
const { getModels } = require('../../config/database');
const { toPlain, toPlainList } = require('../../utils/sequelizeHelpers');

async function getLatestSubscriptionForOrg(organisationId) {
  const { Subscription } = getModels();
  const row = await Subscription.findOne({
    where: { organisationId },
    order: [['createdAt', 'DESC']]
  });
  return toPlain(row);
}

async function listEmployeeAssignments(organisationId) {
  const { EmployeeRoleAssignment, RecruitmentRole, RecruitmentRolePermission, RecruitmentPermission } = getModels();
  const rows = await EmployeeRoleAssignment.findAll({
    where: { organisationId },
    include: [
      {
        model: RecruitmentRole,
        as: 'role',
        include: [
          {
            model: RecruitmentRolePermission,
            as: 'rolePermissions',
            include: [{ model: RecruitmentPermission, as: 'permission' }]
          }
        ]
      }
    ],
    order: [['createdAt', 'DESC']]
  });
  return toPlainList(rows);
}

async function findEmployeeAssignment(organisationId, employeeId, transaction = null) {
  const { EmployeeRoleAssignment, RecruitmentRole, RecruitmentRolePermission, RecruitmentPermission } = getModels();
  const row = await EmployeeRoleAssignment.findOne({
    where: { organisationId, employeeId },
    include: [
      {
        model: RecruitmentRole,
        as: 'role',
        include: [
          {
            model: RecruitmentRolePermission,
            as: 'rolePermissions',
            include: [{ model: RecruitmentPermission, as: 'permission' }]
          }
        ]
      }
    ],
    transaction
  });
  return toPlain(row);
}

async function upsertEmployeeAssignment(organisationId, employeeId, data, transaction = null) {
  const { EmployeeRoleAssignment } = getModels();
  const existing = await EmployeeRoleAssignment.findOne({
    where: { organisationId, employeeId },
    transaction
  });

  if (existing) {
    await existing.update(data.update, { transaction });
  } else {
    try {
      await EmployeeRoleAssignment.create(
        {
          organisationId,
          employeeId,
          ...data.create
        },
        { transaction }
      );
    } catch (err) {
      if (err.name === 'SequelizeUniqueConstraintError') {
        await EmployeeRoleAssignment.update(data.update, {
          where: { organisationId, employeeId },
          transaction
        });
      } else {
        throw err;
      }
    }
  }

  return findEmployeeAssignment(organisationId, employeeId, transaction);
}

async function updateEmployeeAssignment(organisationId, employeeId, data, transaction = null) {
  const { EmployeeRoleAssignment } = getModels();
  await EmployeeRoleAssignment.update(data, {
    where: { organisationId, employeeId },
    transaction
  });
  return findEmployeeAssignment(organisationId, employeeId, transaction);
}

async function deleteEmployeeAssignment(organisationId, employeeId, transaction = null) {
  const { EmployeeRoleAssignment } = getModels();
  const count = await EmployeeRoleAssignment.destroy({
    where: { organisationId, employeeId },
    transaction
  });
  return count > 0;
}

async function getEmployeeActivityStats(organisationId, employeeId, authUserId = null) {
  const { RecruitmentAuditLog, InterviewAssignment, Application, Job } = getModels();
  const actorIds = [employeeId, authUserId].filter(Boolean);

  const [auditLogs, interviewAssignments, applicationsScreened, jobsCreated] = await Promise.all([
    RecruitmentAuditLog.findAll({
      where: {
        organisationId,
        [Op.or]: [
          { actorEmployeeId: employeeId },
          ...(authUserId ? [{ actorUserId: authUserId }] : [])
        ]
      },
      order: [['createdAt', 'DESC']],
      limit: 30
    }),
    InterviewAssignment.count({
      where: { organisationId, interviewerEmployeeId: employeeId }
    }),
    Application.count({
      where: { organisationId, screenedBy: { [Op.in]: actorIds } }
    }),
    Job.count({
      where: { organisationId, createdBy: { [Op.in]: actorIds } }
    })
  ]);

  return {
    auditLogs: toPlainList(auditLogs),
    counts: {
      interviewAssignments,
      applicationsScreened,
      jobsCreated
    }
  };
}

async function getDashboardMetrics(organisationId) {
  const { Job, Application, Interview, Offer } = getModels();
  const [
    totalJobs,
    publishedJobs,
    totalApplications,
    stageRows,
    upcomingInterviews,
    pendingOffers,
    hiredCount
  ] = await Promise.all([
    Job.count({ where: { organisationId } }),
    Job.count({ where: { organisationId, status: 'PUBLISHED' } }),
    Application.count({ where: { organisationId } }),
    Application.findAll({
      where: { organisationId },
      attributes: ['currentStage', [fn('COUNT', col('id')), 'count']],
      group: ['currentStage'],
      raw: true
    }),
    Interview.count({
      where: { organisationId, status: { [Op.in]: ['SCHEDULED', 'RESCHEDULED'] } }
    }),
    Offer.count({
      where: { organisationId, status: 'SENT' }
    }),
    Application.count({
      where: { organisationId, currentStage: 'HIRED' }
    })
  ]);

  return {
    totalJobs,
    publishedJobs,
    totalApplications,
    upcomingInterviews,
    pendingOffers,
    hiredCount,
    stageBreakdown: stageRows.map((row) => ({
      stage: row.currentStage,
      count: Number(row.count)
    }))
  };
}

module.exports = {
  getLatestSubscriptionForOrg,
  listEmployeeAssignments,
  findEmployeeAssignment,
  upsertEmployeeAssignment,
  updateEmployeeAssignment,
  deleteEmployeeAssignment,
  getEmployeeActivityStats,
  getDashboardMetrics
};
