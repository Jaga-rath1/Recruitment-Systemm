'use strict';

const { Op, fn, col } = require('sequelize');
const env = require('../../config/env');
const { getSequelize, getModels, checkDatabaseHealth } = require('../../config/database');

/**
 * Platform Admin Operational Diagnostics Service
 * Surfaces safe, secret-free runtime, DB, integration, email delivery, and pending employee-sync telemetry.
 */
async function getOperationalDiagnostics() {
  const startedAt = process.hrtime.bigint();
  let dbStatus = 'disconnected';
  let dbPingMs = null;

  try {
    await checkDatabaseHealth();
    dbStatus = 'connected';
    dbPingMs = Number((process.hrtime.bigint() - startedAt) / 1000000n);
  } catch (_err) {
    dbStatus = 'disconnected';
  }

  const sequelize = getSequelize();
  const pool = sequelize?.connectionManager?.pool || null;
  const dbPool = pool
    ? {
        size: typeof pool.size === 'number' ? pool.size : null,
        available: typeof pool.available === 'number' ? pool.available : null,
        using: typeof pool.using === 'number' ? pool.using : null,
        waiting: typeof pool.waiting === 'number' ? pool.waiting : null,
        max: env.pgPoolMax
      }
    : { max: env.pgPoolMax };

  const {
    JoiningRecord,
    RecruitmentAuditLog,
    RecruitmentNotificationHistory,
    Subscription,
    Job
  } = getModels();

  let pendingEmployeeSyncCount = 0;
  let emailDeliverySummary = {};
  let platformCounts = {
    totalSubscriptions: 0,
    activeSubscriptions: 0,
    cancelledSubscriptions: 0,
    publishedJobs: 0,
    discardedJobs: 0
  };

  if (dbStatus === 'connected') {
    const [joinedRecords, notifCounts, totalSubs, activeSubs, cancelledSubs, publishedJobs, discardedJobs] =
      await Promise.all([
        JoiningRecord.findAll({
          where: { status: 'JOINED' },
          attributes: ['id'],
          raw: true
        }),
        RecruitmentNotificationHistory.findAll({
          attributes: ['deliveryStatus', [fn('COUNT', col('id')), 'count']],
          group: ['deliveryStatus'],
          raw: true
        }),
        Subscription.count(),
        Subscription.count({ where: { status: { [Op.in]: ['ACTIVE', 'TRIAL'] } } }),
        Subscription.count({ where: { status: 'CANCELLED' } }),
        Job.count({ where: { status: 'PUBLISHED', isDiscarded: false } }),
        Job.count({ where: { isDiscarded: true } })
      ]);

    platformCounts = {
      totalSubscriptions: totalSubs,
      activeSubscriptions: activeSubs,
      cancelledSubscriptions: cancelledSubs,
      publishedJobs,
      discardedJobs
    };

    for (const row of notifCounts) {
      emailDeliverySummary[row.deliveryStatus || 'UNKNOWN'] = Number(row.count) || 0;
    }

    if (joinedRecords.length > 0) {
      const joinedIds = joinedRecords.map((r) => r.id);
      const syncAuditRows = await RecruitmentAuditLog.findAll({
        where: {
          entityId: { [Op.in]: joinedIds },
          action: {
            [Op.in]: [
              'EMPLOYEE_PROVISIONING_PENDING_SYNC',
              'EMPLOYEE_PROVISIONING_RETRY_FAILED',
              'EMPLOYEE_PROVISIONING_RETRY_SUCCESS',
              'EMPLOYEE_PROVISIONING_ALREADY_SYNCED',
              'EMPLOYEE_PROVISIONED_FROM_JOINING'
            ]
          }
        },
        attributes: ['entityId', 'action', 'createdAt'],
        order: [['createdAt', 'ASC']],
        raw: true
      });

      const latestActionByJoining = new Map();
      for (const row of syncAuditRows) {
        latestActionByJoining.set(row.entityId, row.action);
      }

      for (const action of latestActionByJoining.values()) {
        if (action === 'EMPLOYEE_PROVISIONING_PENDING_SYNC' || action === 'EMPLOYEE_PROVISIONING_RETRY_FAILED') {
          pendingEmployeeSyncCount += 1;
        }
      }
    }
  }

  const mem = process.memoryUsage();
  const activeEmailCfg = typeof env.buildEmailConfig === 'function' ? env.buildEmailConfig(process.env) : env.email;

  return {
    service: env.serviceName,
    nodeEnv: env.nodeEnv,
    nodeVersion: process.version,
    uptimeSeconds: Math.round(process.uptime()),
    integrationMode: env.integrationMode,
    database: {
      status: dbStatus,
      pingMs: dbPingMs,
      pool: dbPool
    },
    memoryMb: {
      rss: Math.round((mem.rss / (1024 * 1024)) * 100) / 100,
      heapUsed: Math.round((mem.heapUsed / (1024 * 1024)) * 100) / 100,
      heapTotal: Math.round((mem.heapTotal / (1024 * 1024)) * 100) / 100
    },
    subsystems: {
      emailProvider: activeEmailCfg?.provider || 'DISABLED',
      storageDriver: env.storage?.driver || 'LOCAL_SECURE',
      malwareScannerMode: env.storage?.malwareScannerMode || 'DISABLED',
      hrmsConfigured: Boolean(env.services?.hrmsUrl)
    },
    employeeProvisioning: {
      pendingSyncCount: pendingEmployeeSyncCount
    },
    emailDeliverySummary,
    platformCounts,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  getOperationalDiagnostics
};
