const { getModels } = require('../../config/database');
const { toPlain, toPlainList } = require('../../utils/sequelizeHelpers');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function toUuid(v) {
  return typeof v === 'string' && UUID_REGEX.test(v) ? v : null;
}

async function createAuditLog(entry, transaction = null) {
  const { RecruitmentAuditLog } = getModels();
  const row = await RecruitmentAuditLog.create(
    {
      organisationId: toUuid(entry.organisationId),
      actorUserId: toUuid(entry.actorUserId),
      actorEmployeeId: toUuid(entry.actorEmployeeId),
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
