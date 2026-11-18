'use strict';

// The gateway verifies JWTs and forwards user context in request headers,
// together with a shared internal token that clients can never supply.
const { INTERNAL_SERVICE_TOKEN } = require('../config/env');

function readUser(req) {
  if (INTERNAL_SERVICE_TOKEN && req.headers['x-internal-token'] !== INTERNAL_SERVICE_TOKEN) return null;
  const userId = req.headers['x-user-id'];
  if (!userId) return null;
  return {
    userId,
    role: req.headers['x-user-role'] || '',
    email: req.headers['x-user-email'] || '',
    organizationId: req.headers['x-organization-id'] || null,
  };
}

const requirePlatformAdmin = (req, res, next) => {
  const user = readUser(req);
  if (!user) return res.status(401).json({ success: false, message: 'Unauthorized' });
  if (user.role !== 'super_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden: Platform Admin access required' });
  }
  req.user = user;
  next();
};

// Any authenticated user (used by self-service endpoints such as entitlements/me).
const requireAuth = (req, res, next) => {
  const user = readUser(req);
  if (!user) return res.status(401).json({ success: false, message: 'Unauthorized' });
  req.user = user;
  next();
};

const requireOrgContext = (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Unauthorized' });
  if (!req.user.organizationId) return res.status(403).json({ success: false, message: 'Missing organization context' });
  next();
};

module.exports = { requirePlatformAdmin, requireAuth, requireOrgContext };
