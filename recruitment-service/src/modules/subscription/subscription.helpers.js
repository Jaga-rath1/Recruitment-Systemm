const { RECRUITMENT_PLANS } = require('./subscription.constants');

function resolvePlan(planCode) {
  const normalized = String(planCode || 'RECRUITMENT_ADVANCED').trim().toUpperCase();
  const direct = RECRUITMENT_PLANS[normalized];
  if (direct) return direct;

  const withPrefix = `RECRUITMENT_${normalized}`;
  if (RECRUITMENT_PLANS[withPrefix]) return RECRUITMENT_PLANS[withPrefix];

  return RECRUITMENT_PLANS.RECRUITMENT_ADVANCED;
}

function computeActivationStatus(subscription) {
  if (!subscription) return 'UNKNOWN';
  if (subscription.status === 'ACTIVE' || subscription.activatedAt) {
    return 'ACTIVATION_COMPLETED';
  }
  if (subscription.status === 'APPROVED') {
    if (subscription.activationExpiresAt && new Date(subscription.activationExpiresAt) < new Date()) {
      return 'INVITATION_EXPIRED';
    }
    return 'INVITATION_PENDING';
  }
  if (subscription.status === 'PENDING_VERIFICATION') {
    return 'PAYMENT_PENDING_VERIFICATION';
  }
  if (subscription.status === 'PENDING_PAYMENT') {
    return 'PAYMENT_PENDING';
  }
  if (subscription.status === 'REJECTED') {
    return 'PAYMENT_REJECTED';
  }
  if (subscription.status === 'TRIAL') {
    return 'TRIAL_ACTIVE';
  }
  return subscription.status;
}

function sanitizeSubscription(sub) {
  if (!sub) return null;
  const raw = typeof sub.toJSON === 'function' ? sub.toJSON() : sub;
  const { activationTokenHash: _hidden, ...safe } = raw;
  return {
    ...safe,
    activationStatus: computeActivationStatus(raw)
  };
}

module.exports = {
  resolvePlan,
  computeActivationStatus,
  sanitizeSubscription
};
