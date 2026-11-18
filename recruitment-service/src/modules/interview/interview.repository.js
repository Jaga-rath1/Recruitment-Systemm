const { getModels } = require('../../config/database');
const { toPlain, toPlainList } = require('../../utils/sequelizeHelpers');

async function createInterviewWithAssignment(data, assignmentData, transaction = null) {
  const { Interview, InterviewAssignment } = getModels();
  const interview = await Interview.create(data, { transaction });
  const assignment = await InterviewAssignment.create(
    {
      ...assignmentData,
      interviewId: interview.id
    },
    { transaction }
  );
  return { interview: toPlain(interview), assignment: toPlain(assignment) };
}

async function findInterviewById(organisationId, interviewId, transaction = null) {
  const { Interview, Application, Candidate, Job, InterviewAssignment, InterviewFeedback } = getModels();
  const row = await Interview.findOne({
    where: { id: interviewId, organisationId },
    include: [
      {
        model: Application,
        as: 'application',
        include: [
          { model: Candidate, as: 'candidate' },
          { model: Job, as: 'job' }
        ]
      },
      { model: InterviewAssignment, as: 'assignments' },
      { model: InterviewFeedback, as: 'feedbacks' }
    ],
    transaction
  });
  return toPlain(row);
}

async function listInterviews(organisationId, { roundType, status, applicationId, interviewerEmployeeId, skip = 0, take = 21 } = {}) {
  const {
    Interview,
    Application,
    Job,
    Candidate,
    ApplicationDocument,
    InterviewAssignment,
    InterviewFeedback
  } = getModels();

  const where = {
    organisationId,
    ...(roundType ? { roundType } : {}),
    ...(status ? { status } : {}),
    ...(applicationId ? { applicationId } : {})
  };

  const assignmentInclude = {
    model: InterviewAssignment,
    as: 'assignments',
    ...(interviewerEmployeeId
      ? {
          where: { interviewerEmployeeId },
          required: true
        }
      : {})
  };

  const [rows, total] = await Promise.all([
    Interview.findAll({
      where,
      include: [
        {
          model: Application,
          as: 'application',
          attributes: ['id', 'applicationReference', 'currentStage'],
          include: [
            { model: Job, as: 'job', attributes: ['id', 'title', 'department'] },
            {
              model: Candidate,
              as: 'candidate',
              attributes: ['id', 'fullName', 'email', 'totalExperienceYears', 'skills']
            },
            { model: ApplicationDocument, as: 'documents' }
          ]
        },
        assignmentInclude,
        { model: InterviewFeedback, as: 'feedbacks' }
      ],
      order: [['scheduledAt', 'ASC']],
      offset: skip,
      limit: take
    }),
    Interview.count({
      where,
      include: interviewerEmployeeId ? [assignmentInclude] : undefined,
      distinct: true
    })
  ]);

  return { items: toPlainList(rows), total };
}

async function updateInterview(organisationId, interviewId, data, transaction = null) {
  const { Interview, InterviewAssignment, InterviewFeedback } = getModels();
  const existing = await Interview.findOne({ where: { id: interviewId, organisationId }, transaction });
  if (!existing) return null;
  await existing.update(data, { transaction });
  const reloaded = await Interview.findByPk(interviewId, {
    include: [
      { model: InterviewAssignment, as: 'assignments' },
      { model: InterviewFeedback, as: 'feedbacks' }
    ],
    transaction
  });
  return toPlain(reloaded);
}

async function createFeedback(data, transaction = null) {
  const { InterviewFeedback } = getModels();
  const row = await InterviewFeedback.create(data, { transaction });
  return toPlain(row);
}

async function updateAssignmentStatus(interviewId, interviewerEmployeeId, status, transaction = null) {
  const { InterviewAssignment } = getModels();
  await InterviewAssignment.update(
    { status },
    {
      where: { interviewId, interviewerEmployeeId },
      transaction
    }
  );
  const row = await InterviewAssignment.findOne({
    where: { interviewId, interviewerEmployeeId },
    transaction
  });
  return toPlain(row);
}

module.exports = {
  createInterviewWithAssignment,
  findInterviewById,
  listInterviews,
  updateInterview,
  createFeedback,
  updateAssignmentStatus
};
