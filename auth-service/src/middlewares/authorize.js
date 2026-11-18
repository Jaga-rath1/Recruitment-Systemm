'use strict';

const { INTERNAL_SERVICE_TOKEN } = require('../config/env');

const authorize = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  if (req.user.mustChangePassword) {
    return res.status(403).json({
      success: false,
      code: 'PASSWORD_CHANGE_REQUIRED',
      message: 'You must change your temporary password before continuing',
    });
  }
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  next();
};

// Service-to-service routes. The gateway strips x-internal-token from every
// client request, so only another backend service can present it.
const requireInternal = (req, res, next) => {
  if (!INTERNAL_SERVICE_TOKEN || req.headers['x-internal-token'] !== INTERNAL_SERVICE_TOKEN) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  next();
};

module.exports = { authorize, requireInternal };
