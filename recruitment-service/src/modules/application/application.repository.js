const { Op } = require('sequelize');
const { getModels } = require('../../config/database');
const { toPlain, toPlainList } = require('../../utils/sequelizeHelpers');

async function findPublishedJobForApply(jobId) {
  const { Job, JobPublication } = getModels();
  const row = await Job.findOne({
    where: { id: jobId, status: 'PUBLISHED' },
    include: [
      {
        model: JobPublication,
        as: 'publication',
        where: { isPublic: true },
        required: true
      }
    ]
  });
  return toPlain(row);
}

async function findDuplicateApplication(jobId, candidateId, transaction = null) {
  const { Application } = getModels();
  const row = await Application.findOne({
    where: { jobId, candidateId },
    transaction
  });
  return toPlain(row);
}

async function createApplication(data, transaction = null) {
  const { Application, Job, Candidate, ApplicationDocument } = getModels();
  const created = await Application.create(data, { transaction });
  const reloaded = await Application.findByPk(created.id, {
    include: [
      { model: Job, as: 'job' },
      { model: Candidate, as: 'candidate' },
      { model: ApplicationDocument, as: 'documents' }
    ],
    transaction
  });
  return toPlain(reloaded);
}

async function createApplicationDocument(data, transaction = null) {
  const { ApplicationDocument } = getModels();
  const row = await ApplicationDocument.create(data, { transaction });
  return toPlain(row);
}

async function addStageHistory(data, transaction = null) {
  const { ApplicationStageHistory } = getModels();
  const row = await ApplicationStageHistory.create(data, { transaction });
  return toPlain(row);
}

async function findApplicationById(organisationId, applicationId, transaction = null) {
  const {
    Application,
    Job,
    Candidate,
    ApplicationDocument,
    ApplicationStageHistory,
    Interview,
    InterviewAssignment,
    InterviewFeedback,
    Offer,
    OfferDocument,
    JoiningRecord
  } = getModels();

  const row = await Application.findOne({
    where: { id: applicationId, organisationId },
    include: [
      { model: Job, as: 'job' },
      { model: Candidate, as: 'candidate' },
      { model: ApplicationDocument, as: 'documents' },
      { model: ApplicationStageHistory, as: 'stageHistory' },
      {
        model: Interview,
        as: 'interviews',
        include: [
          { model: InterviewAssignment, as: 'assignments' },
          { model: InterviewFeedback, as: 'feedbacks' }
        ]
      },
      { model: InterviewFeedback, as: 'feedbacks' },
      { model: Offer, as: 'offer', include: [{ model: OfferDocument, as: 'documents' }] },
      { model: JoiningRecord, as: 'joiningRecord' }
    ],
    order: [
      [{ model: ApplicationStageHistory, as: 'stageHistory' }, 'createdAt', 'ASC'],
      [{ model: Interview, as: 'interviews' }, 'roundType', 'ASC'],
      [{ model: Interview, as: 'interviews' }, 'roundNumber', 'ASC']
    ],
    transaction
  });

  return toPlain(row);
}

async function updateApplication(organisationId, applicationId, data, transaction = null) {
  const { Application } = getModels();
  const existing = await Application.findOne({ where: { id: applicationId, organisationId }, transaction });
  if (!existing) return null;
  await existing.update(data, { transaction });
  return toPlain(existing);
}

async function listApplications(organisationId, { jobId, currentStage, screeningStatus, search, skip = 0, take = 21 } = {}) {
  const {
    Application,
    Job,
    Candidate,
    ApplicationDocument,
    Interview,
    InterviewAssignment,
    InterviewFeedback,
    Offer,
    JoiningRecord
  } = getModels();

  const where = {
    organisationId,
    ...(jobId ? { jobId } : {}),
    ...(currentStage ? { currentStage } : {}),
    ...(screeningStatus ? { screeningStatus } : {}),
    ...(search
      ? {
          [Op.or]: [
            { applicationReference: { [Op.iLike]: `%${search}%` } },
            { '$candidate.full_name$': { [Op.iLike]: `%${search}%` } },
            { '$candidate.email$': { [Op.iLike]: `%${search}%` } },
            { '$job.title$': { [Op.iLike]: `%${search}%` } }
          ]
        }
      : {})
  };

  const [rows, total] = await Promise.all([
    Application.findAll({
      where,
      include: [
        { model: Job, as: 'job', attributes: ['id', 'title', 'department', 'location'] },
        {
          model: Candidate,
          as: 'candidate',
          attributes: ['id', 'fullName', 'email', 'mobileNumber', 'location', 'totalExperienceYears', 'skills', 'currentCompany']
        },
        { model: ApplicationDocument, as: 'documents' },
        {
          model: Interview,
          as: 'interviews',
          include: [
            { model: InterviewAssignment, as: 'assignments' },
            { model: InterviewFeedback, as: 'feedbacks' }
          ]
        },
        { model: Offer, as: 'offer', attributes: ['id', 'status', 'offeredSalary', 'designation'] },
        { model: JoiningRecord, as: 'joiningRecord', attributes: ['id', 'status', 'expectedJoiningDate'] }
      ],
      order: [['createdAt', 'DESC']],
      offset: skip,
      limit: take,
      subQuery: false
    }),
    Application.count({
      where,
      include: search
        ? [
            { model: Job, as: 'job', attributes: [] },
            { model: Candidate, as: 'candidate', attributes: [] }
          ]
        : undefined
    })
  ]);

  return { items: toPlainList(rows), total };
}

module.exports = {
  findPublishedJobForApply,
  findDuplicateApplication,
  createApplication,
  createApplicationDocument,
  addStageHistory,
  findApplicationById,
  updateApplication,
  listApplications
};
