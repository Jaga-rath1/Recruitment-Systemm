const { Op, fn, col } = require('sequelize');
const { getModels } = require('../../config/database');
const { toPlain, toPlainList } = require('../../utils/sequelizeHelpers');

function buildCandidateOwnerWhere({ userId }) {
  if (!userId) {
    return { id: null };
  }
  return { authUserId: userId };
}

async function findCandidateProfilesForAuthUser({ userId, email }) {
  const { Candidate } = getModels();
  const rows = await Candidate.findAll({
    where: buildCandidateOwnerWhere({ userId, email }),
    order: [['updatedAt', 'DESC']]
  });
  return toPlainList(rows);
}

async function updateCandidateProfilesForAuthUser({ userId, email }, data) {
  const { Candidate } = getModels();
  return Candidate.update(data, {
    where: buildCandidateOwnerWhere({ userId, email })
  });
}

async function findCandidateApplications({ userId, email }) {
  const {
    Application,
    Candidate,
    Job,
    ApplicationDocument,
    ApplicationStageHistory,
    Interview,
    Offer,
    OfferDocument,
    JoiningRecord
  } = getModels();

  const rows = await Application.findAll({
    attributes: [
      'id',
      'organisationId',
      'applicationReference',
      'currentStage',
      'screeningStatus',
      'coverLetter',
      'createdAt',
      'updatedAt'
    ],
    include: [
      {
        model: Candidate,
        as: 'candidate',
        where: buildCandidateOwnerWhere({ userId, email }),
        attributes: [],
        required: true
      },
      {
        model: Job,
        as: 'job',
        attributes: ['id', 'title', 'department', 'location', 'employmentType', 'salaryDisplay']
      },
      {
        model: ApplicationDocument,
        as: 'documents',
        attributes: ['id', 'documentType', 'fileName', 'mimeType', 'fileSizeBytes', 'storageKey', 'createdAt']
      },
      {
        model: ApplicationStageHistory,
        as: 'stageHistory',
        attributes: ['id', 'fromStage', 'toStage', 'action', 'candidateVisibleNote', 'createdAt']
      },
      {
        model: Interview,
        as: 'interviews',
        attributes: [
          'id',
          'roundType',
          'roundNumber',
          'scheduledAt',
          'durationMinutes',
          'meetingMode',
          'meetingLinkOrLocation',
          'status',
          'rescheduleReason'
        ]
      },
      {
        model: Offer,
        as: 'offer',
        attributes: [
          'id',
          'offeredSalary',
          'salaryCurrency',
          'designation',
          'department',
          'joiningDate',
          'offerValidUntil',
          'termsSummary',
          'status',
          'sentAt',
          'candidateRespondedAt'
        ],
        include: [
          {
            model: OfferDocument,
            as: 'documents',
            attributes: ['id', 'documentType', 'fileName', 'mimeType', 'storageKey']
          }
        ]
      },
      {
        model: JoiningRecord,
        as: 'joiningRecord',
        attributes: [
          'id',
          'expectedJoiningDate',
          'actualJoiningDate',
          'joiningLocation',
          'reportingManager',
          'onboardingNotes',
          'joiningLetterFileName',
          'joiningLetterMimeType',
          'joiningLetterStorageKey',
          'status',
          'hiredAt'
        ]
      }
    ],
    order: [
      ['createdAt', 'DESC'],
      [{ model: ApplicationStageHistory, as: 'stageHistory' }, 'createdAt', 'ASC'],
      [{ model: Interview, as: 'interviews' }, 'scheduledAt', 'ASC']
    ]
  });

  return toPlainList(rows);
}

async function findOwnedOffer({ userId, email, offerId }) {
  const { Offer, Application, Candidate, Job } = getModels();
  const row = await Offer.findOne({
    where: { id: offerId },
    include: [
      {
        model: Application,
        as: 'application',
        required: true,
        include: [
          {
            model: Candidate,
            as: 'candidate',
            where: buildCandidateOwnerWhere({ userId, email }),
            required: true
          },
          { model: Job, as: 'job' }
        ]
      }
    ]
  });
  return toPlain(row);
}

async function getRecruitmentAnalytics(organisationId) {
  const { Job, Application, Interview, Offer, JoiningRecord, Candidate } = getModels();
  const [
    jobsBySource,
    jobsByStatus,
    appsByStage,
    interviewsByRound,
    offersByStatus,
    joiningByStatus,
    recentHires
  ] = await Promise.all([
    Job.findAll({
      where: { organisationId },
      attributes: ['sourceType', [fn('COUNT', col('id')), 'count']],
      group: ['sourceType'],
      raw: true
    }),
    Job.findAll({
      where: { organisationId },
      attributes: ['status', [fn('COUNT', col('id')), 'count']],
      group: ['status'],
      raw: true
    }),
    Application.findAll({
      where: { organisationId },
      attributes: ['currentStage', [fn('COUNT', col('id')), 'count']],
      group: ['currentStage'],
      raw: true
    }),
    Interview.findAll({
      where: { organisationId },
      attributes: ['roundType', 'status', [fn('COUNT', col('id')), 'count']],
      group: ['roundType', 'status'],
      raw: true
    }),
    Offer.findAll({
      where: { organisationId },
      attributes: ['status', [fn('COUNT', col('id')), 'count']],
      group: ['status'],
      raw: true
    }),
    JoiningRecord.findAll({
      where: { organisationId },
      attributes: ['status', [fn('COUNT', col('id')), 'count']],
      group: ['status'],
      raw: true
    }),
    JoiningRecord.findAll({
      where: { organisationId, status: 'JOINED' },
      include: [
        {
          model: Application,
          as: 'application',
          attributes: ['applicationReference'],
          include: [
            { model: Candidate, as: 'candidate', attributes: ['fullName'] },
            { model: Job, as: 'job', attributes: ['title', 'department'] }
          ]
        }
      ],
      order: [['hiredAt', 'DESC']],
      limit: 10
    })
  ]);

  return {
    jobsBySource: jobsBySource.map((r) => ({ sourceType: r.sourceType, count: Number(r.count) })),
    jobsByStatus: jobsByStatus.map((r) => ({ status: r.status, count: Number(r.count) })),
    funnelStages: appsByStage.map((r) => ({ stage: r.currentStage, count: Number(r.count) })),
    interviews: interviewsByRound.map((r) => ({ roundType: r.roundType, status: r.status, count: Number(r.count) })),
    offers: offersByStatus.map((r) => ({ status: r.status, count: Number(r.count) })),
    joining: joiningByStatus.map((r) => ({ status: r.status, count: Number(r.count) })),
    recentHires: toPlainList(recentHires)
  };
}

module.exports = {
  findCandidateProfilesForAuthUser,
  updateCandidateProfilesForAuthUser,
  findCandidateApplications,
  findOwnedOffer,
  getRecruitmentAnalytics
};
