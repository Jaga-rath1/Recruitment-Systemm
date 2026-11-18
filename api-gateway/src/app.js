const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const errorMiddleware = require("./middlewares/error");
const { createProxy } = require("./proxy/serviceProxy");
const services = require("./config/services");
const { CORS_ORIGINS, INTERNAL_SERVICE_TOKEN } = require("./config/env");
const { verifyToken, stripTrustedHeaders } = require("./middlewares/auth");
const { verifySession } = require("./middlewares/session");
const { resolveOrganization } = require("./middlewares/tenant");
const { logger } = require("./config/logger");

const app = express();
app.disable("x-powered-by");
const corsOptions = {
  origin: true, // Dynamically reflects request Origin, satisfying CORS credential specs and eliminating wildcard conflicts
  credentials: true,
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Tenant-Id",
    "x-tenant-id",
    "x-user-id",
    "x-user-email",
    "x-user-name",
    "x-user-role",
    "x-organization-id",
    "x-industry-id",
    "X-Industry-Id",
    "x-internal-token",
    "x-requested-with",
    "Accept",
  ],
  exposedHeaders: ["x-tenant-id", "x-request-id", "x-user-id", "x-organization-id", "x-industry-id"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    service: "api-gateway",
    message: "NexnuvTKT API Gateway is running",
    timestamp: new Date().toISOString()
  });
});

app.get(["/health", "/healthy"], (req, res) => {
  logger.debug({ route: req.path }, "Gateway health probe requested");
  res.status(200).json({
    success: true,
    service: "api-gateway",
    status: "healthy",
    timestamp: new Date().toISOString()
  });
});

app.get("/ready", (req, res) => {
  res.status(200).json({
    success: true,
    service: "api-gateway",
    status: "ready",
    timestamp: new Date().toISOString(),
    checks: {
      gateway: "up"
    }
  });
});

// Public: auth routes (support both /api/v1/auth and /auth)
app.use(["/api/v1/auth", "/auth"], stripTrustedHeaders, createProxy(services.AUTH));

// Protected: valid JWT or internal service token, session check, organization context
const protect = [verifyToken, verifySession, resolveOrganization];

// Optional auth middleware for public read access (knowledge base articles/categories, public incident types)
const optionalProtect = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const internalToken = req.headers["x-internal-token"];
  if (
    (authHeader && authHeader.startsWith("Bearer ")) ||
    (internalToken && INTERNAL_SERVICE_TOKEN && internalToken === INTERNAL_SERVICE_TOKEN)
  ) {
    return verifyToken(req, res, (err) => {
      if (err) {
        // If token invalid on a GET read request, gracefully downgrade to guest instead of failing with 401
        if (req.method === "GET") {
          return stripTrustedHeaders(req, res, () => {
            const orgId = req.headers["x-organization-id"] || req.headers["x-tenant-id"] || "00000000-0000-0000-0000-000000000001";
            req.headers["x-organization-id"] = orgId;
            req.headers["x-tenant-id"] = orgId;
            req.headers["x-user-role"] = "customer";
            req.headers["x-user-id"] = "guest";
            if (INTERNAL_SERVICE_TOKEN) req.headers["x-internal-token"] = INTERNAL_SERVICE_TOKEN;
            return next();
          });
        }
        return next(err);
      }
      return verifySession(req, res, (sessErr) => {
        if (sessErr) {
          if (req.method === "GET") {
            return stripTrustedHeaders(req, res, () => {
              const orgId = req.headers["x-organization-id"] || req.headers["x-tenant-id"] || "00000000-0000-0000-0000-000000000001";
              req.headers["x-organization-id"] = orgId;
              req.headers["x-tenant-id"] = orgId;
              req.headers["x-user-role"] = "customer";
              req.headers["x-user-id"] = "guest";
              if (INTERNAL_SERVICE_TOKEN) req.headers["x-internal-token"] = INTERNAL_SERVICE_TOKEN;
              return next();
            });
          }
          return next(sessErr);
        }
        return resolveOrganization(req, res, next);
      });
    });
  }

  // No auth header provided: allow public guest access
  stripTrustedHeaders(req, res, () => {
    const orgId = req.headers["x-organization-id"] || req.headers["x-tenant-id"] || "00000000-0000-0000-0000-000000000001";
    req.headers["x-organization-id"] = orgId;
    req.headers["x-tenant-id"] = orgId;
    req.headers["x-user-role"] = "customer";
    req.headers["x-user-id"] = "guest";
    if (INTERNAL_SERVICE_TOKEN) req.headers["x-internal-token"] = INTERNAL_SERVICE_TOKEN;
    next();
  });
};

