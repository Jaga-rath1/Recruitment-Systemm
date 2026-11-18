'use strict';
const { Op } = require('sequelize');
const Notification = require('./notifications.model');
const emailProvider = require('../../providers/email.provider');
const templatesService = require('../templates/templates.service');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function makeError(message, status) {
  return Object.assign(new Error(message), { status });
}

async function list(organizationId, userId, query) {
  const where = { organizationId, userId };

  if (query.is_read === 'true')  where.isRead = true;
  if (query.is_read === 'false') where.isRead = false;

  const page  = Math.max(1, parseInt(query.page, 10)  || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const { count, rows } = await Notification.findAndCountAll({
    where, limit, offset, order: [['created_at', 'DESC']],
  });

  return {
    items: rows,
    pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
  };
}

async function getById(organizationId, userId, id) {
  const n = await Notification.findOne({ where: { id, organizationId, userId } });
  if (!n) throw makeError('Notification not found', 404);
  return n;
}

async function create(organizationId, body) {
  let {
    userId,
    type,
    title,
    message,
    data,
    recipientEmail,
    recipientName,
    cc,
    sendEmail = true,
    templateParams = null,
  } = body;

  let emailSubject = body.subject || null;
  let emailHtml = body.html || null;
  let emailText = body.text || null;

  // Idempotency: Prevent duplicate notifications when events are processed repeatedly
  const ticketId = data?.ticketId || templateParams?.ticketId || null;
  const idempotencyKey = body.idempotencyKey || (
    type && String(type).toLowerCase() === 'ticket_assigned' && ticketId
      ? `assigned-${ticketId}-${userId}`
      : null
  );

  if (idempotencyKey) {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const existing = await Notification.findOne({
      where: {
        organizationId,
        userId,
        createdAt: { [Op.gte]: fiveMinutesAgo },
      },
      order: [['createdAt', 'DESC']],
    });

    if (
      existing &&
      existing.data &&
      (existing.data.idempotencyKey === idempotencyKey ||
        (existing.type === type && existing.data.ticketId === ticketId))
    ) {
      console.log(`[notification-service] Duplicate notification suppressed for key: ${idempotencyKey}`);
      const duplicateResult = existing.toJSON();
      duplicateResult.duplicateSuppressed = true;
      return duplicateResult;
    }

    data = Object.assign({}, data || {}, { idempotencyKey });
  }

  // 1. Template Resolution: Render ticket/SLA templates if specified
  if (type && templatesService.hasTemplate(type)) {
    const params = Object.assign(
      {},
      data || {},
      templateParams || {},
      recipientName ? { customerName: recipientName, agentName: recipientName, recipientName } : {}
    );
    try {
      const rendered = templatesService.renderTemplate(type, params);
      if (!title) title = rendered.inAppTitle;
      if (!message) message = rendered.inAppMessage;
      if (!emailSubject) emailSubject = rendered.subject;
      if (!emailHtml) emailHtml = rendered.html;
      if (!emailText) emailText = rendered.text;
    } catch (tmplErr) {
      console.warn(`[notification-service] Template render warning for "${type}":`, tmplErr.message);
    }
  }

  // Fallbacks if title or message still unset
  if (!title) title = 'Support Notification';
  if (!message) message = '';

  // 2. Persist In-App Notification in PostgreSQL
  const notification = await Notification.create({
    organizationId,
    userId,
    type: type || null,
    title,
    message,
    data: data || null,
  });

  // 3. Multi-Channel: Email Delivery
  const targetEmail = recipientEmail || data?.recipientEmail || templateParams?.recipientEmail || templateParams?.email;
  let emailDelivery = null;

  // Resolve, sanitize, and validate CC recipient
  let rawCc = cc !== undefined ? cc : (data?.cc !== undefined ? data.cc : templateParams?.cc);
  let resolvedCc = undefined;

  if (rawCc) {
    if (typeof rawCc === 'string') {
      const trimmed = rawCc.trim();
      if (EMAIL_RE.test(trimmed)) {
        const isDuplicateOfTo = Boolean(targetEmail && trimmed.toLowerCase() === String(targetEmail).trim().toLowerCase());
        if (!isDuplicateOfTo) {
          resolvedCc = trimmed;
        }
      }
    } else if (Array.isArray(rawCc)) {
      const validCcList = rawCc
        .filter((e) => typeof e === 'string' && EMAIL_RE.test(e.trim()))
        .map((e) => e.trim())
        .filter((e) => !targetEmail || e.toLowerCase() !== String(targetEmail).trim().toLowerCase());
      const uniqueCcList = Array.from(new Set(validCcList));
      if (uniqueCcList.length === 1) {
        resolvedCc = uniqueCcList[0];
      } else if (uniqueCcList.length > 1) {
        resolvedCc = uniqueCcList;
      }
    }
  }

  if (targetEmail && sendEmail !== false) {
    try {
      const subject = emailSubject || title;
      const html = emailHtml || `<p>${message}</p>`;
      const text = emailText || message;

      const emailResult = await emailProvider.sendMail({
        to: targetEmail,
        subject,
        html,
        text,
        ...(resolvedCc ? { cc: resolvedCc } : {}),
      });

      emailDelivery = {
        sent: true,
        recipient: targetEmail,
        cc: resolvedCc || null,
        messageId: emailResult.messageId,
        previewUrl: emailResult.previewUrl,
        mode: emailResult.mode,
      };
    } catch (mailErr) {
      console.error('[notification-service] Email dispatch failed:', mailErr.message);
      emailDelivery = {
        sent: false,
        recipient: targetEmail,
        cc: resolvedCc || null,
        error: mailErr.message,
      };
    }
  }

  const result = notification.toJSON();
  if (emailDelivery) {
    result.emailDelivery = emailDelivery;
  }

  return result;
}

async function markRead(organizationId, userId, id) {
  const n = await getById(organizationId, userId, id);
  if (!n.isRead) {
    await n.update({ isRead: true, readAt: new Date() });
  }
  return n.reload();
}

async function markAllRead(organizationId, userId) {
  const [updated] = await Notification.update(
    { isRead: true, readAt: new Date() },
    { where: { organizationId, userId, isRead: false } },
  );
  return { updated };
}

async function deleteById(organizationId, userId, id) {
  const n = await getById(organizationId, userId, id);
  await n.destroy();
}

async function unreadCount(organizationId, userId) {
  const count = await Notification.count({ where: { organizationId, userId, isRead: false } });
  return { count };
}

module.exports = { list, getById, create, markRead, markAllRead, deleteById, unreadCount };
