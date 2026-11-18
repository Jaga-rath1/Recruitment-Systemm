'use strict';
const { serviceRequest, serviceIdentity } = require('./serviceRequest');

const { NOTIFICATION_SERVICE_URL } = require('../config/env');

/**
 * Best-effort notification create. Never throws/rejects — a notification
 * failure must not break employee operations. No secrets logged.
 */
async function createNotification(organizationId, { userId, type, title, message, data }) {
  if (!organizationId || !userId || !title || !message) return { ok: false, skipped: true };
  const res = await serviceRequest(NOTIFICATION_SERVICE_URL, {
    method: 'POST',
    path: '/api/v1/notifications',
    headers: serviceIdentity(organizationId),
    body: { userId, type: type || null, title, message, data: data || null },
    timeoutMs: 3000,
  });
  if (res.status === 201) return { ok: true };
  console.warn(`[employee-service] notification create failed: ${res.status === 0 ? 'service unreachable' : `HTTP ${res.status}`}`);
  return { ok: false };
}

module.exports = { createNotification };