// Knowledge Base auth wrapper: GET read & feedback are public/optional; writes require full protect
// Industries auth wrapper: GET read is public/optional for signup; writes require full protect
const industryAuth = (req, res, next) => {
  if (req.method === "GET") {
    return optionalProtect(req, res, next);
  }
  return protect[0](req, res, (e1) => {
    if (e1) return next(e1);
    return protect[1](req, res, (e2) => {
      if (e2) return next(e2);
      return protect[2](req, res, next);
    });
  });
};

const kbAuth = (req, res, next) => {
  if (req.method === "GET" || (req.method === "POST" && req.path.includes("/feedback"))) {
    return optionalProtect(req, res, next);
  }
  return protect[0](req, res, (e1) => {
    if (e1) return next(e1);
    return protect[1](req, res, (e2) => {
      if (e2) return next(e2);
      return protect[2](req, res, next);
    });
  });
};

const {
  normalizeGatewayRole,
  requireGatewayRoles,
  forbidGatewayRoles,
} = require("./middlewares/rbac");


// Gateway Ticket Guard
const gatewayTicketGuard = (req, res, next) => {
  const role = req.user?.role || req.headers["x-user-role"];
  const normalized = normalizeGatewayRole(role);
  if (normalized === "platform_admin") {
    return res.status(403).json({
      success: false,
      code: "FORBIDDEN",
      message: "Forbidden: Platform Admin cannot access or create tenant tickets",
    });
  }
  if (normalized === "customer") {
    const isCreate = req.method === "POST" && (req.path === "/" || req.path === "" || req.path === "/tickets" || req.path === "/api/v1/tickets");
    const isIncidentTypes = req.originalUrl.includes("incident-types");
    if (!isCreate && !isIncidentTypes) {
      return res.status(403).json({
        success: false,
        code: "FORBIDDEN",
        message: "Forbidden: Employee role is restricted to ticket creation only",
      });
    }
  }

  // Personal and team ticket queries: restricted to Support Agent only
  const url = req.originalUrl.toLowerCase();
  const isPersonalOrTeam =
    url.includes("my-tickets") ||
    url.includes("team-tickets") ||
    url.includes("filter=my") ||
    url.includes("filter=team") ||
    url.includes("scope=my") ||
    url.includes("scope=team") ||
    url.includes("mytickets=true") ||
    url.includes("myteamtickets=true") ||
    url.includes("assignedonly=true");

  if (isPersonalOrTeam && normalized !== "support_agent") {
    return res.status(403).json({
      success: false,
      code: "FORBIDDEN",
      message: "Forbidden: Only Support Agents can access personal and team ticket views",
    });
  }

  next();
};

// Gateway SLA Guard
const gatewaySlaGuard = (req, res, next) => {
  const role = req.user?.role || req.headers["x-user-role"];
  const normalized = normalizeGatewayRole(role);
  const path = req.originalUrl.toLowerCase();

  // Support Agent & Customer cannot access SLA
  if (normalized === "support_agent" || normalized === "customer") {
    return res.status(403).json({
      success: false,
      code: "FORBIDDEN",
      message: `Forbidden: Role '${role || "unassigned"}' cannot access SLA configuration`,
    });
  }

  // Tenant-specific SLA routes: Platform Admin forbidden
  const isTenantRoute = path.includes("tenant-policies") || path.includes("organization-config") || path.includes("tenant");
  if (isTenantRoute && normalized === "platform_admin") {
    return res.status(403).json({
      success: false,
      code: "FORBIDDEN",
      message: "Forbidden: Platform Admin cannot access organization-specific SLA configuration",
    });
  }

  // Master SLA routes write methods (POST, PUT, PATCH, DELETE): only Platform Admin allowed
  const isMasterRoute = path.includes("master-policies") || path.includes("master-priorities") || path.includes("master");
  const isWrite = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);
  if (isMasterRoute && isWrite && normalized !== "platform_admin") {
    return res.status(403).json({
      success: false,
      code: "FORBIDDEN",
      message: "Forbidden: Only Platform Admin can modify global SLA policies",
    });
  }

  next();
};

