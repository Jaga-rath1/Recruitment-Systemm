const { getModels } = require('../../config/database');
const { toPlain, toPlainList } = require('../../utils/sequelizeHelpers');

async function findJoiningById(organisationId, joiningId, transaction = null) {
  const { JoiningRecord, Application, Candidate, Job, Offer } = getModels();
  const row = await JoiningRecord.findOne({
    where: { id: joiningId, organisationId },
    include: [
      {
        model: Application,
        as: 'application',
        include: [
          { model: Candidate, as: 'candidate' },
          { model: Job, as: 'job' }
        ]
      },
      { model: Offer, as: 'offer' }
    ],
    transaction
  });
  return toPlain(row);
}

async function findJoiningByIdempotencyKey(idempotencyKey, transaction = null) {
  if (!idempotencyKey) return null;
  const { JoiningRecord } = getModels();
  const row = await JoiningRecord.findOne({
    where: { idempotencyKey },
    transaction
  });
  return toPlain(row);
}

async function findJoiningByApplicationId(applicationId, transaction = null) {
  const { JoiningRecord } = getModels();
  const row = await JoiningRecord.findOne({
    where: { applicationId },
    transaction
  });
  return toPlain(row);
}

async function createJoiningRecord(data, transaction = null) {
  const { JoiningRecord, Application, Candidate, Job, Offer } = getModels();
  const created = await JoiningRecord.create(data, { transaction });
  const reloaded = await JoiningRecord.findByPk(created.id, {
    include: [
      {
        model: Application,
        as: 'application',
        include: [
          { model: Candidate, as: 'candidate' },
          { model: Job, as: 'job' }
        ]
      },
      { model: Offer, as: 'offer' }
    ],
    transaction
  });
  return toPlain(reloaded);
}

async function updateJoiningRecord(organisationId, joiningId, data, transaction = null) {
  const { JoiningRecord, Application, Candidate, Job, Offer } = getModels();
  const existing = await JoiningRecord.findOne({ where: { id: joiningId, organisationId }, transaction });
  if (!existing) return null;
  await existing.update(data, { transaction });
  const reloaded = await JoiningRecord.findByPk(joiningId, {
    include: [
      {
        model: Application,
        as: 'application',
        include: [
          { model: Candidate, as: 'candidate' },
          { model: Job, as: 'job' }
        ]
      },
      { model: Offer, as: 'offer' }
    ],
    transaction
  });
  return toPlain(reloaded);
}

async function listJoiningRecords(organisationId, { status, skip = 0, take = 21 } = {}) {
  const { JoiningRecord, Application, Candidate, Job, Offer } = getModels();
  const where = {
    organisationId,
    ...(status ? { status } : {})
  };
  const [rows, total] = await Promise.all([
    JoiningRecord.findAll({
      where,
      include: [
        {
          model: Application,
          as: 'application',
          attributes: ['id', 'applicationReference', 'currentStage'],
          include: [
            { model: Candidate, as: 'candidate', attributes: ['id', 'fullName', 'email'] },
            { model: Job, as: 'job', attributes: ['id', 'title', 'department'] }
          ]
        },
        { model: Offer, as: 'offer', attributes: ['id', 'designation', 'offeredSalary', 'salaryCurrency'] }
      ],
      order: [['createdAt', 'DESC']],
      offset: skip,
      limit: take
    }),
    JoiningRecord.count({ where })
  ]);

  return { items: toPlainList(rows), total };
}

module.exports = {
  findJoiningById,
  findJoiningByIdempotencyKey,
  findJoiningByApplicationId,
  createJoiningRecord,
  updateJoiningRecord,
  listJoiningRecords
};
