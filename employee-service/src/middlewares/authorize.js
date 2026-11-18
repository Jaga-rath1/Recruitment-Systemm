'use strict';

const { INTERNAL_SERVICE_TOKEN } = require('../config/env');

// Roles with organization-wide people access.
const ORG_WIDE_ROLES = ['super_admin', 'org_admin', 'hr'];

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
    role:           req.headers['x-user-role']         || '',
    email:          req.headers['x-user-email']        || '',
    organizationId: req.headers['x-organization-id']   || null,
    isService:      !!req.headers['x-service-name'],
  };
  next();
};

const requireOrgContext = (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Unauthorized' });
  if (!req.user.organizationId) {
    return res.status(403).json({ success: false, message: 'Missing organization context' });
  }
  next();
};

// org_admin or HR (or platform admin acting for an organization)
const requireHrOrAdmin = (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Unauthorized' });
  if (!ORG_WIDE_ROLES.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Forbidden: HR or Organization Admin access required' });
  }
  next();
};

const requireManagerOrAbove = (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Unauthorized' });
  if (![...ORG_WIDE_ROLES, 'manager'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Forbidden: Manager or above required' });
  }
  next();
};

module.exports = { requireAuth, requireOrgContext, requireHrOrAdmin, requireManagerOrAbove, ORG_WIDE_ROLES };
