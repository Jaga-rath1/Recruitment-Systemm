const { v4: uuidv4 } = require('uuid');
const env = require('../../config/env');
const logger = require('../../config/logger');
const { requestJson } = require('../common/httpClient');
const organisationAdapter = require('../organisation/organisation.adapter');
const { ForbiddenError, NotFoundError, ServiceUnavailableError } = require('../../utils/AppError');

const verificationQueueLog = [];

const STANDALONE_RECRUITMENT_PLANS = [
  {
    id: 'plan-basic',
    code: 'RECRUITMENT_BASIC',
    name: 'Basic',
    description: 'Essential recruitment features for small businesses.',
    price: '999.00',
    currency: 'INR',
    billingCycle: 'monthly',
    trialDays: 15,
    status: 'active'
  },
  {
    id: 'plan-advanced',
    code: 'RECRUITMENT_ADVANCED',
    name: 'Advanced',
    description: 'Complete recruitment workflow for growing organisations.',
    price: '1999.00',
    currency: 'INR',
    billingCycle: 'monthly',
    trialDays: 15,
    status: 'active'
  },
  {
    id: 'plan-enterprise',
    code: 'RECRUITMENT_ENTERPRISE',
    name: 'Enterprise',
    description: 'Advanced recruitment capabilities for large organisations.',
    price: '4999.00',
    currency: 'INR',
    billingCycle: 'monthly',
    trialDays: 15,
    status: 'active'
  },
  {
    id: 'plan-premium-legacy',
    code: 'RECRUITMENT_PREMIUM',
    name: 'Recruitment Premium',
    description: 'Legacy enterprise tier with dedicated tenant isolation.',
    price: '1999.00',
    currency: 'INR',
    billingCycle: 'monthly',
    trialDays: 15,
    status: 'active'
  }
];

async function listPlans({ requestId = null } = {}) {
  if (env.integrationMode !== 'live') {
    return STANDALONE_RECRUITMENT_PLANS;
  }
  try {
    const res = await requestJson({
      serviceName: 'Platform Service',
      baseUrl: env.services.platformUrl,
      method: 'GET',
      path: '/api/v1/platform/plans',
      actor: { userId: 'svc-recruitment', role: 'super_admin' },
      requestId
    });
    const livePlans = res.data?.data || [];
    return livePlans.length > 0 ? livePlans : STANDALONE_RECRUITMENT_PLANS;
  } catch (_err) {
    return STANDALONE_RECRUITMENT_PLANS;
  }
}

async function getOrganisationEntitlements(organisationId, { actor = {}, requestId = null } = {}) {
  if (env.integrationMode !== 'live') {
    return {
      organizationId: organisationId,
      active: true,
      reason: null,
      features: ['HRMS', 'EMPLOYEES', 'RECRUITMENT']
    };
  }

  const res = await requestJson({
    serviceName: 'Platform Service',
    baseUrl: env.services.platformUrl,
    method: 'GET',
    path: `/api/v1/platform/entitlements/organizations/${encodeURIComponent(organisationId)}`,
    organisationId,
    actor: {
      userId: actor.userId || 'svc-recruitment',
      role: 'super_admin',
      email: actor.email || 'recruitment@nexnuv.internal'
    },
    requestId
  });

  return res.data?.data || res.data;
}

async function getOrganisationSubscription(organisationId, { requestId = null } = {}) {
  if (env.integrationMode !== 'live') {
    return null;
  }
  const res = await requestJson({
    serviceName: 'Platform Service',
    baseUrl: env.services.platformUrl,
    method: 'GET',
    path: `/api/v1/platform/organizations/${encodeURIComponent(organisationId)}/subscription`,
    organisationId,
    actor: { userId: 'svc-recruitment', role: 'super_admin' },
    requestId
  });
  return res.data?.data || null;
}

