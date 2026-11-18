'use strict';

const ticketTemplates = require('../modules/templates/ticket.templates');

/**
 * Standalone template adapter for ticket assignment notification.
 * @param {Object} params - Dynamic ticket assignment details
 * @returns {{ subject: string, html: string, text: string, inAppTitle: string, inAppMessage: string }}
 */
function renderTicketAssigned(params = {}) {
  return ticketTemplates.ticket_assigned(params);
}

module.exports = {
  renderTicketAssigned,
  render: renderTicketAssigned,
};
