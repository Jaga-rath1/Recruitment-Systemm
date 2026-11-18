const env = require("./env");

function normalizeUrl(url, fallback, defaultPort = 10000) {
  let target = (url || fallback || "").trim();
  if (!target) return fallback;

  if (/^https?:\/\//i.test(target)) {
    let cleaned = target;
    if (cleaned.startsWith("https://") && (!cleaned.includes(".") || cleaned.includes(":10000"))) {
      cleaned = cleaned.replace(/^https:\/\//i, "http://");
    }
    try {
      const parsed = new URL(cleaned);
      if (!parsed.port && !parsed.hostname.includes(".") && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
        parsed.port = String(defaultPort);
        return parsed.toString().replace(/\/+$/, "");
      }
    } catch {}
    return cleaned.replace(/\/+$/, "");
  }

  const isInternal = target.includes("localhost") || target.includes("127.0.0.1") || !target.includes(".");
  const hasPort = /:\d+$/.test(target);

  if (isInternal) {
    const hostWithPort = (!hasPort && !target.includes("localhost") && !target.includes("127.0.0.1"))
      ? `${target}:${defaultPort}`
      : target;
    return `http://${hostWithPort}`;
  }

  return `https://${target}`;
}

module.exports = {
  // Shared Services
  AUTH:             normalizeUrl(env.AUTH_SERVICE_URL, "http://127.0.0.1:4001"),
  NOTIFICATION:     normalizeUrl(env.NOTIFICATION_SERVICE_URL, "http://127.0.0.1:4006"),

  // HRMS Services
  PLATFORM:         normalizeUrl(env.PLATFORM_SERVICE_URL, "http://127.0.0.1:4002"),
  ORGANIZATION:     normalizeUrl(env.ORGANIZATION_SERVICE_URL, "http://127.0.0.1:4003"),
  EMPLOYEE:         normalizeUrl(env.EMPLOYEE_SERVICE_URL, "http://127.0.0.1:4004"),
  ATTENDANCE_LEAVE: normalizeUrl(env.ATTENDANCE_LEAVE_SERVICE_URL, "http://127.0.0.1:4005"),

  // Helpdesk Services
  TICKET:           normalizeUrl(env.TICKET_SERVICE_URL, "http://127.0.0.1:4002"),
  TEAM:             normalizeUrl(env.TEAM_SERVICE_URL, "http://127.0.0.1:4002"),
  AGENT:            normalizeUrl(env.AGENT_SERVICE_URL, "http://127.0.0.1:4002"),
  SLA:              normalizeUrl(env.SLA_SERVICE_URL, "http://127.0.0.1:4002"),
  ATTACHMENT:       normalizeUrl(env.ATTACHMENT_SERVICE_URL, "http://127.0.0.1:4002"),
  KNOWLEDGE_BASE:   normalizeUrl(env.KNOWLEDGE_BASE_SERVICE_URL, "http://127.0.0.1:4002"),
};
