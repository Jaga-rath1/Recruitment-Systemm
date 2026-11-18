const { Op, fn, col } = require('sequelize');
const { getModels } = require('../../config/database');
const { toPlain, toPlainList } = require('../../utils/sequelizeHelpers');

async function upsertJobSource(organisationId, data, transaction = null) {
  const { JobSource } = getModels();
  if (data.sourceType === 'HRMS' && data.externalHrmsJobId) {
    const existing = await JobSource.findOne({
      where: {
        organisationId,
        sourceType: 'HRMS',
        externalHrmsJobId: data.externalHrmsJobId
      },
      transaction
    });
    if (existing) {
      await existing.update(
        {
          rawPayload: data.rawPayload,
          lastSyncedAt: new Date(),
          syncStatus: 'SYNCED'
        },
        { transaction }
      );
      return toPlain(existing);
    }

    const created = await JobSource.create(
      {
        organisationId,
        sourceType: 'HRMS',
        externalHrmsJobId: data.externalHrmsJobId,
        rawPayload: data.rawPayload,
        lastSyncedAt: new Date(),
        syncStatus: 'SYNCED'
      },
      { transaction }
    );
    return toPlain(created);
  }

  const created = await JobSource.create(
    {
      organisationId,
      sourceType: 'MANUAL',
      externalHrmsJobId: null,
      rawPayload: data.rawPayload || null,
      syncStatus: 'MANUAL'
    },
    { transaction }
  );
  return toPlain(created);
}

async function findJobByHrmsId(organisationId, hrmsJobId, transaction = null) {
  const { Job, JobSource, JobPublication } = getModels();
  const row = await Job.findOne({
    where: { organisationId, sourceType: 'HRMS', hrmsJobId },
    include: [
      { model: JobSource, as: 'jobSource' },
      { model: JobPublication, as: 'publication' }
    ],
    transaction
  });
  return toPlain(row);
}

async function createJob(data, transaction = null) {
  const { Job, JobSource, JobPublication } = getModels();
  const created = await Job.create(data, { transaction });
  const reloaded = await Job.findByPk(created.id, {
    include: [
      { model: JobSource, as: 'jobSource' },
      { model: JobPublication, as: 'publication' }
    ],
    transaction
  });
  return toPlain(reloaded);
}

async function updateJob(organisationId, jobId, data, transaction = null) {
  const { Job, JobSource, JobPublication } = getModels();
  const existing = await Job.findOne({ where: { id: jobId, organisationId }, transaction });
  if (!existing) return null;
  await existing.update(data, { transaction });
  const reloaded = await Job.findByPk(jobId, {
    include: [
      { model: JobSource, as: 'jobSource' },
      { model: JobPublication, as: 'publication' }
    ],
    transaction
  });
  return toPlain(reloaded);
}

async function findJobById(organisationId, jobId, transaction = null) {
  const { Job, JobSource, JobPublication, Application } = getModels();
  const row = await Job.findOne({
    where: { id: jobId, organisationId },
    include: [
      { model: JobSource, as: 'jobSource' },
      { model: JobPublication, as: 'publication' }
    ],
    transaction
  });
  if (!row) return null;
  const appCount = await Application.count({ where: { jobId }, transaction });
  return { ...toPlain(row), _count: { applications: appCount } };
}

async function listJobs(organisationId, { status, sourceType, department, search, skip = 0, take = 21 } = {}) {
  const { Job, JobSource, JobPublication, Application } = getModels();
  const where = {
    organisationId,
    ...(status ? { status } : {}),
    ...(sourceType ? { sourceType } : {}),
    ...(department ? { department: { [Op.iLike]: `%${department}%` } } : {}),
    ...(search
      ? {
          [Op.or]: [
            { title: { [Op.iLike]: `%${search}%` } },
            { department: { [Op.iLike]: `%${search}%` } },
            { location: { [Op.iLike]: `%${search}%` } }
          ]
        }
      : {})
  };

  const [rows, total] = await Promise.all([
    Job.findAll({
      where,
      include: [
        {
          model: JobSource,
          as: 'jobSource',
          attributes: ['id', 'sourceType', 'externalHrmsJobId', 'lastSyncedAt', 'syncStatus', 'rawPayload']
        },
        { model: JobPublication, as: 'publication' }
      ],
      order: [['createdAt', 'DESC']],
      offset: skip,
      limit: take
    }),
    Job.count({ where })
  ]);

  const plainRows = toPlainList(rows);
  if (plainRows.length > 0) {
    const jobIds = plainRows.map((j) => j.id);
    const counts = await Application.findAll({
      where: { jobId: { [Op.in]: jobIds } },
      attributes: ['jobId', [fn('COUNT', col('id')), 'count']],
      group: ['jobId'],
      raw: true
    });
    const countMap = new Map(counts.map((c) => [c.jobId, Number(c.count) || 0]));
    for (const j of plainRows) j._count = { applications: countMap.get(j.id) || 0 };
  }

  return { items: plainRows, total };
}

async function upsertPublication(organisationId, jobId, data, transaction = null) {
  const { JobPublication } = getModels();
  const existing = await JobPublication.findOne({ where: { jobId }, transaction });
  if (existing) {
    await existing.update(data.update, { transaction });
    return toPlain(existing);
  }
  const created = await JobPublication.create(
    {
      organisationId,
      jobId,
      ...data.create
    },
    { transaction }
  );
  return toPlain(created);
}

async function listPublicPublishedJobs({ organisationId, department, location, employmentType, search, skip = 0, take = 21 } = {}) {
  const { Job, JobPublication } = getModels();
  const where = {
    status: 'PUBLISHED',
    isDiscarded: false,
    ...(organisationId ? { organisationId } : {}),
    ...(department ? { department: { [Op.iLike]: `%${department}%` } } : {}),
    ...(location ? { location: { [Op.iLike]: `%${location}%` } } : {}),
    ...(employmentType ? { employmentType: { [Op.iLike]: employmentType } } : {}),
    ...(search
      ? {
          [Op.or]: [
            { title: { [Op.iLike]: `%${search}%` } },
            { description: { [Op.iLike]: `%${search}%` } },
            { department: { [Op.iLike]: `%${search}%` } }
          ]
        }
      : {})
  };

  const { rows, count } = await Job.findAndCountAll({
    where,
    include: [
      {
        model: JobPublication,
        as: 'publication',
        where: { isPublic: true },
        required: true
      }
    ],
    order: [['createdAt', 'DESC']],
    offset: skip,
    limit: take
  });

  return { items: toPlainList(rows), total: count };
}

async function findPublicJobByIdentifier(identifier) {
  const { Job, JobPublication } = getModels();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identifier);
  const row = await Job.findOne({
    where: {
      status: 'PUBLISHED',
      isDiscarded: false,
      ...(isUuid ? { id: identifier } : {})
    },
    include: [
      {
        model: JobPublication,
        as: 'publication',
        where: {
          isPublic: true,
          ...(isUuid ? {} : { slug: identifier })
        },
        required: true
      }
    ]
  });
  return toPlain(row);
}

async function incrementPublicationViews(publicationId) {
  const { JobPublication } = getModels();
  return JobPublication.increment('viewsCount', { by: 1, where: { id: publicationId } });
}

module.exports = {
  upsertJobSource,
  findJobByHrmsId,
  createJob,
  updateJob,
  findJobById,
  listJobs,
  upsertPublication,
  listPublicPublishedJobs,
  findPublicJobByIdentifier,
  incrementPublicationViews
};
