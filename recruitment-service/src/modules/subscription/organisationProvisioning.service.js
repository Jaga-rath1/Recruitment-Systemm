const { withTransaction, getModels } = require('../../config/database');
const logger = require('../../config/logger');
const platformAdapter = require('../../integrations/platform/platform.adapter');
const organisationAdapter = require('../../integrations/organisation/organisation.adapter');
const auditService = require('../audit/audit.service');

/**
 * Handles external tenant organisation provisioning with safe failure state recording and atomic idempotency.
 */
async function provisionTenantOrganisation(sub, context = {}) {
  const { Subscription } = getModels();
  const adminActorId = context.actorUserId || null;

  let provisionedOrgId = sub.organisationId;

  if (!provisionedOrgId) {
    try {
      const provisioned = await platformAdapter.provisionOrganisation({
        subscriptionId: sub.id,
        organisationName: sub.organisationName,
        organisationDomain: sub.organisationDomain,
        industry: sub.industry,
        companySize: sub.companySize,
        adminName: sub.adminName,
        adminEmail: sub.adminEmail,
        planCode: sub.planCode,
        isTrial: false,
        requestId: context.requestId
      });
      provisionedOrgId = provisioned.organisationId;
    } catch (provErr) {
      await withTransaction(async (errTx) => {
        await Subscription.update(
          {
            provisioningStatus: 'FAILED',
            provisioningError: provErr.message
          },
          { where: { id: sub.id }, transaction: errTx }
        );

        await auditService.recordAudit(
          {
            actorUserId: adminActorId,
            actorRole: 'PLATFORM_ADMIN',
            entityType: 'SUBSCRIPTION',
            entityId: sub.id,
            action: 'ORGANISATION_PROVISIONING_FAILED',
            requestId: context.requestId,
            afterState: { provisioningStatus: 'FAILED', error: provErr.message }
          },
          errTx
        );
      });

      logger.error(
        { subscriptionId: sub.id, err: provErr.message },
        'External organisation provisioning failed; recorded failure state for safe recovery'
      );
      throw provErr;
    }
  }

  organisationAdapter.seedOrganisationProfile(provisionedOrgId, {
    name: sub.organisationName,
    domain: sub.organisationDomain,
    industry: sub.industry,
    companySize: sub.companySize,
    status: 'PROVISIONED'
  });

  return provisionedOrgId;
}

module.exports = {
  provisionTenantOrganisation
};