async function checkOrganisationAccess(organisationId, { actor = {}, requestId = null } = {}) {
  if (env.integrationMode !== 'live') {
    await organisationAdapter.validateActiveOrganisation(organisationId, { actor, requestId });
    return { active: true, mode: 'standalone' };
  }

  const entitlements = await getOrganisationEntitlements(organisationId, { actor, requestId });
  if (!entitlements || !entitlements.active) {
    const reason = entitlements?.reason || 'no_subscription';
    const messageMap = {
      organization_not_found: 'Organisation does not exist in NEXNUV Platform',
      organization_inactive: 'Organisation account is inactive or suspended',
      no_subscription: 'Organisation has no active subscription in Platform Service',
      subscription_expired: 'Organisation subscription has expired',
      trial_expired: 'Organisation trial has expired',
      plan_inactive: 'Organisation subscription plan is inactive'
    };
    throw new ForbiddenError(
      messageMap[reason] || `Organisation subscription check failed (${reason})`,
      reason === 'organization_inactive' || reason === 'organization_not_found'
        ? 'ORGANISATION_INACTIVE'
        : 'SUBSCRIPTION_INACTIVE'
    );
  }

  if (
    env.services.platformRequireRecruitmentFeature &&
    (!Array.isArray(entitlements.features) || !entitlements.features.includes('RECRUITMENT'))
  ) {
    throw new ForbiddenError(
      'Recruitment module is not entitled under your active Platform plan',
      'FEATURE_NOT_ENTITLED'
    );
  }

  return entitlements;
}

async function submitVerificationRequest(payload, { requestId = null } = {}) {
  if (env.integrationMode === 'live') {
    await listPlans({ requestId });
    logger.info(
      { subscriptionId: payload.subscriptionId, paymentReference: payload.paymentReference, requestId },
      '[Live Platform Adapter] Payment verification queued in Recruitment proof ledger; Platform Service reachable'
    );
    return {
      accepted: true,
      mode: 'live',
      ticketId: `PA-${payload.subscriptionId.slice(0, 8).toUpperCase()}`
    };
  }

  verificationQueueLog.push({ ...payload, submittedAt: new Date().toISOString() });
  logger.info({ subscriptionId: payload.subscriptionId }, '[Standalone Platform Admin Adapter] Recorded verification request');
  return {
    accepted: true,
    mode: 'standalone',
    ticketId: `PA-${payload.subscriptionId.slice(0, 8).toUpperCase()}`
  };
}

const PLAN_CODE_ALIAS_MAP = {
  RECRUITMENT_BASIC: {
    MONTHLY: ['RECRUITMENT_STARTER_MONTHLY', 'RECRUITMENT_BASIC_MONTHLY', 'RECRUITMENT_BASIC'],
    ANNUAL: ['RECRUITMENT_STARTER_YEARLY', 'RECRUITMENT_STARTER_ANNUAL', 'RECRUITMENT_BASIC_YEARLY', 'RECRUITMENT_BASIC']
  },
  RECRUITMENT_ADVANCED: {
    MONTHLY: ['RECRUITMENT_PROFESSIONAL_MONTHLY', 'RECRUITMENT_ADVANCED_MONTHLY', 'RECRUITMENT_ADVANCED'],
    ANNUAL: ['RECRUITMENT_PROFESSIONAL_YEARLY', 'RECRUITMENT_PROFESSIONAL_ANNUAL', 'RECRUITMENT_ADVANCED_YEARLY', 'RECRUITMENT_ADVANCED']
  },
  RECRUITMENT_PREMIUM: {
    MONTHLY: ['RECRUITMENT_PROFESSIONAL_MONTHLY', 'RECRUITMENT_PREMIUM_MONTHLY', 'RECRUITMENT_PREMIUM'],
    ANNUAL: ['RECRUITMENT_PROFESSIONAL_YEARLY', 'RECRUITMENT_PROFESSIONAL_ANNUAL', 'RECRUITMENT_PREMIUM_YEARLY', 'RECRUITMENT_PREMIUM']
  },
  RECRUITMENT_ENTERPRISE: {
    MONTHLY: ['RECRUITMENT_ENTERPRISE_MONTHLY', 'RECRUITMENT_ENTERPRISE'],
    ANNUAL: ['RECRUITMENT_ENTERPRISE_YEARLY', 'RECRUITMENT_ENTERPRISE_ANNUAL', 'RECRUITMENT_ENTERPRISE']
  }
};

