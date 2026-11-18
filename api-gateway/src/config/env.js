require("dotenv").config();

const NODE_ENV = process.env.NODE_ENV || "development";

if (NODE_ENV === "production" && !process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET must be set in production");
}

const defaultOrigins = [
  "https://nexnuv-hrms.vercel.app",
  "https://nexnuv-helpdesk.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:4000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:4000",
];

const envOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const CORS_ORIGINS = Array.from(new Set([...defaultOrigins, ...envOrigins]));

module.exports = {
  NODE_ENV,
  PORT: parseInt(process.env.PORT || "4000", 10),
  JWT_SECRET: process.env.JWT_SECRET || "change-me",
  INTERNAL_SERVICE_TOKEN: process.env.INTERNAL_SERVICE_TOKEN || "nexnuv-internal-service-token-dev",
  SESSION_CHECK_TTL_MS: parseInt(process.env.SESSION_CHECK_TTL_MS || "30000", 10),
  CORS_ORIGINS,

  // Shared Services
  AUTH_SERVICE_URL: process.env.AUTH_SERVICE_URL || "http://localhost:4001",
  NOTIFICATION_SERVICE_URL: process.env.NOTIFICATION_SERVICE_URL || "http://localhost:4006",

  // HRMS Services
  PLATFORM_SERVICE_URL: process.env.PLATFORM_SERVICE_URL || "http://localhost:4002",
  ORGANIZATION_SERVICE_URL: process.env.ORGANIZATION_SERVICE_URL || "http://localhost:4003",
  EMPLOYEE_SERVICE_URL: process.env.EMPLOYEE_SERVICE_URL || "http://localhost:4004",
  ATTENDANCE_LEAVE_SERVICE_URL: process.env.ATTENDANCE_LEAVE_SERVICE_URL || "http://localhost:4005",

  // Helpdesk Services
  TICKET_SERVICE_URL: process.env.TICKET_SERVICE_URL || process.env.HELPDESK_SERVICE_URL || "http://localhost:4002",
  TEAM_SERVICE_URL: process.env.TEAM_SERVICE_URL || process.env.TICKET_SERVICE_URL || process.env.HELPDESK_SERVICE_URL || "http://localhost:4002",
  AGENT_SERVICE_URL: process.env.AGENT_SERVICE_URL || process.env.TICKET_SERVICE_URL || process.env.HELPDESK_SERVICE_URL || "http://localhost:4002",
  SLA_SERVICE_URL: process.env.SLA_SERVICE_URL || process.env.TICKET_SERVICE_URL || process.env.HELPDESK_SERVICE_URL || "http://localhost:4002",
  ATTACHMENT_SERVICE_URL: process.env.ATTACHMENT_SERVICE_URL || process.env.TICKET_SERVICE_URL || process.env.HELPDESK_SERVICE_URL || "http://localhost:4002",
  KNOWLEDGE_BASE_SERVICE_URL: process.env.KNOWLEDGE_BASE_SERVICE_URL || process.env.TICKET_SERVICE_URL || process.env.HELPDESK_SERVICE_URL || "http://localhost:4002",
};
