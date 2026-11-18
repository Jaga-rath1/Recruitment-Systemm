const { normalizeGatewayRole } = require("./rbac");

// Organization / Tenant context always comes from the verified JWT or request headers.
const resolveOrganization = (req, res, next) => {
  const requested = req.headers["x-organization-id"] || req.headers["x-tenant-id"];
  delete req.headers["x-organization-id"];
  delete req.headers["x-tenant-id"];

  const role = normalizeGatewayRole(req.user && req.user.role);
  const isPlatformAdmin = role === "platform_admin";
  const orgId = isPlatformAdmin
    ? (requested || (req.user && req.user.organizationId) || "00000000-0000-0000-0000-000000000001")
    : ((req.user && req.user.organizationId) || requested || "00000000-0000-0000-0000-000000000001");

  if (orgId) {
    req.headers["x-organization-id"] = orgId;
    req.headers["x-tenant-id"] = orgId;
  }
  next();
};

module.exports = { resolveOrganization };