// Gateway Incident Types Guard
const gatewayIncidentTypesGuard = (req, res, next) => {
  const role = req.user?.role || req.headers["x-user-role"];
  const normalized = normalizeGatewayRole(role);
  const path = req.originalUrl.toLowerCase();
  const isWrite = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);

  // Org incident types: Org Admin & Helpdesk Manager only
  if (path.includes("organization-incident-types") || path.includes("org-incident-types")) {
    if (!["org_admin", "helpdesk_manager", "service_manager"].includes(normalized)) {
      return res.status(403).json({
        success: false,
        code: "FORBIDDEN",
        message: `Forbidden: Role '${role || "unassigned"}' cannot configure organization incident types`,
      });
    }
  }

  // Master incident types and industries:
  if (path.includes("master-incident-types") || path.includes("industries")) {
    if (isWrite && normalized !== "platform_admin") {
      return res.status(403).json({
        success: false,
        code: "FORBIDDEN",
        message: "Forbidden: Only Platform Admin can modify global incident types and industries",
      });
    }
    // Public/guest read for industries catalog is permitted for signup
    if (!isWrite && path.includes("industries")) {
      return next();
    }
    if (!["platform_admin", "org_admin", "helpdesk_manager", "service_manager"].includes(normalized)) {
      return res.status(403).json({
        success: false,
        code: "FORBIDDEN",
        message: `Forbidden: Role '${role || "unassigned"}' cannot view global incident type settings`,
      });
    }
  }

  next();
};

// Gateway Team Guard: Platform Admin forbidden; write operations require org_admin/helpdesk_manager; read allowed for org_admin, helpdesk_manager, support_agent, customer
const gatewayTeamGuard = (req, res, next) => {
  const role = req.user?.role || req.headers["x-user-role"];
  const normalized = normalizeGatewayRole(role);

  if (normalized === "platform_admin") {
    return res.status(403).json({
      success: false,
      code: "FORBIDDEN",
      message: "Forbidden: Platform Admin cannot access organization-specific teams",
    });
  }

  const isWrite = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);
  if (isWrite && !["org_admin", "helpdesk_manager", "service_manager"].includes(normalized)) {
    return res.status(403).json({
      success: false,
      code: "FORBIDDEN",
      message: `Forbidden: Role '${role || "unassigned"}' cannot modify teams`,
    });
  }

  if (!["org_admin", "helpdesk_manager", "service_manager", "support_agent", "customer"].includes(normalized)) {
    return res.status(403).json({
      success: false,
      code: "FORBIDDEN",
      message: `Forbidden: Role '${role || "unassigned"}' cannot access teams`,
    });
  }

  next();
};

// Gateway Agent Guard: Platform Admin forbidden; write operations require org_admin/helpdesk_manager; read allowed for org_admin, helpdesk_manager, support_agent, customer
const gatewayAgentGuard = (req, res, next) => {
  const role = req.user?.role || req.headers["x-user-role"];
  const normalized = normalizeGatewayRole(role);

  if (normalized === "platform_admin") {
    return res.status(403).json({
      success: false,
      code: "FORBIDDEN",
      message: "Forbidden: Platform Admin cannot access organization-specific agents",
    });
  }

  const isWrite = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);
  if (isWrite && !["org_admin", "helpdesk_manager", "service_manager"].includes(normalized)) {
    return res.status(403).json({
      success: false,
      code: "FORBIDDEN",
      message: `Forbidden: Role '${role || "unassigned"}' cannot modify agents`,
    });
  }

  if (!["org_admin", "helpdesk_manager", "service_manager", "support_agent", "customer"].includes(normalized)) {
    return res.status(403).json({
      success: false,
      code: "FORBIDDEN",
      message: `Forbidden: Role '${role || "unassigned"}' cannot access agents`,
    });
  }

  next();
};


