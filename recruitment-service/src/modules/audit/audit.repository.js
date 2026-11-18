const { getModels } = require('../../config/database');
const { toPlain, toPlainList } = require('../../utils/sequelizeHelpers');

async function createAuditLog(entry, transaction = null) {
  const { RecruitmentAuditLog } = getModels();
  const row = await RecruitmentAuditLog.create(
    {
      organisationId: entry.organisationId || null,
      actorUserId: entry.actorUserId || null,
      actorEmployeeId: entry.actorEmployeeId || null,
      actorRole: entry.actorRole || null,
      entityType: entry.entityType,
      entityId: entry.entityId ? String(entry.entityId) : null,
      action: entry.action,
      requestId: entry.requestId || null,
      ipAddress: entry.ipAddress || null,
      userAgent: entry.userAgent || null,
      beforeState: entry.beforeState || null,
      afterState: entry.afterState || null
    },
    { transaction }
  );
  return toPlain(row);
}

async function listAuditLogs(organisationId, { entityType, action, skip = 0, take = 21 } = {}) {
  const { RecruitmentAuditLog } = getModels();
  const where = {
    organisationId,
    ...(entityType ? { entityType } : {}),
    ...(action ? { action } : {})
  };
  const { rows, count } = await RecruitmentAuditLog.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    offset: skip,
    limit: take
  });
  return { items: toPlainList(rows), total: count };
}

module.exports = {
  createAuditLog,
  listAuditLogs
};
