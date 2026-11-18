'use strict';

const ticketTemplates = require('./ticket.templates');

const TEMPLATE_REGISTRY = {
  ticket_created: {
    name: 'ticket_created',
    category: 'ticket',
    description: 'Notification sent to customer upon ticket creation',
    requiredParams: ['ticketNumber', 'title'],
    render: ticketTemplates.ticket_created,
  },
  ticket_assigned: {
    name: 'ticket_assigned',
    category: 'ticket',
    description: 'Notification sent to agent upon ticket assignment',
    requiredParams: ['ticketNumber', 'title', 'priority'],
    render: ticketTemplates.ticket_assigned,
  },
  comment_added: {
    name: 'comment_added',
    category: 'ticket',
    description: 'Notification sent when a comment is added to a ticket',
    requiredParams: ['ticketNumber', 'title', 'commentMessage'],
    render: ticketTemplates.comment_added,
  },
  ticket_status_changed: {
    name: 'ticket_status_changed',
    category: 'ticket',
    description: 'Notification sent when ticket status changes (e.g. resolved)',
    requiredParams: ['ticketNumber', 'title', 'newStatus'],
    render: ticketTemplates.ticket_status_changed,
  },
  sla_breached: {
    name: 'sla_breached',
    category: 'sla',
    description: 'Notification sent when SLA threshold is breached',
    requiredParams: ['ticketNumber', 'title', 'priority'],
    render: ticketTemplates.sla_breached,
  },
  agent_onboarding: {
    name: 'agent_onboarding',
    category: 'agent',
    description: 'Notification sent to newly created agent with first-time login credentials',
    requiredParams: ['agentName', 'email', 'tempPassword'],
    render: ticketTemplates.agent_onboarding,
  },
};

function hasTemplate(type) {
  const key = String(type || '').toLowerCase();
  return Boolean(key && TEMPLATE_REGISTRY[key]);
}

function renderTemplate(type, params = {}) {
  const key = String(type || '').toLowerCase();
  const entry = TEMPLATE_REGISTRY[key];
  if (!entry) {
    throw new Error(`Template "${type}" is not registered`);
  }
  return entry.render(params);
}

function listTemplates() {
  return Object.values(TEMPLATE_REGISTRY).map((t) => ({
    name: t.name,
    category: t.category,
    description: t.description,
    requiredParams: t.requiredParams,
  }));
}

module.exports = {
  hasTemplate,
  renderTemplate,
  listTemplates,
  ticketTemplates,
};
