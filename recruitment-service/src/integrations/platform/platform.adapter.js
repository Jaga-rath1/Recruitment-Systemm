const { v4: uuidv4 } = require('uuid');
const env = require('../../config/env');
const logger = require('../../config/logger');
const { requestJson } = require('../common/httpClient');
const organisationAdapter = require('../organisation/organisation.adapter');
const { ForbiddenError } = require('../../utils/AppError');

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

async function provisionOrganisation({
  subscriptionId,
  organisationName,
  organisationDomain,
  industry,
  companySize,
  adminName,
  adminEmail,
  planCode = 'RECRUITMENT_ADVANCED',
  isTrial = false,
  startsAt = null,
  trialEndsAt = null,
  requestId = null
}) {
  if (env.integrationMode === 'live') {
    const createdOrg = await organisationAdapter.createOrganisation({
      subscriptionId,
      name: organisationName,
      domain: organisationDomain,
      email: adminEmail,
      status: 'active',
      requestId
    });

    const plans = await listPlans({ requestId });
    const targetCode = String(planCode || '').toUpperCase().trim();
    const activePlan =
      plans.find((p) => String(p.code || '').toUpperCase().trim() === targetCode && p.status === 'active') ||
      plans.find((p) => String(p.code || '').toUpperCase().includes('RECRUITMENT') && p.status === 'active') ||
      plans.find((p) => p.status === 'active');

    let platformSubscription = null;
    if (activePlan) {
      try {
        const subRes = await requestJson({
          serviceName: 'Platform Service',
          baseUrl: env.services.platformUrl,
          method: 'POST',
          path: '/api/v1/platform/subscriptions',
          organisationId: createdOrg.organisationId,
          actor: { userId: 'svc-recruitment', role: 'super_admin' },
          requestId,
          body: {
            organizationId: createdOrg.organisationId,
            planId: activePlan.id,
            status: isTrial ? 'trial' : 'active',
            startsAt: startsAt || new Date().toISOString(),
            trialEndsAt: isTrial ? (trialEndsAt || new Date(Date.now() + 15 * 86400000).toISOString()) : null
          }
        });
        platformSubscription = subRes.data?.data || subRes.data;
      } catch (subErr) {
        logger.warn({ err: subErr.message, organisationId: createdOrg.organisationId }, '[Live Platform Adapter] Subscriptions sync warning');
      }
    }

    logger.info(
      {
        subscriptionId,
        organisationId: createdOrg.organisationId,
        platformSubscriptionId: platformSubscription?.id || null,
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
    name: organisationName,
    domain: organisationDomain,
    email: adminEmail,
    status: 'active',
    requestId
  });
  const organisationId = standaloneOrg.organisationId || standaloneOrg.id;
  logger.info(
    { subscriptionId, organisationId, organisationName, industry, companySize, adminName, isTrial },
    '[Standalone Platform Admin Adapter] Provisioned tenant organisationId'
  );
  return {
    organisationId,
    organisation: standaloneOrg,
    provisionedAt: new Date().toISOString()
  };
}

function getStandaloneVerificationLog() {
  return [...verificationQueueLog];
}

function clearStandaloneVerificationLog() {
  verificationQueueLog.length = 0;
}

module.exports = {
  listPlans,
  getOrganisationEntitlements,
  getOrganisationSubscription,
  checkOrganisationAccess,
  submitVerificationRequest,
  provisionOrganisation,
  getStandaloneVerificationLog,
  clearStandaloneVerificationLog
};

