const { INTERNAL_SERVICE_TOKEN } = require("../config/env");

const normalizeGatewayRole = (role) => {
  if (!role) return "";
  const lower = String(role).toLowerCase().trim().replace(/[-\s]+/g, "_");
  if (
    lower === "super_admin" ||
    lower === "platform_admin" ||
    lower === "superadmin" ||
    lower === "platform"
  ) {
    return "platform_admin";
  }
  if (
    lower === "org_admin" ||
    lower === "organization_admin" ||
    lower === "admin"
  ) {
    return "org_admin";
  }
  if (
    lower === "service_manager" ||
    lower === "servicemanager"
  ) {
    return "service_manager";
  }
  if (
    lower === "manager" ||
    lower === "helpdesk_manager" ||
    lower === "team_lead" ||
    lower === "lead"
  ) {
    return "helpdesk_manager";
  }
  if (lower === "agent" || lower === "support_agent" || lower === "specialist") {
    return "support_agent";
  }
  if (
    lower === "employee" ||
    lower === "customer" ||
    lower === "requester" ||
    lower === "ticket_requester"
  ) {
    return "customer";
  }
  return lower;
};

const isServiceInternal = (req) => {
  return Boolean(req.isInternalService || req.user?.role === "service");
};

const requireGatewayRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (isServiceInternal(req)) {
      return next();
    }

    const rawRole = req.user?.role || req.headers["x-user-role"] || "";
    const role = normalizeGatewayRole(rawRole);

    if (!role || !allowedRoles.includes(role)) {
      return res.status(403).json({
        success: false,
        code: "FORBIDDEN",
        message: `Forbidden: Role '${rawRole || "unassigned"}' does not have permission for this resource`,
      });
    }

    next();
  };
};

const forbidGatewayRoles = (...forbiddenRoles) => {
  return (req, res, next) => {
    if (isServiceInternal(req)) {
      return next();
    }

    const rawRole = req.user?.role || req.headers["x-user-role"] || "";
    const role = normalizeGatewayRole(rawRole);

    if (forbiddenRoles.includes(role)) {
      return res.status(403).json({
        success: false,
        code: "FORBIDDEN",
        message: `Forbidden: Role '${rawRole || "unassigned"}' is restricted from accessing this resource`,
      });
    }

    next();
  };
};

module.exports = {
  normalizeGatewayRole,
  requireGatewayRoles,
  forbidGatewayRoles,
};
