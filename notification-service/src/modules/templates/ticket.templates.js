'use strict';

const env = require('../../config/env');

const BRAND = (env.BRAND_NAME || process.env.BRAND_NAME || 'NexnuvTKT').trim();
const BRAND_SUBTITLE = 'Help Desk';
const BRAND_TAGLINE = 'Better Support, Faster Solution';
const BRAND_COLOR = '#2563eb';

/**
 * Escapes user-controlled text for safe HTML output.
 */
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Converts newline characters to <br/> tags while preserving HTML safety.
 */
function nl2br(escapedText) {
  return String(escapedText ?? '').replace(/\r\n|\n|\r/g, '<br/>');
}

/**
 * Formats a Date object or timestamp string into the exact screenshot specification:
 * e.g. "Oct 23, 2025 • 04:48 PM"
 */
function formatDateTime(dateInput) {
  if (!dateInput) return 'Recently';
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[d.getMonth()];
  const day = d.getDate();
  const year = d.getFullYear();
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  const hoursFormatted = String(hours).padStart(2, '0');

  return `${month} ${day}, ${year} • ${hoursFormatted}:${minutes} ${ampm}`;
}

/**
 * Safely constructs trusted ticket URL, preventing malicious redirect injection.
 */
function buildTrustedTicketUrl(ticketId, ticketNumber, link) {
  const configuredBase = (env.APP_URL || 'https://nexnuv-helpdesk.vercel.app').replace(/\/+$/, '');
  if (typeof link === 'string' && link.trim()) {
    const trimmed = link.trim();
    if (
      trimmed.startsWith(configuredBase) ||
      trimmed.startsWith('https://nexnuv-helpdesk.vercel.app') ||
      trimmed.startsWith('http://localhost') ||
      trimmed.startsWith('http://127.0.0.1')
    ) {
      return trimmed;
    }
  }
  const targetId = ticketId || ticketNumber || '';
  return `${configuredBase}/app/tickets/${encodeURIComponent(String(targetId))}`;
}

/**
 * Resolves standard SLA Priority code (P1, P2, P3, P4) from priority string.
 */
function resolveSlaPriorityLabel(priority, explicitLabel) {
  if (explicitLabel && typeof explicitLabel === 'string' && explicitLabel.trim()) {
    return explicitLabel.trim().toUpperCase();
  }
  const p = String(priority || '').toUpperCase();
  if (p === 'CRITICAL' || p === 'URGENT') return 'P1';
  if (p === 'HIGH') return 'P2';
  if (p === 'MEDIUM' || p === 'NORMAL') return 'P3';
  return 'P4';
}

/**
 * Resolves standard SLA Response Target (e.g. "2 hours") from SLA target or priority.
 */
function resolveSlaResponseTarget(priority, explicitTarget) {
  if (explicitTarget && typeof explicitTarget === 'string' && explicitTarget.trim()) {
    return explicitTarget.trim();
  }
  const label = resolveSlaPriorityLabel(priority);
  switch (label) {
    case 'P1': return '1 hour';
    case 'P2': return '2 hours';
    case 'P3': return '4 hours';
    case 'P4':
    default:
      return '24 hours';
  }
}

/**
 * Generic responsive email shell for other notification types.
 */
