const { Op, Sequelize } = require('sequelize');
const { getModels, withTransaction } = require('../../config/database');
const auditService = require('../audit/audit.service');
const organisationAdapter = require('../../integrations/organisation/organisation.adapter');
const { normalizeEmail } = require('../../utils/validationHelpers');
const { ForbiddenError, NotFoundError, UnauthorizedError } = require('../../utils/AppError');

const GENERIC_CLAIM_REJECTION_MESSAGE =
  'No eligible unclaimed application was found for your verified email in the specified organisation.';

async function writeClaimAudit({
  organisationId,
  actorUserId,
  entityId,
  action,
  context = {},
  beforeState = null,
  afterState = null,
  transaction = null
}) {
  try {
    await auditService.recordAudit(
      {
        organisationId: organisationId || null,
        actorUserId: actorUserId || null,
        actorRole: 'CANDIDATE',
        entityType: 'CANDIDATE',
        entityId: entityId || 'unmatched',
        action,
        requestId: context.requestId || null,
        ipAddress: context.ipAddress || null,
        userAgent: context.userAgent || null,
        beforeState,
        afterState
      },
      transaction
    );
  } catch {
    // Non-fatal fallback; caller transaction behavior preserved.
  }
}

/**
 * Explicitly claim unclaimed anonymous applications for the authenticated verified candidate.
 * Scoped strictly to organisationId + normalized verified email + authUserId IS NULL.
 */
async function claimCandidateApplications({
  auth,
  organisationId,
  applicationReference = null,
  requestId = null,
  ipAddress = null,
  userAgent = null
}) {
  if (!auth || auth.userType !== 'CANDIDATE' || !auth.userId) {
    throw new ForbiddenError('Only authenticated candidate accounts may claim applications');
  }

  const { CandidateAccount, Candidate, Application } = getModels();
  const account = await CandidateAccount.findByPk(auth.userId, {
    attributes: ['id', 'email', 'isActive', 'emailVerified']
  });

  if (!account || !account.isActive) {
    throw new UnauthorizedError('Candidate account is inactive or no longer exists');
  }
  if (!account.emailVerified) {
    await writeClaimAudit({
      organisationId,
      actorUserId: auth.userId,
      entityId: auth.userId,
      action: 'APPLICATION_CLAIM_REJECTED',
      context: { requestId, ipAddress, userAgent },
      afterState: { reason: 'EMAIL_NOT_VERIFIED' }
    });
    throw new ForbiddenError(
      'You must verify your email address before claiming existing applications',
      'EMAIL_NOT_VERIFIED'
    );
  }

  const verifiedEmail = normalizeEmail(account.email);
  const cleanRef = applicationReference ? String(applicationReference).trim() : null;
  const now = new Date();
  let rejectedAuditPayload = null;
  let claimedSummary;

  try {
    claimedSummary = await withTransaction(async (tx) => {
      const candidate = await Candidate.findOne({
        where: {
          organisationId,
          [Op.and]: [Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('email')), verifiedEmail)]
        },
        transaction: tx
      });

      if (!candidate) {
        rejectedAuditPayload = {
          organisationId,
          actorUserId: auth.userId,
          entityId: null,
          action: 'APPLICATION_CLAIM_REJECTED',
          context: { requestId, ipAddress, userAgent },
          afterState: { reason: 'NO_MATCHING_CANDIDATE' }
        };
        throw new NotFoundError(GENERIC_CLAIM_REJECTION_MESSAGE, 'CLAIM_NOT_ELIGIBLE');
      }

      if (candidate.authUserId) {
        rejectedAuditPayload = {
          organisationId,
          actorUserId: auth.userId,
          entityId: candidate.id,
          action: 'APPLICATION_CLAIM_REJECTED',
          context: { requestId, ipAddress, userAgent },
          afterState: { reason: 'ALREADY_CLAIMED' }
        };
        throw new NotFoundError(GENERIC_CLAIM_REJECTION_MESSAGE, 'CLAIM_NOT_ELIGIBLE');
      }

      const matchingApplications = await Application.findAll({
        where: {
          organisationId,
          candidateId: candidate.id,
          ...(cleanRef ? { applicationReference: cleanRef } : {})
        },
        attributes: ['id', 'applicationReference', 'currentStage'],
        transaction: tx
      });

      if (!matchingApplications || matchingApplications.length === 0) {
        rejectedAuditPayload = {
          organisationId,
          actorUserId: auth.userId,
          entityId: candidate.id,
          action: 'APPLICATION_CLAIM_REJECTED',
          context: { requestId, ipAddress, userAgent },
          afterState: { reason: 'APPLICATION_REFERENCE_MISMATCH' }
        };
        throw new NotFoundError(GENERIC_CLAIM_REJECTION_MESSAGE, 'CLAIM_NOT_ELIGIBLE');
      }

      // Conditional atomic claim guard: prevents race conditions and overwrites when auth_user_id is already set.
      const [affectedCount] = await Candidate.update(
        {
          authUserId: account.id,
          claimedAt: now
        },
        {
          where: {
            id: candidate.id,
            organisationId,
            authUserId: null,
            [Op.and]: [Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('email')), verifiedEmail)]
          },
          transaction: tx
        }
      );

      if (affectedCount !== 1) {
        rejectedAuditPayload = {
          organisationId,
          actorUserId: auth.userId,
          entityId: candidate.id,
          action: 'APPLICATION_CLAIM_REJECTED',
          context: { requestId, ipAddress, userAgent },
          afterState: { reason: 'CONCURRENT_CLAIM_LOST' }
        };
        throw new NotFoundError(GENERIC_CLAIM_REJECTION_MESSAGE, 'CLAIM_NOT_ELIGIBLE');
      }

      await writeClaimAudit({
        organisationId,
        actorUserId: auth.userId,
        entityId: candidate.id,
        action: 'APPLICATION_CLAIM_SUCCEEDED',
        context: { requestId, ipAddress, userAgent },
        beforeState: { authUserId: null },
        afterState: {
          claimedAt: now.toISOString(),
          claimedApplicationCount: matchingApplications.length,
          applicationReferenceProvided: Boolean(cleanRef)
        },
        transaction: tx
      });

      return {
        candidateId: candidate.id,
        organisationId,
        claimedAt: now.toISOString(),
        claimedApplications: matchingApplications.map((app) => ({
          id: app.id,
          applicationReference: app.applicationReference,
          currentStage: app.currentStage
        }))
      };
    });
  } catch (err) {
    if (rejectedAuditPayload) {
      await writeClaimAudit(rejectedAuditPayload);
    }
    throw err;
  }

  const org = await organisationAdapter.getOrganisation(organisationId);

  return {
    claimed: true,
    ...claimedSummary,
    organisationName: org?.name || 'NEXNUV Partner Organisation'
  };
}

module.exports = {
  claimCandidateApplications
};
