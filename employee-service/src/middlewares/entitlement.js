'use strict';
const { getEntitlements } = require('../clients/platformClient');

const { ENTITLEMENT_CACHE_TTL_MS: CACHE_TTL_MS } = require('../config/env');
// When platform-service cannot answer, the last known answer is reused for this long.
const STALE_TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // organizationId -> { at, active, reason, features }

const REASONS = {
  organization_inactive: 'Your organization has been deactivated',
  no_subscription: 'Your organization has no active subscription',
  subscription_expired: 'Your organization\'s subscription has expired',
  trial_expired: 'Your organization\'s trial has ended',
  plan_inactive: 'Your organization\'s plan is no longer available',
};

async function resolve(user) {
  const hit = cache.get(user.organizationId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit;
  const ent = await getEntitlements(user);
  if (!ent) return hit && Date.now() - hit.at < STALE_TTL_MS ? hit : null;
  const entry = { at: Date.now(), active: !!ent.active, reason: ent.reason, features: new Set(ent.features || []) };
  cache.set(user.organizationId, entry);
  return entry;
}

/**
 * Blocks the request unless the caller's organization is entitled to `feature`
 * (a module/submodule code from the platform catalog). Platform admins and
 * service-to-service calls are not tenant users and pass through.
 */
const requireFeature = (feature) => async (req, res, next) => {
  try {
    if (req.user.role === 'super_admin' || req.user.isService) return next();
    const ent = await resolve(req.user);
    if (!ent) {
      return res.status(503).json({ success: false, message: 'Could not verify your subscription. Please try again shortly.' });
    }
    if (!ent.active) {
      return res.status(403).json({
        success: false,
        code: 'SUBSCRIPTION_INACTIVE',
        message: REASONS[ent.reason] || 'Your organization does not have an active subscription',
      });
    }
    if (!ent.features.has(feature)) {
      return res.status(403).json({
        success: false,
        code: 'FEATURE_NOT_ENTITLED',
        message: 'This feature is not included in your organization\'s plan',
      });
    }
    next();
  } catch (err) { next(err); }
};

module.exports = { requireFeature };