// -------------------------------------------------------------
// HRMS Microservices Routes
// -------------------------------------------------------------
app.use("/api/v1/platform",              ...protect, createProxy(services.PLATFORM));
app.use("/api/v1/organizations",         ...protect, createProxy(services.ORGANIZATION));
app.use("/api/v1/employees",             ...protect, createProxy(services.EMPLOYEE));
app.use("/api/v1/attendance",             ...protect, createProxy(services.ATTENDANCE_LEAVE));
app.use("/api/v1/attendance-settings",    ...protect, createProxy(services.ATTENDANCE_LEAVE));
app.use("/api/v1/timesheets",             ...protect, createProxy(services.ATTENDANCE_LEAVE));
app.use("/api/v1/leave-types",            ...protect, createProxy(services.ATTENDANCE_LEAVE));
app.use("/api/v1/leave-balances",         ...protect, createProxy(services.ATTENDANCE_LEAVE));
app.use("/api/v1/leave-requests",         ...protect, createProxy(services.ATTENDANCE_LEAVE));

// Public: device attendance (authenticated by device token inside attendance service)
app.use("/api/v1/device-attendance", stripTrustedHeaders, createProxy(services.ATTENDANCE_LEAVE));

// Gateway Service Manager Guard: Org Admin ONLY; forbidden for Service Manager, Agent, Customer, Platform Admin
const gatewayServiceManagerGuard = (req, res, next) => {
  const role = req.user?.role || req.headers["x-user-role"];
  const normalized = normalizeGatewayRole(role);

  if (normalized !== "org_admin") {
    return res.status(403).json({
      success: false,
      code: "FORBIDDEN",
      message: "Forbidden: Only Organization Administrator can manage Service Managers",
    });
  }

  next();
};

// Help Desk Microservices Routes (support both /api/v1/* and direct root paths)
app.use(["/api/v1/tickets", "/tickets"],                         ...protect, gatewayTicketGuard, createProxy(services.TICKET));
app.use(["/api/v1/teams", "/teams"],                             ...protect, gatewayTeamGuard, createProxy(services.TEAM));
app.use(["/api/v1/agents", "/agents"],                           ...protect, gatewayAgentGuard, createProxy(services.AGENT));
app.use(["/api/v1/service-managers", "/service-managers"],       ...protect, gatewayServiceManagerGuard, createProxy(services.AGENT));
app.use(["/api/v1/notifications", "/notifications"],             ...protect, createProxy(services.NOTIFICATION));
app.use(["/api/v1/sla", "/sla"],                                 ...protect, gatewaySlaGuard, createProxy(services.SLA));
app.use(["/api/v1/attachments", "/attachments"],                 ...protect, createProxy(services.ATTACHMENT));
app.use(["/api/v1/knowledge-base", "/knowledge-base"],           kbAuth, forbidGatewayRoles("platform_admin"), createProxy(services.KNOWLEDGE_BASE));
app.use(["/api/v1/industries", "/industries"],                   industryAuth, gatewayIncidentTypesGuard, createProxy(services.TICKET));
app.use(["/api/v1/incident-categories", "/incident-categories", "/api/v1/categories", "/categories", "/api/v1/incident-types", "/incident-types", "/api/v1/master-incident-types", "/master-incident-types", "/api/v1/organization-incident-types", "/organization-incident-types", "/api/v1/org-incident-types", "/org-incident-types"], ...protect, gatewayIncidentTypesGuard, createProxy(services.TICKET));

// 404 handler for unmatched routes
app.use((req, res) => {
  logger.warn({ method: req.method, url: req.originalUrl }, "Unmatched route on API Gateway");

  const isHtml = req.headers.accept && req.headers.accept.includes("text/html");
  const hint = isHtml && (req.originalUrl.startsWith("/login") || req.originalUrl.startsWith("/app") || req.originalUrl === "/")
    ? `The frontend UI runs on port 5173. Please navigate to http://localhost:5173${req.originalUrl}`
    : `Route '${req.method} ${req.originalUrl}' is not registered on the API Gateway. Backend API endpoints are prefixed with '/api/v1/...' (e.g. /api/v1/auth/login, /api/v1/tickets)`;

  res.status(404).json({
    success: false,
    service: "api-gateway",
    code: "ROUTE_NOT_FOUND",
    error: {
      code: "ROUTE_NOT_FOUND",
      message: `Route '${req.method} ${req.originalUrl}' not found`,
      details: {
        method: req.method,
        path: req.originalUrl,
        hint
      }
    },
    timestamp: new Date().toISOString()
  });
});

app.use(errorMiddleware);
module.exports = app;
