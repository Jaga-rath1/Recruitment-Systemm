const jwt = require("jsonwebtoken");
const { JWT_SECRET, INTERNAL_SERVICE_TOKEN } = require("../config/env");

// Headers that only the gateway (or a trusted service) may set. Anything a
// client sends under these names is discarded before proxying.
const TRUSTED_HEADERS = [
  "x-user-id",
  "x-user-role",
  "x-user-email",
  "x-user-name",
  "x-industry-id",
  "x-internal-token",
  "x-service-name",
];

const stripTrustedHeaders = (req, res, next) => {
  const internalToken = req.headers["x-internal-token"];
  if (INTERNAL_SERVICE_TOKEN && internalToken === INTERNAL_SERVICE_TOKEN) {
    // Preserve valid internal service token for service-to-service calls
    return next();
  }
  TRUSTED_HEADERS.forEach((h) => delete req.headers[h]);
  next();
};

const verifyToken = (req, res, next) => {
  const internalToken = req.headers["x-internal-token"];
  if (INTERNAL_SERVICE_TOKEN && internalToken === INTERNAL_SERVICE_TOKEN) {
    req.isInternalService = true;
    req.user = {
      userId: req.headers["x-user-id"] || "internal-service",
      role: req.headers["x-user-role"] || "service",
      email: req.headers["x-user-email"] || "service@nexnuv.internal",
      organizationId: req.headers["x-organization-id"] || req.headers["x-tenant-id"] || null,
    };
    return next();
  }

  TRUSTED_HEADERS.forEach((h) => delete req.headers[h]);

  const header = req.headers["authorization"];
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  let decoded;
  try {
    decoded = jwt.verify(header.split(" ")[1], JWT_SECRET);
  } catch {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }

  // Accounts on a temporary password may only use the auth routes until they set their own.
  if (decoded.mustChangePassword) {
    return res.status(403).json({
      success: false,
      code: "PASSWORD_CHANGE_REQUIRED",
      message: "You must change your temporary password before continuing",
    });
  }

  req.user = decoded;
  req.headers["x-user-id"] = decoded.userId;
  req.headers["x-user-role"] = decoded.role || "";
  req.headers["x-user-email"] = decoded.email || "";

  const userName =
    decoded.name ||
    [decoded.firstName, decoded.lastName].filter(Boolean).join(" ") ||
    decoded.email ||
    "";
  if (userName) {
    req.headers["x-user-name"] = userName;
  }

  const orgId = decoded.organizationId || "00000000-0000-0000-0000-000000000001";
  req.headers["x-organization-id"] = orgId;
  req.headers["x-tenant-id"] = orgId;

  if (decoded.industryId) {
    req.headers["x-industry-id"] = decoded.industryId;
  }

  if (INTERNAL_SERVICE_TOKEN) req.headers["x-internal-token"] = INTERNAL_SERVICE_TOKEN;
  next();
};

module.exports = { verifyToken, stripTrustedHeaders };
