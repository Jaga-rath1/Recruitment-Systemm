'use strict';

const { INTERNAL_SERVICE_TOKEN } = require('../config/env');

// Identity comes from headers set by the gateway (after JWT verification) or
// by another backend service; the internal token proves that origin.
const requireAuth = (req, res, next) => {
  if (INTERNAL_SERVICE_TOKEN && req.headers['x-internal-token'] !== INTERNAL_SERVICE_TOKEN) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
  req.user = {
    userId,
    role:           req.headers['x-user-role']      || '',
    email:          req.headers['x-user-email']     || '',
    organizationId: req.headers['x-organization-id'] || null,
    isService:      !!req.headers['x-service-name'],
  };
  next();
};

const requireOrgContext = (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Unauthorized' });
  if (!req.user.organizationId) return res.status(403).json({ success: false, message: 'Missing organization context' });
  next();
};

// Notifications are produced by backend services (and organization admins),
// never by ordinary users on behalf of each other.
const requireNotifier = (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Unauthorized' });
  if (req.user.isService || ['super_admin', 'org_admin'].includes(req.user.role)) return next();
  return res.status(403).json({ success: false, message: 'Forbidden' });
};

module.exports = { requireAuth, requireOrgContext, requireNotifier };
