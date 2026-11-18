/**
 * TypeScript contract and renderer for Ticket Created email notification.
 */
export interface TicketCreatedTemplateParams {
  ticketId?: string;
  ticketNumber?: string;
  subject?: string;
  title?: string;
  description?: string;
  incidentType?: string;
  category?: string;
  type?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'URGENT' | string;
  status?: 'OPEN' | 'IN_PROGRESS' | 'WAITING' | 'RESOLVED' | 'CLOSED' | string;
  customerName?: string;
  creatorName?: string;
  customerEmail?: string;
  creatorEmail?: string;
  createdAt?: string | Date;
  assignedAgentName?: string;
  assignedAgentEmail?: string;
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

export function renderTicketCreated(params: Partial<TicketCreatedTemplateParams> = {}): RenderedEmailResult {
  const {
    customerName = 'Valued Customer',
    creatorName = '',
    creatorEmail = '',
    customerEmail = '',
    ticketId = '',
    ticketNumber = '',
    title = '',
    subject = '',
    category = '',
    incidentType = '',
    type = '',
    description = 'No description provided.',
    priority = 'Normal',
    status = 'OPEN',
    createdAt = new Date(),
    assignedAgentName = '',
    assignedAgentEmail = '',
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

  const resolvedRecipientName = customerName || creatorName || 'Valued Customer';
  const resolvedCreatorEmail = creatorEmail || customerEmail || 'requester@nexnuv.local';
  const resolvedSubject = title || subject || 'Support Request';
  const resolvedIncidentType = incidentType || category || type || 'General Support';
  const resolvedStatus = String(status || 'OPEN').toUpperCase();

  const p = String(priority || '').toUpperCase();
  const resolvedSlaPolicy = slaPolicyName || slaPriorityLabel || (p === 'CRITICAL' ? 'P1' : p === 'HIGH' ? 'P2' : p === 'MEDIUM' ? 'P3' : 'P4');
  const resolvedResponseTime = responseTime || slaResponseTarget || (resolvedSlaPolicy === 'P1' ? '1 hour' : resolvedSlaPolicy === 'P2' ? '2 hours' : resolvedSlaPolicy === 'P3' ? '4 hours' : '24 hours');
  const formattedCreatedAt = formatDateTime(createdAt);

  const configuredBase = (process.env.APP_URL || 'https://nexnuv-helpdesk.vercel.app').replace(/\/+$/, '');
  const targetId = ticketId || ticketNumber || '';
  const finalTicketUrl = ticketUrl || link || `${configuredBase}/app/tickets/${encodeURIComponent(String(targetId))}`;
  const currentYear = new Date().getFullYear();

  const assignedDisplay = assignedAgentName
    ? `${assignedAgentName}${assignedAgentEmail ? ` (${assignedAgentEmail})` : ''}`
    : 'Pending Assignment';

  const emailSubject = `[${displayTicketId}] Ticket Received: ${resolvedSubject}`;
  const inAppTitle = `Ticket Created: ${displayTicketId}`;
  const inAppMessage = `Your support ticket "${resolvedSubject}" has been registered successfully.`;

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ticket Created - ${esc(displayTicketId)}</title>
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
              <h1 style="color:#142650;font-size:26px;font-weight:800;line-height:1.25;margin:0 0 6px;letter-spacing:-0.3px;">Your Support Ticket Has Been Created</h1>
              <p style="color:#526991;font-size:16px;font-weight:600;margin:0 0 20px;">Hello ${esc(resolvedRecipientName)},</p>
              <p style="color:#526991;font-size:15px;line-height:1.6;margin:0 0 24px;">
                Thank you for reaching out to ${BRAND} ${BRAND_SUBTITLE}. Your support request has been logged and assigned a tracking ID. Our team is actively reviewing your request.
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
                          <span style="display:inline-block;padding:6px 14px;border-radius:20px;background:#ecfdf5;color:#059669;font-size:12px;font-weight:700;white-space:nowrap;border:1px solid #a7f3d0;">
                            Status: ${esc(resolvedStatus)}
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
                    <p style="color:#6279a0;font-size:12px;font-weight:600;line-height:1.4;margin:0 0 4px;">Current Status</p>
                    <p style="color:#142650;font-size:14px;font-weight:700;line-height:1.4;margin:0;">${esc(resolvedStatus)}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:10px 14px 14px 0;vertical-align:top;width:48%;">
                    <p style="color:#6279a0;font-size:12px;font-weight:600;line-height:1.4;margin:0 0 4px;">Created By</p>
                    <p style="color:#142650;font-size:14px;font-weight:700;line-height:1.4;margin:0;">${esc(resolvedRecipientName)}</p>
                    <p style="color:#6279a0;font-size:12px;line-height:1.4;margin:2px 0 0;">${esc(resolvedCreatorEmail)}</p>
                  </td>
                  <td style="padding:10px 0 14px 14px;vertical-align:top;width:52%;">
                    <p style="color:#6279a0;font-size:12px;font-weight:600;line-height:1.4;margin:0 0 4px;">Created At</p>
                    <p style="color:#142650;font-size:14px;font-weight:700;line-height:1.4;margin:0;">${esc(formattedCreatedAt)}</p>
                  </td>
                </tr>
                <tr>
                  <td colspan="2" style="border-top:1px dashed #edf3ff;padding-top:14px;">
                    <p style="color:#6279a0;font-size:12px;font-weight:600;line-height:1.4;margin:0 0 4px;">Assigned Representative</p>
                    <p style="color:#142650;font-size:14px;font-weight:700;line-height:1.4;margin:0;">${esc(assignedDisplay)}</p>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0f6ff;border:1px solid #d9e6ff;border-radius:12px;padding:20px 22px;margin-bottom:28px;">
                <tr>
                  <td valign="top">
                    <p style="color:#142650;font-size:15px;font-weight:700;margin:0 0 4px;">SLA Resolution Commitment</p>
                    <p style="color:#526991;font-size:13px;line-height:1.6;margin:0;">
                      This ticket falls under <strong>${esc(resolvedSlaPolicy)}</strong> priority. Our target initial response time is <strong>${esc(resolvedResponseTime)}</strong> as per our SLA policy.
                    </p>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding:6px 0 28px;text-align:center;">
                    <a href="${esc(finalTicketUrl)}" style="display:inline-block;background:#1760ed;color:#ffffff !important;text-decoration:none;font-size:15px;font-weight:700;padding:14px 40px;border-radius:10px;box-shadow:0 4px 14px rgba(23,96,237,0.35);">
                      View Ticket in Portal
                    </a>
                  </td>
                </tr>
              </table>
              <div style="border-top:1px solid #e5efff;padding:20px 8px 12px;text-align:center;color:#7085a8;font-size:13px;line-height:1.6;">
                Need help? Reply directly to this notification or contact the Help Desk team.
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

  const text = `Hello ${resolvedRecipientName},\n\nYour support ticket ${displayTicketId} ("${resolvedSubject}") has been registered.\n\nTicket Details:\n- Ticket ID: ${displayTicketId}\n- Incident Type: ${resolvedIncidentType}\n- Priority: ${priority}\n- Status: ${resolvedStatus}\n- Created By: ${resolvedRecipientName} (${resolvedCreatorEmail})\n- Created At: ${formattedCreatedAt}\n- Assigned To: ${assignedDisplay}\n- Description: ${description}\n\nSLA Target: ${resolvedSlaPolicy} priority (Response target: ${resolvedResponseTime})\n\nView Ticket: ${finalTicketUrl}\n\n© ${currentYear} ${BRAND} ${BRAND_SUBTITLE}. All rights reserved.`;

  return { subject: emailSubject, html, text, inAppTitle, inAppMessage };
}
