const env = require('../config/env');
const { getModels } = require('../config/database');
const organisationAdapter = require('../integrations/organisation/organisation.adapter');
const platformAdapter = require('../integrations/platform/platform.adapter');
const { ForbiddenError, UnauthorizedError } = require('../utils/AppError');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function requireTenant(req, _res, next) {
  try {
    if (!req.auth) {
      return next(new UnauthorizedError('Authentication required'));
    }

    const organisationId = req.auth.organisationId;
    if (!organisationId || !UUID_REGEX.test(organisationId)) {
      return next(
        new ForbiddenError('Valid tenant organisation context is required', 'TENANT_CONTEXT_MISSING')
      );
    }

    // Reject client-supplied cross-tenant header/param/body spoofing (supports UK & US spelling)
    const headerOrgId = req.headers['x-organisation-id'] || req.headers['x-organization-id'];
    if (headerOrgId && headerOrgId !== organisationId) {
      return next(new ForbiddenError('Cross-tenant header mismatch denied', 'CROSS_TENANT_DENIED'));
    }

    const paramOrgId = req.params.organisationId || req.params.organizationId;
    if (paramOrgId && paramOrgId !== organisationId) {
      return next(new ForbiddenError('Cross-tenant parameter access denied', 'CROSS_TENANT_DENIED'));
    }

    const bodyOrgId = req.body?.organisationId || req.body?.organizationId;
    if (bodyOrgId && bodyOrgId !== organisationId) {
      return next(new ForbiddenError('Cross-tenant payload organisation mismatch denied', 'CROSS_TENANT_DENIED'));
    }

    // Local subscription ledger check (blocks pending/rejected/suspended/expired local tenants)
    const { Subscription } = getModels();
    const activeSubscription = await Subscription.findOne({
      where: { organisationId },
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'status', 'expiresAt']
    });

    if (activeSubscription) {
      const isExpired = activeSubscription.expiresAt && new Date(activeSubscription.expiresAt) < new Date();
      const isTrial = activeSubscription.status === 'TRIAL';
      const isActive = activeSubscription.status === 'ACTIVE';

      if (isTrial && isExpired) {
        return next(
          new ForbiddenError(
            'Organisation 15-day free trial has expired. Please upgrade to a paid plan (Basic, Advanced, or Enterprise) to continue.',
            'TRIAL_EXPIRED'
          )
        );
      }

      if ((!isActive && !isTrial) || isExpired) {
        return next(
          new ForbiddenError(
            isExpired
              ? 'Organisation subscription has expired. Active subscription required.'
              : `Organisation subscription is ${activeSubscription.status}. Active subscription required.`,
            'SUBSCRIPTION_INACTIVE'
          )
        );
      }
    }

    // In live mode, verify live organisation activation status & platform entitlements
    if (env.integrationMode === 'live') {
      const org = await organisationAdapter.validateActiveOrganisation(organisationId, {
        actor: req.auth,
        requestId: req.requestId
      });
      await platformAdapter.checkOrganisationAccess(organisationId, {
        actor: req.auth,
        requestId: req.requestId
      });
      req.organisation = org;
    }

    req.tenantId = organisationId;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  requireTenant
};
