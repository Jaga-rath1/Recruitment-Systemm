'use strict';

const { INTERNAL_SERVICE_TOKEN } = require('../config/env');

// Populates req.user from gateway-forwarded headers. Must be first in chain.
// The internal token proves the headers were set by the gateway or a service.
const requireAuth = (req, res, next) => {
  if (INTERNAL_SERVICE_TOKEN && req.headers['x-internal-token'] !== INTERNAL_SERVICE_TOKEN) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
  req.user = {
    userId,
    role: req.headers['x-user-role'] || '',
    email: req.headers['x-user-email'] || '',
    organizationId: req.headers['x-organization-id'] || null,
  };
  next();
};

// Only super_admin
const requireSuperAdmin = (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Unauthorized' });
  if (req.user.role !== 'super_admin') return res.status(403).json({ success: false, message: 'Forbidden: Super Admin access required' });
  next();
};

// super_admin or org_admin
const requireOrgAdmin = (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Unauthorized' });
  if (!['super_admin', 'org_admin'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Forbidden: Organization Admin access required' });
  }
  next();
};

// Enforces tenant isolation: a user can only reach their own organization.
// super_admin bypasses. Uses req.params.organizationId (for sub-resource routes)
// or req.params.id (for organization routes).
const requireOrgIsolation = (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Unauthorized' });
  if (req.user.role === 'super_admin') return next();
  const paramOrgId = req.params.organizationId || req.params.id;
  if (!paramOrgId) return next();
  if (!req.user.organizationId) {
    return res.status(403).json({ success: false, message: 'No organization context in token' });
  }
  if (req.user.organizationId !== paramOrgId) {
    return res.status(403).json({ success: false, message: 'Access denied to this organization' });
  }
  next();
};

// A deactivated organization is closed to its own users; the platform admin
// (and backend services acting for it) can still reach it to reactivate it.
const requireActiveOrganization = async (req, res, next) => {
  if (req.user.role === 'super_admin') return next();
  try {
    const Organization = require('../modules/organizations/organizations.model');
    const org = await Organization.findByPk(req.params.organizationId || req.params.id, { attributes: ['status'] });
    if (org && org.status !== 'active') {
      return res.status(403).json({
        success: false,
        code: 'ORGANIZATION_INACTIVE',
        message: 'Your organization has been deactivated',
      });
    }
    next();
  } catch (err) { next(err); }
};

// Every member of an organization may read its structure (names of branches,
// departments, shifts, holidays…); only its admins may change it.
const readAccess = [requireAuth, requireOrgIsolation, requireActiveOrganization];
const writeAccess = [requireAuth, requireOrgAdmin, requireOrgIsolation, requireActiveOrganization];
// The organization's own record stays readable so its users can be told why they are locked out.
const profileReadAccess = [requireAuth, requireOrgIsolation];

module.exports = {
  requireAuth, requireSuperAdmin, requireOrgAdmin, requireOrgIsolation, requireActiveOrganization,
  readAccess, writeAccess, profileReadAccess,
};
