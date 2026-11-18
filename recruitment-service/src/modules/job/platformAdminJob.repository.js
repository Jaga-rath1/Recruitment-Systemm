'use strict';

const { Op, fn, col } = require('sequelize');
const { getModels } = require('../../config/database');
const { toPlain, toPlainList } = require('../../utils/sequelizeHelpers');

/**
 * Platform Admin Job Repository
 * Provides cross-organisation queries, subscription joins, and application aggregations.
 */

async function listPlatformAdminJobs({
  organisationId,
  status,
  subscriptionStatus,
  discardFilter = 'ACTIVE_ONLY',
  search,
  skip = 0,
  take = 20
} = {}) {
  const { Job, JobPublication, JobSource, Application, Subscription } = getModels();

  const where = {};

  // Discard filter: ACTIVE_ONLY (default), DISCARDED_ONLY, ALL
  if (discardFilter === 'DISCARDED_ONLY') {
    where.isDiscarded = true;
  } else if (discardFilter === 'ACTIVE_ONLY') {
    where.isDiscarded = false;
  }

  // Publication / Job Status
  if (status && status !== 'ALL') {
    where.status = status;
  }

  // Organisation filter
  if (organisationId && organisationId !== 'ALL') {
    where.organisationId = organisationId;
  }

  // Handle subscription status filter (based on latest subscription per organisation)
  if (subscriptionStatus && subscriptionStatus !== 'ALL') {
    const allSubs = await Subscription.findAll({
      attributes: ['organisationId', 'status', 'createdAt'],
      order: [['createdAt', 'ASC']],
      raw: true
    });
    const latestStatusByOrg = new Map();
    for (const s of allSubs) {
      if (s.organisationId) {
        latestStatusByOrg.set(s.organisationId, s.status);
      }
    }
    const matchingOrgIds = [];
    for (const [orgId, latestStatus] of latestStatusByOrg.entries()) {
      if (latestStatus === subscriptionStatus) {
        matchingOrgIds.push(orgId);
      }
    }

    if (where.organisationId) {
      where.organisationId = matchingOrgIds.includes(where.organisationId)
        ? where.organisationId
        : '00000000-0000-0000-0000-000000000000';
    } else {
      where.organisationId =
        matchingOrgIds.length > 0 ? { [Op.in]: matchingOrgIds } : '00000000-0000-0000-0000-000000000000';
    }
  }

  if (search && search.trim()) {
    const term = search.trim();
    // Also search organisations by name
    const orgMatches = await Subscription.findAll({
      where: { organisationName: { [Op.iLike]: `%${term}%` } },
      attributes: ['organisationId'],
      raw: true
    });
    const orgMatchIds = orgMatches.map((s) => s.organisationId).filter(Boolean);

    const searchConditions = [
      { title: { [Op.iLike]: `%${term}%` } },
      { department: { [Op.iLike]: `%${term}%` } },
      { location: { [Op.iLike]: `%${term}%` } }
    ];

    if (orgMatchIds.length > 0) {
      searchConditions.push({ organisationId: { [Op.in]: orgMatchIds } });
    }

    where[Op.and] = where[Op.and] || [];
    where[Op.and].push({ [Op.or]: searchConditions });
  }

  const [rows, total] = await Promise.all([
    Job.findAll({
      where,
      include: [
        { model: JobSource, as: 'jobSource', attributes: ['sourceType', 'syncStatus'] },
        { model: JobPublication, as: 'publication' }
      ],
      order: [['createdAt', 'DESC']],
      offset: skip,
      limit: take
    }),
    Job.count({ where })
  ]);

  const plainJobs = toPlainList(rows);
  if (plainJobs.length === 0) {
    return { items: [], total: 0 };
  }

  // Enrich with application counts & organisation subscription data
  const jobIds = plainJobs.map((j) => j.id);
  const orgIds = Array.from(new Set(plainJobs.map((j) => j.organisationId).filter(Boolean)));

  const [counts, subs] = await Promise.all([
    Application.findAll({
      where: { jobId: { [Op.in]: jobIds } },
      attributes: ['jobId', [fn('COUNT', col('id')), 'count']],
      group: ['jobId'],
      raw: true
    }),
    Subscription.findAll({
      where: { organisationId: { [Op.in]: orgIds } },
      attributes: ['organisationId', 'organisationName', 'status', 'planCode', 'startsAt', 'expiresAt', 'createdAt'],
      order: [['createdAt', 'ASC']],
      raw: true
    })
  ]);

  const countMap = new Map(counts.map((c) => [c.jobId, Number(c.count) || 0]));
  const subMap = new Map(subs.map((s) => [s.organisationId, s]));

  const enrichedItems = plainJobs.map((job) => {
    const sub = subMap.get(job.organisationId);
    return {
      ...job,
      organisationName: sub?.organisationName || 'Unknown Organisation',
      subscriptionStatus: sub?.status || 'UNKNOWN',
      planCode: sub?.planCode || null,
      publishedAt: job.publication?.publishedAt || null,
      isPublic: Boolean(job.publication?.isPublic),
      applicationCount: countMap.get(job.id) || 0
    };
  });

  return { items: enrichedItems, total };
}

async function findPlatformAdminJobById(jobId) {
  const { Job, JobSource, JobPublication, Application, Subscription } = getModels();

  const job = await Job.findByPk(jobId, {
    include: [
      { model: JobSource, as: 'jobSource' },
      { model: JobPublication, as: 'publication' }
    ]
  });

  if (!job) return null;

  const plainJob = toPlain(job);

  const [appCount, sub] = await Promise.all([
    Application.count({ where: { jobId } }),
    Subscription.findOne({
      where: { organisationId: plainJob.organisationId },
      order: [['createdAt', 'DESC']],
      raw: true
    })
  ]);

  return {
    ...plainJob,
    organisationName: sub?.organisationName || 'Unknown Organisation',
    subscriptionStatus: sub?.status || 'UNKNOWN',
    planCode: sub?.planCode || null,
    subscriptionStartsAt: sub?.startsAt || null,
    subscriptionExpiresAt: sub?.expiresAt || null,
    publishedAt: plainJob.publication?.publishedAt || null,
    isPublic: Boolean(plainJob.publication?.isPublic),
    applicationCount: appCount
  };
}

module.exports = {
  listPlatformAdminJobs,
  findPlatformAdminJobById
};
