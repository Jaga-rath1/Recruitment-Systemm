/**
 * TypeScript contract and renderer for Ticket Assigned email notification.
 */
export interface TicketAssignedTemplateParams {
  agentName?: string;
  agentEmail?: string;
  ticketId?: string;
  ticketNumber?: string;
  subject?: string;
  title?: string;
  description?: string;
  incidentType?: string;
  category?: string;
  type?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'URGENT' | string;
  creatorName?: string;
  creatorEmail?: string;
  createdAt?: string | Date;
  teamName?: string;
  slaPriorityLabel?: 'P1' | 'P2' | 'P3' | 'P4' | string;
  slaPolicyName?: string;
  slaResponseTarget?: string;
  responseTime?: string;
  ticketUrl?: string;
  link?: string;
  currentYear?: number;
}

export interface RenderedEmailResult {
  subject: string;
  html: string;
  text: string;
  inAppTitle: string;
  inAppMessage: string;
}

const BRAND = (process.env.BRAND_NAME || 'NexnuvTKT').trim();
const BRAND_SUBTITLE = 'Help Desk';
const BRAND_TAGLINE = 'Better Support, Faster Solution';

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function nl2br(escapedText: string): string {
  return String(escapedText ?? '').replace(/\r\n|\n|\r/g, '<br/>');
}

