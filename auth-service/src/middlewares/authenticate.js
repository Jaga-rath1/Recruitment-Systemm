'use strict';

const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');
const { User } = require('../models/index');
const Role = require('../modules/roles/roles.model');

/**
 * Verifies the bearer token and then the account behind it: a token issued
 * before the account was deactivated, or before its role or organization
 * changed, no longer authenticates. Role and organization on req.user come
 * from the database, not from the token.
 */
const authenticate = async (req, res, next) => {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  let claims;
  try {
    claims = jwt.verify(header.split(' ')[1], JWT_SECRET);
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }

  try {
    const user = await User.findByPk(claims.userId, { include: [{ model: Role, as: 'role', attributes: ['name'] }] });
    if (!user || user.status !== 'active') {
      return res.status(401).json({ success: false, message: 'This account is no longer active' });
    }
    const role = user.role ? user.role.name : null;
    const organizationId = user.organizationId || null;
    if (role !== claims.role || organizationId !== (claims.organizationId || null)) {
      return res.status(401).json({ success: false, message: 'Your access has changed. Please sign in again.' });
    }
    req.user = {
      userId: user.id,
      email: user.email,
      role,
      organizationId,
      mustChangePassword: !!user.mustChangePassword,
    };
    next();
  } catch (err) { next(err); }
};

module.exports = { authenticate };