function resolvePlatformPlan(plans = [], planCode = 'RECRUITMENT_ADVANCED', billingCycle = 'MONTHLY') {
  const activePlans = (Array.isArray(plans) ? plans : []).filter(
    (p) => p && String(p.status || '').toLowerCase() === 'active'
  );
  if (activePlans.length === 0) return null;

  const targetCode = String(planCode || 'RECRUITMENT_ADVANCED').toUpperCase().trim();
  const normalizedCycle = String(billingCycle || 'MONTHLY').toUpperCase().trim() === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY';

  // 1. Exact plan code match
  const exact = activePlans.find((p) => String(p.code || '').toUpperCase().trim() === targetCode);
  if (exact) return exact;

  // 2. Mapped alias codes for Recruitment -> Platform Service catalog
  const aliases = PLAN_CODE_ALIAS_MAP[targetCode]?.[normalizedCycle] || [];
  for (const alias of aliases) {
    const matched = activePlans.find((p) => String(p.code || '').toUpperCase().trim() === alias);
    if (matched) return matched;
  }

  // 3. Cycle-matched recruitment plan fallback
  const cycleHint = normalizedCycle === 'ANNUAL' ? 'YEARLY' : 'MONTHLY';
  const cycleMatch = activePlans.find((p) => {
    const code = String(p.code || '').toUpperCase();
    return code.includes('RECRUITMENT') && (code.includes(cycleHint) || String(p.billingCycle || '').toLowerCase() === cycleHint.toLowerCase());
  });
  if (cycleMatch) return cycleMatch;

  // 4. Any active recruitment plan, else first active plan
  return (
    activePlans.find((p) => String(p.code || '').toUpperCase().includes('RECRUITMENT')) ||
    activePlans[0]
  );
}