function emailShell(title, bodyHtml) {
  const currentYear = new Date().getFullYear();
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f5f9;margin:0;padding:24px 0;width:100% !important;">
    <tr>
      <td align="center" style="padding:0 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.05);border:1px solid #e2e8f0;">
          <!-- Top Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1d4ed8 0%,#2563eb 55%,#1e40af 100%);padding:22px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <div style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.4px;">${BRAND}</div>
                    <div style="font-size:12px;font-weight:500;color:#dbeafe;margin-top:4px;">${BRAND_TAGLINE}</div>
                  </td>
                  <td style="text-align:right;vertical-align:middle;"></td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding:32px 28px;">
              <h1 style="font-size:20px;font-weight:700;margin:0 0 16px;color:#0f172a;letter-spacing:-0.3px;">${esc(title)}</h1>
              ${bodyHtml}
            </td>
          </tr>
          <!-- Bottom Navy Footer -->
          <tr>
            <td style="background:#0f172a;padding:18px 28px;color:#94a3b8;font-size:12px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <span style="color:#ffffff;font-weight:700;font-size:14px;">${BRAND}</span>
                    <span style="color:#60a5fa;font-size:11px;margin-left:6px;">${BRAND_SUBTITLE}</span>
                  </td>
                  <td style="text-align:right;vertical-align:middle;color:#94a3b8;font-size:11px;">
                    &copy; ${currentYear} ${BRAND}. All rights reserved.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function button(href, label) {
  return `<div style="margin-top:24px;text-align:left;">
    <a href="${esc(href)}" style="display:inline-block;background:${BRAND_COLOR};color:#ffffff;text-decoration:none;padding:11px 24px;border-radius:8px;font-weight:600;font-size:14px;box-shadow:0 2px 4px rgba(37,99,235,0.25);">${esc(label)}</a>
  </div>`;
}

function metadataBadge(label, value, isPill = false) {
  const pillStyle = isPill
    ? 'background:#f1f5f9;color:#0f172a;padding:2px 8px;border-radius:6px;font-size:12px;font-weight:600;'
    : 'color:#0f172a;font-weight:600;';
  return `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:13px;">
    <span style="color:#64748b;">${esc(label)}</span>
    <span style="${pillStyle}">${esc(value)}</span>
  </div>`;
}

const ticketTemplates = {
  /**
   * TICKET ASSIGNED: Production-Ready NexnuvTKT Ticket Assignment Email
   * Faithful pixel-accurate recreation of reference specification with strict allowlist.
   *
   * Allowlist fields:
   * 1. agentName (Greeting)
   * 2. ticketNumber / ticketId (Ticket ID)
   * 3. title (Subject)
   * 4. category / type (Incident Type)
   * 5. description (Description)
   * 6. priority (Priority)
   * 7. creatorName (Created By Name)
   * 8. creatorEmail (Created By Email)
   * 9. createdAt (Created At formatted)
   * 10. slaPriorityLabel (SLA Priority Code: e.g. P2)
   * 11. slaResponseTarget (SLA Response Time: e.g. 2 hours)
   * 12. link (View Ticket trusted URL)
   * 13. currentYear (Footer)
   */
  ticket_assigned(params = {}) {
    const {
      agentName = 'Agent',
      ticketId = '',
      ticketNumber = '',
      title = '',
      subject = '',
      category = '',
      incidentType = '',
      type = '',
      description = 'No description provided.',
      priority = 'High',
      creatorName = 'Customer',
      creatorEmail = 'support@nexnuv.local',
      createdAt = new Date(),
      slaPriorityLabel = '',
      slaPolicyName = '',
      slaResponseTarget = '',
      responseTime = '',
      link = '',
      ticketUrl = '',
    } = params;

    const resolvedTicketId = ticketNumber || ticketId || 'HD-TICKET';
    const displayTicketId = String(resolvedTicketId).startsWith('#')
      ? String(resolvedTicketId)
      : `#${resolvedTicketId}`;

    const resolvedSubject = title || subject || 'Support Incident';
    const resolvedIncidentType = incidentType || category || type || 'Software Issue';
    const resolvedSlaPolicy = resolveSlaPriorityLabel(priority, slaPolicyName || slaPriorityLabel);
    const resolvedResponseTime = resolveSlaResponseTarget(priority, responseTime || slaResponseTarget);
    const formattedCreatedAt = formatDateTime(createdAt);
    const finalTicketUrl = buildTrustedTicketUrl(ticketId, ticketNumber, ticketUrl || link);
    const currentYear = new Date().getFullYear();

    const emailSubject = `[Assigned ${displayTicketId}] ${priority} Priority: ${resolvedSubject}`;
    const inAppTitle = `Ticket Assigned: ${displayTicketId}`;
    const inAppMessage = `You have been assigned ticket "${resolvedSubject}" (${priority} priority).`;

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You Have Been Assigned a Ticket - ${esc(displayTicketId)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f5f9;margin:0;padding:28px 0;width:100% !important;">
    <tr>
      <td align="center" style="padding:0 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,0.08);border:1px solid #e2e8f0;">

          <!-- 1. Header (Blue Gradient with Branding & Tagline) -->
          <tr>
            <td style="background:linear-gradient(135deg,#1d4ed8 0%,#2563eb 55%,#1e40af 100%);padding:24px 32px;border-radius:18px 18px 0 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <div style="font-size:20px;font-weight:800;color:#ffffff;line-height:1.2;letter-spacing:-0.4px;">${BRAND}</div>
                    <div style="font-size:12px;font-weight:500;color:#dbeafe;line-height:1.2;margin-top:4px;letter-spacing:-0.2px;">${BRAND_TAGLINE}</div>
                  </td>
                  <td style="text-align:right;vertical-align:middle;"></td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- 2. Main Content Card Area -->
          <tr>
            <td style="padding:32px 32px 24px;background:#ffffff;">

              <!-- Heading & Agent Greeting -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">
                <tr>
                  <td style="vertical-align:middle;">
                    <h1 style="margin:0 0 6px;font-size:22px;font-weight:800;color:#0f172a;letter-spacing:-0.4px;line-height:1.25;">You Have Been Assigned a Ticket</h1>
                    <div style="font-size:15px;font-weight:600;color:#475569;">Hello ${esc(agentName)},</div>
                  </td>
                </tr>
              </table>

              <!-- Intro Paragraph -->
              <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#475569;">
                You have been assigned to handle the following support ticket. Please review the details and take the necessary action.
              </p>

              <!-- 3. Ticket Details Box -->
              <div style="background:#f8faff;border:1px solid #bfdbfe;border-radius:14px;padding:22px 20px;margin-bottom:24px;">

                <!-- Details Header Bar -->
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;border-bottom:1px solid #e2e8f0;padding-bottom:14px;">
                  <tr>
                    <td style="vertical-align:middle;">
                      <span style="font-size:17px;font-weight:800;color:#0f172a;letter-spacing:-0.3px;">Ticket Details</span>
                    </td>
                    <td style="text-align:right;vertical-align:middle;">
                      <span style="display:inline-block;background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;border-radius:20px;padding:4px 12px;font-size:12px;font-weight:700;">
                        Assigned to You
                      </span>
                    </td>
                  </tr>
                </table>

                <!-- Two-Column Fields Table -->
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <!-- Left Column (Ticket ID, Incident Type, Priority, Created By, Created At) -->
                    <td width="48%" style="vertical-align:top;padding-right:12px;">

                      <!-- Field 1: Ticket ID -->
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;width:100%;">
                        <tr>
                          <td style="vertical-align:top;">
                            <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:none;">Ticket ID</div>
                            <div style="font-size:14px;font-weight:800;color:#0f172a;margin-top:2px;">${esc(displayTicketId)}</div>
                          </td>
                        </tr>
                      </table>

                      <!-- Field 2: Incident Type -->
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;width:100%;">
                        <tr>
                          <td style="vertical-align:top;">
                            <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:none;">Incident Type</div>
                            <div style="margin-top:4px;">
                              <span style="display:inline-block;background:#f3e8ff;color:#7e22ce;border:1px solid #e9d5ff;border-radius:6px;padding:3px 10px;font-size:12px;font-weight:700;">
                                ${esc(resolvedIncidentType)}
                              </span>
                            </div>
                          </td>
                        </tr>
                      </table>

                      <!-- Field 3: Priority -->
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;width:100%;">
                        <tr>
                          <td style="vertical-align:top;">
                            <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:none;">Priority</div>
                            <div style="margin-top:4px;">
                              <span style="display:inline-block;background:#fee2e2;color:#dc2626;border:1px solid #fecaca;border-radius:6px;padding:3px 10px;font-size:12px;font-weight:700;">
                                ${esc(priority)}
                              </span>
                            </div>
                          </td>
                        </tr>
                      </table>

                      <!-- Field 4: Created By -->
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;width:100%;">
                        <tr>
                          <td style="vertical-align:top;">
                            <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:none;">Created By</div>
                            <div style="font-size:14px;font-weight:700;color:#0f172a;margin-top:2px;">${esc(creatorName)}</div>
                            <div style="font-size:12px;color:#64748b;margin-top:2px;">${esc(creatorEmail)}</div>
                          </td>
                        </tr>
                      </table>

                      <!-- Field 5: Created At -->
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
                        <tr>
                          <td style="vertical-align:top;">
                            <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:none;">Created At</div>
                            <div style="font-size:14px;font-weight:700;color:#0f172a;margin-top:2px;">${esc(formattedCreatedAt)}</div>
                          </td>
                        </tr>
                      </table>

                    </td>

                    <!-- Right Column (Subject, Description) -->
                    <td width="52%" style="vertical-align:top;padding-left:12px;border-left:1px solid #f1f5f9;">

                      <!-- Field 6: Subject -->
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:18px;width:100%;">
                        <tr>
                          <td style="vertical-align:top;">
                            <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:none;">Subject</div>
                            <div style="font-size:14px;font-weight:800;color:#0f172a;margin-top:2px;line-height:1.45;word-break:break-word;">
                              ${esc(resolvedSubject)}
                            </div>
                          </td>
                        </tr>
                      </table>

                      <!-- Field 7: Description -->
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
                        <tr>
                          <td style="vertical-align:top;">
                            <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:none;">Description</div>
                            <div style="font-size:13px;line-height:1.55;color:#334155;margin-top:3px;word-break:break-word;">
                              ${nl2br(esc(description))}
                            </div>
                          </td>
                        </tr>
                      </table>

                    </td>
                  </tr>
                </table>

              </div>

              <!-- 4. SLA Reminder Box -->
              <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:16px 20px;margin-bottom:28px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="vertical-align:middle;">
                      <div style="font-size:14px;font-weight:800;color:#0f172a;margin-bottom:3px;">SLA Reminder</div>
                      <div style="font-size:13px;color:#334155;line-height:1.5;">
                        This ticket falls under <strong>${esc(resolvedSlaPolicy)}</strong> priority. Please respond within <strong>${esc(resolvedResponseTime)}</strong> as per the SLA policy.
                      </div>
                    </td>
                  </tr>
                </table>
              </div>

              <!-- 5. View Ticket Call To Action Button -->
              <div style="text-align:center;margin:0 0 24px;">
                <a href="${esc(finalTicketUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:13px 34px;border-radius:8px;box-shadow:0 3px 6px rgba(37,99,235,0.3);letter-spacing:-0.2px;">
                  View Ticket
                </a>
              </div>

              <!-- 6. Help Note -->
              <div style="text-align:center;font-size:12px;color:#64748b;margin-bottom:8px;">
                Need help? Contact your team lead or reach out to the Help Desk channel.
              </div>

            </td>
          </tr>

          <!-- 7. Dark Navy Footer -->
          <tr>
            <td style="background:#0f172a;padding:22px 32px;border-radius:0 0 18px 18px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <div style="font-size:15px;font-weight:800;color:#ffffff;line-height:1.2;">${BRAND}</div>
                    <div style="font-size:11px;font-weight:600;color:#60a5fa;line-height:1.2;margin-top:2px;">${BRAND_SUBTITLE}</div>
                  </td>
                  <td style="text-align:right;vertical-align:middle;">
                    <span style="font-size:11px;color:#94a3b8;">&copy; ${currentYear} ${BRAND}. All rights reserved.</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const text = `Hello ${agentName},\n\nYou have been assigned to handle support ticket ${displayTicketId}: "${resolvedSubject}".\n\nTicket Details:\n- Ticket ID: ${displayTicketId}\n- Incident Type: ${resolvedIncidentType}\n- Priority: ${priority}\n- Created By: ${creatorName} (${creatorEmail})\n- Created At: ${formattedCreatedAt}\n- Subject: ${resolvedSubject}\n- Description: ${description}\n\nSLA Reminder: This ticket falls under ${resolvedSlaPolicy} priority. Please respond within ${resolvedResponseTime} as per the SLA policy.\n\nView Ticket: ${finalTicketUrl}\n\n© ${currentYear} ${BRAND} ${BRAND_SUBTITLE}. All rights reserved.`;

    return { subject: emailSubject, html, text, inAppTitle, inAppMessage };
  },

  /**
   * TICKET CREATED: Sent to requester upon ticket submission.
   * Matches the visual reference layout and styling.
   */
  ticket_created(params = {}) {
    const { renderTicketCreated } = require('../../templates/ticket-created');
    return renderTicketCreated(params);
  },

  /**
   * COMMENT ADDED: Sent when an agent or customer posts a comment.
   */
  comment_added(params = {}) {
    const {
      recipientName = 'User',
      authorName = 'Support Agent',
      ticketNumber = 'HD-TICKET',
      title = 'Ticket Inquiry',
      commentMessage = '',
      isInternal = false,
      link = '',
    } = params;

    const displayTicketId = String(ticketNumber).startsWith('#') ? ticketNumber : `#${ticketNumber}`;
    const ticketUrl = buildTrustedTicketUrl('', ticketNumber, link);

    const subject = `[Reply on ${displayTicketId}] New message from ${authorName}`;
    const inAppTitle = `New Reply on ${displayTicketId}`;
    const inAppMessage = `${authorName} posted a reply on "${title}".`;

    const html = emailShell(
      `New Message on ${displayTicketId}`,
      `<p style="font-size:15px;line-height:1.6;color:#334155;margin:0 0 16px;">Hello ${esc(recipientName)},</p>
       <p style="font-size:14px;line-height:1.6;color:#475569;margin:0 0 16px;">
         <strong>${esc(authorName)}</strong> posted a new ${isInternal ? 'internal note' : 'reply'} regarding <strong>${esc(title)}</strong>:
       </p>

       <div style="background:#f1f5f9;border-left:4px solid ${BRAND_COLOR};border-radius:6px;padding:14px 16px;margin-bottom:20px;font-size:14px;line-height:1.6;color:#1e293b;">
         ${nl2br(esc(commentMessage))}
       </div>

       ${button(ticketUrl, 'View Full Conversation')}`
    );

    const text = `Hello ${recipientName},\n\n${authorName} posted a reply on ${displayTicketId} ("${title}"):\n\n"${commentMessage}"\n\nView conversation: ${ticketUrl}`;

    return { subject, html, text, inAppTitle, inAppMessage };
  },

  /**
   * TICKET STATUS CHANGED / RESOLVED
   */
  ticket_status_changed(params = {}) {
    const {
      customerName = 'Customer',
      ticketNumber = 'HD-TICKET',
      title = 'Support Request',
      oldStatus = 'Open',
      newStatus = 'Resolved',
      updatedBy = 'Support Operations',
      resolutionNotes = '',
      link = '',
    } = params;

    const displayTicketId = String(ticketNumber).startsWith('#') ? ticketNumber : `#${ticketNumber}`;
    const ticketUrl = buildTrustedTicketUrl('', ticketNumber, link);
    const isResolved = String(newStatus).toUpperCase() === 'RESOLVED' || String(newStatus).toUpperCase() === 'CLOSED';
    const subject = isResolved
      ? `[Resolved ${displayTicketId}] Your ticket has been resolved: ${title}`
      : `[${displayTicketId}] Status updated to ${newStatus}`;

    const inAppTitle = `Ticket ${displayTicketId} ${newStatus}`;
    const inAppMessage = `Status was updated from ${oldStatus} to ${newStatus}.`;

    const html = emailShell(
      `Ticket ${displayTicketId} is ${newStatus}`,
      `<p style="font-size:15px;line-height:1.6;color:#334155;margin:0 0 16px;">Hello ${esc(customerName)},</p>
       <p style="font-size:14px;line-height:1.6;color:#475569;margin:0 0 20px;">
         Your support ticket <strong>"${esc(title)}"</strong> status has been updated to <strong>${esc(newStatus)}</strong>.
       </p>

       ${resolutionNotes ? `
       <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;margin-bottom:20px;">
         <strong style="color:#166534;font-size:13px;">Resolution Notes:</strong>
         <p style="margin:6px 0 0;font-size:14px;color:#15803d;line-height:1.5;">${nl2br(esc(resolutionNotes))}</p>
       </div>` : ''}

       <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin-bottom:20px;">
         ${metadataBadge('Ticket Number', displayTicketId)}
         ${metadataBadge('Previous Status', oldStatus)}
         ${metadataBadge('Current Status', newStatus, true)}
         ${metadataBadge('Updated By', updatedBy)}
       </div>

       ${button(ticketUrl, 'Review Ticket & Feedback')}`
    );

    const text = `Hello ${customerName},\n\nYour ticket ${displayTicketId} ("${title}") status has been updated to: ${newStatus}.\n\nView ticket: ${ticketUrl}`;

    return { subject, html, text, inAppTitle, inAppMessage };
  },

  /**
   * SLA BREACHED / AT RISK
   */
  sla_breached(params = {}) {
    const {
      ticketNumber = 'HD-TICKET',
      title = 'Incident',
      priority = 'Critical',
      breachType = 'Resolution Target',
      agentName = 'Assigned Agent',
      link = '',
    } = params;

    const displayTicketId = String(ticketNumber).startsWith('#') ? ticketNumber : `#${ticketNumber}`;
    const ticketUrl = buildTrustedTicketUrl('', ticketNumber, link);

    const subject = `[CRITICAL SLA BREACH] ${displayTicketId} - ${title}`;
    const inAppTitle = `SLA Breached: ${displayTicketId}`;
    const inAppMessage = `SLA target (${breachType}) breached for ticket "${title}". Immediate action required.`;

    const html = emailShell(
      `SLA Breached: ${displayTicketId}`,
      `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px;margin-bottom:16px;color:#991b1b;font-weight:600;font-size:14px;">
         Attention: SLA threshold has been breached for this incident.
       </div>
       <p style="font-size:14px;line-height:1.6;color:#334155;margin:0 0 16px;">
         Ticket ${esc(displayTicketId)} (Priority: ${esc(priority)}) has exceeded its designated <strong>${esc(breachType)}</strong> target.
       </p>

       <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin-bottom:20px;">
         ${metadataBadge('Ticket', displayTicketId)}
         ${metadataBadge('Subject', title)}
         ${metadataBadge('Priority', priority, true)}
         ${metadataBadge('Breached Stage', breachType)}
         ${metadataBadge('Assigned Agent', agentName)}
       </div>

       ${button(ticketUrl, 'Escalate & Resolve Now')}`
    );

    const text = `CRITICAL SLA BREACH: Ticket ${displayTicketId} ("${title}") has exceeded its ${breachType} target.\nPriority: ${priority}\nOpen ticket: ${ticketUrl}`;

    return { subject, html, text, inAppTitle, inAppMessage };
  },

  agent_onboarding(params = {}) {
    const agentName = params.agentName || params.recipientName || params.name || 'Support Agent';
    const tenantName = params.tenantName || params.organizationName || 'Nexnuv Orbit';
    const email = params.email || params.recipientEmail || '';
    const tempPassword = params.tempPassword || params.temporaryPassword || '';
    const rawLoginUrl = params.loginUrl || `${(env.APP_URL || 'https://nexnuv-helpdesk.vercel.app').replace(/\/+$/, '')}/login`;
    const loginUrl = rawLoginUrl;

    const subject = 'Your Nexnuv Orbit Agent Account Is Ready';
    const inAppTitle = `Welcome to Nexnuv Orbit, ${agentName}`;
    const inAppMessage = `Your agent account for ${tenantName} has been created. Use your temporary password on first login to set your permanent password.`;

    const bodyHtml = `
      <p style="font-size:15px;line-height:1.6;color:#334155;margin:0 0 16px;">
        Hello <strong>${esc(agentName)}</strong>,
      </p>
      <p style="font-size:14px;line-height:1.6;color:#334155;margin:0 0 20px;">
        Your agent account has been created successfully for <strong>${esc(tenantName)}</strong>.
      </p>

      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin-bottom:24px;">
        <div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:14px;text-transform:uppercase;letter-spacing:0.5px;">
          Your login details
        </div>
        <table role="presentation" width="100%" cellpadding="6" cellspacing="0" style="font-size:14px;color:#334155;">
          <tr>
            <td width="160" style="color:#64748b;font-weight:500;">Email:</td>
            <td style="font-weight:600;color:#0f172a;">${esc(email)}</td>
          </tr>
          <tr>
            <td style="color:#64748b;font-weight:500;">Temporary password:</td>
            <td style="font-family:monospace;font-size:15px;font-weight:700;color:#2563eb;background:#eff6ff;padding:4px 8px;border-radius:4px;display:inline-block;">${esc(tempPassword)}</td>
          </tr>
          <tr>
            <td style="color:#64748b;font-weight:500;">Login URL:</td>
            <td><a href="${esc(loginUrl)}" style="color:#2563eb;text-decoration:none;font-weight:500;">${esc(loginUrl)}</a></td>
          </tr>
        </table>
      </div>

      <p style="font-size:14px;line-height:1.6;color:#334155;margin:0 0 16px;">
        For your first login, enter your email address and temporary password. You will then be required to set a new password before accessing your account.
      </p>

      <div style="font-size:13px;line-height:1.6;color:#92400e;background:#fffbeb;border:1px solid #fef3c7;border-radius:8px;padding:12px;margin-bottom:24px;">
        Keep your temporary password confidential. You will be required to replace it with a permanent password immediately.
      </div>

      <div style="text-align:center;margin-bottom:24px;">
        <a href="${esc(loginUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:8px;box-shadow:0 2px 4px rgba(37,99,235,0.2);">
          Sign In to Nexnuv Orbit
        </a>
      </div>

      <p style="font-size:14px;line-height:1.6;color:#475569;margin:0;">
        Regards,<br/>
        <strong>Nexnuv Orbit Support Team</strong>
      </p>
    `;

    const html = emailShell('Welcome to Nexnuv Orbit', bodyHtml);

    const text = `Welcome to Nexnuv Orbit\n\nHello ${agentName},\n\nYour agent account has been created successfully for ${tenantName}.\n\nYour login details:\n- Email: ${email}\n- Temporary password: ${tempPassword}\n- Login URL: ${loginUrl}\n\nFor your first login, enter your email address and temporary password. You will then be required to set a new password before accessing your account.\n\nKeep your temporary password confidential.\n\nRegards,\nNexnuv Orbit Support Team`;

    return { subject, html, text, inAppTitle, inAppMessage };
  },
};

module.exports = ticketTemplates;