function formatDateTime(dateInput?: string | Date): string {
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

export function renderTicketAssigned(params: Partial<TicketAssignedTemplateParams> = {}): RenderedEmailResult {
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

  const p = String(priority || '').toUpperCase();
  const resolvedSlaPolicy = slaPolicyName || slaPriorityLabel || (p === 'CRITICAL' ? 'P1' : p === 'HIGH' ? 'P2' : p === 'MEDIUM' ? 'P3' : 'P4');
  const resolvedResponseTime = responseTime || slaResponseTarget || (resolvedSlaPolicy === 'P1' ? '1 hour' : resolvedSlaPolicy === 'P2' ? '2 hours' : resolvedSlaPolicy === 'P3' ? '4 hours' : '24 hours');
  const formattedCreatedAt = formatDateTime(createdAt);

  const configuredBase = (process.env.APP_URL || 'https://nexnuv-helpdesk.vercel.app').replace(/\/+$/, '');
  const targetId = ticketId || ticketNumber || '';
  const finalTicketUrl = ticketUrl || link || `${configuredBase}/app/tickets/${encodeURIComponent(String(targetId))}`;
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
<body style="margin:0;padding:0;background:#f0f6ff;font-family:Arial,Helvetica,sans-serif;color:#142650;-webkit-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#f0f6ff;margin:0;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:820px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 6px 18px rgba(20,38,80,0.06);border:1px solid #d9e6ff;">
          <tr>
            <td style="background:#2154cb;background-image:linear-gradient(115deg,#1757c8,#303fbb);color:#ffffff;padding:26px 36px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td valign="middle" style="vertical-align:middle;">
                    <p style="margin:0;color:#ffffff;font-size:24px;font-weight:700;line-height:1.2;">${BRAND}</p>
                    <p style="margin:4px 0 0;color:#e3edff;font-size:13px;font-weight:500;">${BRAND_TAGLINE}</p>
                  </td>
                  <td valign="middle" style="text-align:right;vertical-align:middle;"></td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 36px 20px;background:#ffffff;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
                <tr>
                  <td style="vertical-align:middle;">
                    <h1 style="color:#142650;font-size:26px;font-weight:800;line-height:1.25;margin:0 0 6px;letter-spacing:-0.3px;">You Have Been Assigned a Ticket</h1>
                    <p style="color:#526991;font-size:16px;font-weight:600;margin:0;">Hello ${esc(agentName)},</p>
                  </td>
                </tr>
              </table>
              <p style="color:#526991;font-size:15px;line-height:1.6;margin:0 0 24px;">
                You have been assigned to handle the following support ticket. Please review the details and take the necessary action.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #d9e6ff;border-radius:12px;background:#fbfdff;padding:22px 24px;margin-bottom:24px;">
                <tr>
                  <td colspan="2" style="padding-bottom:14px;border-bottom:1px solid #edf3ff;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td valign="middle">
                          <h2 style="font-size:18px;font-weight:700;color:#142650;margin:0;">Ticket Details</h2>
                        </td>
                        <td align="right" valign="middle">
                          <span style="display:inline-block;padding:6px 14px;border-radius:20px;background:#e5f2ff;color:#075bdc;font-size:12px;font-weight:700;white-space:nowrap;border:1px solid #c5dfff;">
                            Assigned to You
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 14px 12px 0;vertical-align:top;width:48%;">
                    <p style="color:#6279a0;font-size:12px;font-weight:600;line-height:1.4;margin:0 0 4px;">Ticket ID</p>
                    <p style="color:#142650;font-size:15px;font-weight:700;line-height:1.4;margin:0;word-break:break-word;">${esc(displayTicketId)}</p>
                  </td>
                  <td style="padding:16px 0 12px 14px;vertical-align:top;width:52%;">
                    <p style="color:#6279a0;font-size:12px;font-weight:600;line-height:1.4;margin:0 0 4px;">Subject</p>
                    <p style="color:#142650;font-size:15px;font-weight:700;line-height:1.4;margin:0;word-break:break-word;">${esc(resolvedSubject)}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:10px 14px 12px 0;vertical-align:top;width:48%;">
                    <p style="color:#6279a0;font-size:12px;font-weight:600;line-height:1.4;margin:0 0 6px;">Incident Type</p>
                    <p style="margin:0;"><span style="display:inline-block;padding:5px 12px;border-radius:6px;font-size:12px;font-weight:700;background:#f0e5ff;color:#7c2de2;border:1px solid #e2ceff;">${esc(resolvedIncidentType)}</span></p>
                  </td>
                  <td style="padding:10px 0 12px 14px;vertical-align:top;width:52%;">
                    <p style="color:#6279a0;font-size:12px;font-weight:600;line-height:1.4;margin:0 0 4px;">Description</p>
                    <p style="color:#33486a;font-size:13px;font-weight:400;line-height:1.6;margin:0;word-break:break-word;">${nl2br(esc(description))}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:10px 14px 12px 0;vertical-align:top;width:48%;">
                    <p style="color:#6279a0;font-size:12px;font-weight:600;line-height:1.4;margin:0 0 6px;">Priority</p>
                    <p style="margin:0;"><span style="display:inline-block;padding:5px 12px;border-radius:6px;font-size:12px;font-weight:700;background:#ffe7eb;color:#dc253d;border:1px solid #ffccd3;">${esc(priority)}</span></p>
                  </td>
                  <td style="padding:10px 0 12px 14px;vertical-align:top;width:52%;">
                    <p style="color:#6279a0;font-size:12px;font-weight:600;line-height:1.4;margin:0 0 4px;"></p>
                    <p style="color:#142650;font-size:14px;font-weight:700;line-height:1.4;margin:0;"></p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:10px 14px 14px 0;vertical-align:top;width:48%;">
                    <p style="color:#6279a0;font-size:12px;font-weight:600;line-height:1.4;margin:0 0 4px;">Created By</p>
                    <p style="color:#142650;font-size:14px;font-weight:700;line-height:1.4;margin:0;">${esc(creatorName)}</p>
                    <p style="color:#6279a0;font-size:12px;line-height:1.4;margin:2px 0 0;">${esc(creatorEmail)}</p>
                  </td>
                  <td style="padding:10px 0 14px 14px;vertical-align:top;width:52%;">
                    <p style="color:#6279a0;font-size:12px;font-weight:600;line-height:1.4;margin:0 0 4px;">Created At</p>
                    <p style="color:#142650;font-size:14px;font-weight:700;line-height:1.4;margin:0;">${esc(formattedCreatedAt)}</p>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0f6ff;border:1px solid #d9e6ff;border-radius:12px;padding:20px 22px;margin-bottom:28px;">
                <tr>
                  <td valign="top">
                    <p style="color:#142650;font-size:15px;font-weight:700;margin:0 0 4px;">SLA Reminder</p>
                    <p style="color:#526991;font-size:13px;line-height:1.6;margin:0;">
                      This ticket falls under <strong>${esc(resolvedSlaPolicy)}</strong> priority. Please respond within <strong>${esc(resolvedResponseTime)}</strong> as per the SLA policy.
                    </p>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding:6px 0 28px;text-align:center;">
                    <a href="${esc(finalTicketUrl)}" style="display:inline-block;background:#1760ed;color:#ffffff !important;text-decoration:none;font-size:15px;font-weight:700;padding:14px 40px;border-radius:10px;box-shadow:0 4px 14px rgba(23,96,237,0.35);">
                      View Ticket
                    </a>
                  </td>
                </tr>
              </table>
              <div style="border-top:1px solid #e5efff;padding:20px 8px 12px;text-align:center;color:#7085a8;font-size:13px;line-height:1.6;">
                Need help? Contact your team lead or reach out to the Help Desk channel.
              </div>
            </td>
          </tr>
          <tr>
            <td style="background:#0f1d38;color:#ffffff;padding:24px 36px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td valign="middle" style="vertical-align:middle;">
                    <p style="margin:0;color:#ffffff;font-size:16px;font-weight:700;">${BRAND}</p>
                    <p style="margin:2px 0 0;color:#75aaff;font-size:12px;">${BRAND_SUBTITLE}</p>
                  </td>
                  <td valign="middle" style="text-align:right;vertical-align:middle;color:#8c9ebc;font-size:12px;">
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

  const text = `Hello ${agentName},\n\nYou have been assigned to handle support ticket ${displayTicketId}: "${resolvedSubject}".\n\nTicket Details:\n- Ticket ID: ${displayTicketId}\n- Incident Type: ${resolvedIncidentType}\n- Priority: ${priority}\n- Created By: ${creatorName} (${creatorEmail})\n- Created At: ${formattedCreatedAt}\n- Subject: ${resolvedSubject}\n- Description: ${description}\n\nSLA Reminder: This ticket falls under ${resolvedSlaPolicy} priority. Please respond within ${resolvedResponseTime} as per the SLA policy.\n\nView Ticket: ${finalTicketUrl}\n\n© ${currentYear} ${BRAND} ${BRAND_SUBTITLE}. All rights reserved.`;

  return { subject: emailSubject, html, text, inAppTitle, inAppMessage };
}