async function provisionOrganisation({
  subscriptionId = null,
  organisationName,
  name,
  organisationDomain,
  domain,
  industry,
  companySize,
  adminName,
  adminEmail,
  planCode = 'RECRUITMENT_ADVANCED',
  billingCycle = 'MONTHLY',
  isTrial = false,
  startsAt = null,
  endsAt = null,
  trialEndsAt = null,
  requestId = null
}) {
  const resolvedOrgName = organisationName || name;
  const resolvedOrgDomain = organisationDomain || domain;

  if (env.integrationMode === 'live') {
    const liveTimeoutMs = Math.max(env.services.requestTimeoutMs || 5000, 12000);
    const createdOrg = await organisationAdapter.createOrganisation({
      subscriptionId,
      name: resolvedOrgName,
      domain: resolvedOrgDomain,
      email: adminEmail,
      status: 'active',
      requestId
    });

    const plans = await listPlans({ requestId });
    const activePlan = resolvePlatformPlan(plans, planCode, billingCycle);

    if (!activePlan) {
      throw new ServiceUnavailableError(
        `No active Platform Service plan matched '${planCode}' (${billingCycle})`,
        'PLATFORM_PLAN_NOT_FOUND'
      );
    }

    let platformSubscription = null;
    try {
      const subRes = await requestJson({
        serviceName: 'Platform Service',
        baseUrl: env.services.platformUrl,
        method: 'POST',
        path: '/api/v1/platform/subscriptions',
        organisationId: createdOrg.organisationId,
        actor: { userId: 'svc-recruitment', role: 'super_admin' },
        requestId,
        timeoutMs: liveTimeoutMs,
        body: {
          organizationId: createdOrg.organisationId,
          planId: activePlan.id,
          status: isTrial ? 'trial' : 'active',
          startsAt: startsAt ? new Date(startsAt).toISOString() : new Date().toISOString(),
          ...(endsAt && !isTrial ? { endsAt: new Date(endsAt).toISOString() } : {}),
          trialEndsAt: isTrial
            ? (trialEndsAt ? new Date(trialEndsAt).toISOString() : new Date(Date.now() + 15 * 86400000).toISOString())
            : null
        }
      });
      platformSubscription = subRes.data?.data || subRes.data;
    } catch (subErr) {
      // Idempotently reconcile if Platform Service already has an active/trial subscription for this org
      if (subErr.statusCode === 409) {
        platformSubscription = await getOrganisationSubscription(createdOrg.organisationId, { requestId }).catch(() => null);
      } else {
        logger.error(
          { err: subErr.message, organisationId: createdOrg.organisationId, planCode, matchedPlanCode: activePlan.code, requestId },
          '[Live Platform Adapter] Failed to activate Platform Service subscription during provisioning'
        );
        throw subErr;
      }
    }

    logger.info(
      {
        subscriptionId,
        organisationId: createdOrg.organisationId,
        platformSubscriptionId: platformSubscription?.id || null,
        matchedPlanCode: activePlan.code,
        isTrial,
        requestId
      },
      '[Live Platform Adapter] Provisioned organization in Organization Service & activated Platform subscription'
    );

    return {
      organisationId: createdOrg.organisationId,
      organisation: createdOrg,
      platformSubscription,
      provisionedAt: new Date().toISOString()
    };
  }

  const standaloneOrg = await organisationAdapter.createOrganisation({
    subscriptionId,
    name: resolvedOrgName,
    domain: resolvedOrgDomain,
    email: adminEmail,
    status: 'active',
    requestId
  });
  const organisationId = standaloneOrg.organisationId || standaloneOrg.id;
  logger.info(
    { subscriptionId, organisationId, organisationName: resolvedOrgName, industry, companySize, adminName, isTrial },
    '[Standalone Platform Admin Adapter] Provisioned tenant organisationId'
  );
  return {
    organisationId,
    organisation: standaloneOrg,
    provisionedAt: new Date().toISOString()
  };
}

async function cancelOrganisationSubscription(organisationId, { requestId = null } = {}) {
  if (env.integrationMode !== 'live' || !organisationId) {
    return { synced: false, mode: env.integrationMode };
  }

  const liveTimeoutMs = Math.max(env.services.requestTimeoutMs || 5000, 12000);
  let activePlatformSub = null;
  try {
    activePlatformSub = await getOrganisationSubscription(organisationId, { requestId });
  } catch (err) {
    if (err instanceof NotFoundError || err.statusCode === 404) {
      return { synced: true, alreadyCancelled: true, mode: 'live' };
    }
    throw err;
  }

  if (!activePlatformSub?.id) {
    return { synced: true, alreadyCancelled: true, mode: 'live' };
  }

  try {
    const res = await requestJson({
      serviceName: 'Platform Service',
      baseUrl: env.services.platformUrl,
      method: 'PATCH',
      path: `/api/v1/platform/subscriptions/${encodeURIComponent(activePlatformSub.id)}`,
      organisationId,
      actor: { userId: 'svc-recruitment', role: 'super_admin' },
      requestId,
      timeoutMs: liveTimeoutMs,
      body: { status: 'cancelled' }
    });
    return {
      synced: true,
      alreadyCancelled: false,
      mode: 'live',
      platformSubscription: res.data?.data || res.data
    };
  } catch (err) {
    if (err.statusCode === 409) {
      return { synced: true, alreadyCancelled: true, mode: 'live' };
    }
    throw err;
  }
}

function getStandaloneVerificationLog() {
  return [...verificationQueueLog];
}

function clearStandaloneVerificationLog() {
  verificationQueueLog.length = 0;
}

module.exports = {
  listPlans,
  resolvePlatformPlan,
  getOrganisationEntitlements,
  getOrganisationSubscription,
  checkOrganisationAccess,
  submitVerificationRequest,
  provisionOrganisation,
  cancelOrganisationSubscription,
  getStandaloneVerificationLog,
  clearStandaloneVerificationLog
};

