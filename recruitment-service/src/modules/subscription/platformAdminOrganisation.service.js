'use strict';

const { Op } = require('sequelize');
const env = require('../../config/env');
const { getModels } = require('../../config/database');
const { NotFoundError } = require('../../utils/AppError');
const { resolvePlan } = require('./subscription.helpers');
const {
  computeAdminAccountStatus,
  computeInvitationStatus,
  findSubscriptionByOrgOrSubId
} = require('./platformAdminOrganisation.helpers');
const recoveryService = require('./platformAdminOrganisationRecovery.service');
const cancellationService = require('./subscriptionCancellation.service');

async function listPlatformOrganisations(query = {}) {
  const { Subscription, SubscriptionPayment, EmployeeRoleAssignment, RecruitmentRole } = getModels();

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const where = {
    [Op.and]: [
      {
        [Op.or]: [
          { organisationId: { [Op.ne]: null } },
          { status: { [Op.in]: ['APPROVED', 'ACTIVE', 'TRIAL'] } },
          { provisioningStatus: 'FAILED' }
        ]
      }
    ]
  };

  if (query.archived === 'true') {
    where.isArchived = true;
  } else if (query.archived !== 'all') {
    where.isArchived = false;
  }

  if (query.status && query.status !== 'ALL') {
    where.status = query.status;
  }

  if (query.provisioningStatus && query.provisioningStatus !== 'ALL') {
    where.provisioningStatus = query.provisioningStatus;
  }

  if (query.search && query.search.trim()) {
    const s = `%${query.search.trim()}%`;
    where[Op.and].push({
      [Op.or]: [
        { organisationName: { [Op.iLike]: s } },
        { organisationDomain: { [Op.iLike]: s } },
        { adminName: { [Op.iLike]: s } },
        { adminEmail: { [Op.iLike]: s } },
        { planCode: { [Op.iLike]: s } }
      ]
    });
  }

  const { rows, count: total } = await Subscription.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    offset,
    limit,
    include: [
      {
        model: SubscriptionPayment,
        as: 'payments',
        required: false,
        attributes: ['id', 'status', 'paymentReference', 'amountCents', 'currency', 'verifiedAt', 'createdAt']
      }
    ]
  });

  const orgIds = rows.map((r) => r.organisationId).filter(Boolean);
  let assignmentsByOrg = {};

  if (orgIds.length > 0) {
    const assignments = await EmployeeRoleAssignment.findAll({
      where: {
        organisationId: { [Op.in]: orgIds }
      },
      include: [
        {
          model: RecruitmentRole,
          as: 'role',
          where: { code: 'ORGANISATION_ADMIN' },
          required: true
        }
      ]
    });

    for (const a of assignments) {
      if (!assignmentsByOrg[a.organisationId]) {
        assignmentsByOrg[a.organisationId] = a;
      }
    }
  }

  const clientUrl = env.clientAppUrl || 'http://localhost:5173';
  const orgLoginUrl = `${clientUrl}/org-login`;

  const items = rows.map((sub) => {
    const assignment = assignmentsByOrg[sub.organisationId] || null;
    const latestPayment = (sub.payments || []).sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    )[0];

    const paymentStatus = sub.status === 'TRIAL'
      ? 'TRIAL'
      : (latestPayment?.status || (sub.status === 'ACTIVE' || sub.status === 'APPROVED' ? 'VERIFIED' : 'PENDING'));

    const adminAccountStatus = computeAdminAccountStatus(sub, assignment);
    const invitationStatus = computeInvitationStatus(sub, assignment);
    const planInfo = resolvePlan(sub.planCode);

    return {
      subscriptionId: sub.id,
      organisationId: sub.organisationId || null,
      organisationName: sub.organisationName,
      organisationDomain: sub.organisationDomain,
      industry: sub.industry,
      companySize: sub.companySize,
      adminName: sub.adminName,
      adminEmail: sub.adminEmail,
      adminAccountStatus,
      invitationStatus,
      planCode: sub.planCode,
      planName: planInfo.name,
      billingCycle: sub.billingCycle,
      amountCents: sub.amountCents,
      currency: sub.currency,
      status: sub.status,
      startsAt: sub.startsAt,
      expiresAt: sub.expiresAt,
      activatedAt: sub.activatedAt,
      invitationSentAt: sub.invitationSentAt || sub.updatedAt,
      invitationExpiresAt: sub.activationExpiresAt,
      invitationResendCount: sub.invitationResendCount || 0,
      paymentStatus,
      provisioningStatus: sub.provisioningStatus,
      provisioningError: sub.provisioningError,
      loginPortalUrl: orgLoginUrl,
      lastLoginAt: null,
      hasAdminAssignment: !!assignment
    };
  });

  return {
    items,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1
    }
  };
}

async function getPlatformOrganisationDetails(id) {
  const { EmployeeRoleAssignment, RecruitmentRole, Job } = getModels();
  const sub = await findSubscriptionByOrgOrSubId(id);

  if (!sub) {
    throw new NotFoundError('Organisation subscription record not found');
  }

  let publishedJobCount = 0;
  let totalJobCount = 0;
  if (sub.organisationId && Job) {
    [publishedJobCount, totalJobCount] = await Promise.all([
      Job.count({
        where: {
          organisationId: sub.organisationId,
          status: 'PUBLISHED',
          isDiscarded: false
        }
      }),
      Job.count({
        where: {
          organisationId: sub.organisationId
        }
      })
    ]);
  }

  let adminAssignment = null;
  if (sub.organisationId) {
    adminAssignment = await EmployeeRoleAssignment.findOne({
      where: {
        organisationId: sub.organisationId
      },
      include: [
        {
          model: RecruitmentRole,
          as: 'role',
          where: { code: 'ORGANISATION_ADMIN' },
          required: true
        }
      ]
    });
  }

  const clientUrl = env.clientAppUrl || 'http://localhost:5173';
  const orgLoginUrl = `${clientUrl}/org-login`;
  const adminAccountStatus = computeAdminAccountStatus(sub, adminAssignment);
  const invitationStatus = computeInvitationStatus(sub, adminAssignment);
  const planInfo = resolvePlan(sub.planCode);

  const isMissingAdminAccount =
    sub.provisioningStatus === 'PROVISIONED' &&
    (sub.status === 'ACTIVE' || sub.status === 'TRIAL') &&
    !adminAssignment;

  const payments = (sub.payments || []).sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  ).map((p) => ({
    id: p.id,
    paymentReference: p.paymentReference,
    paymentMethod: p.paymentMethod,
    amountCents: p.amountCents,
    currency: p.currency,
    status: p.status,
    verifiedAt: p.verifiedAt,
    rejectionReason: p.rejectionReason,
    createdAt: p.createdAt
  }));

  const latestPayment = payments[0];
  const paymentStatus = sub.status === 'TRIAL'
    ? 'TRIAL'
    : (latestPayment?.status || (sub.status === 'ACTIVE' || sub.status === 'APPROVED' ? 'VERIFIED' : 'PENDING'));

  return {
    organisation: {
      id: sub.organisationId || sub.id,
      organisationId: sub.organisationId || null,
      subscriptionId: sub.id,
      name: sub.organisationName,
      domain: sub.organisationDomain,
      industry: sub.industry,
      companySize: sub.companySize,
      status: sub.status,
      provisioningStatus: sub.provisioningStatus,
      provisioningError: sub.provisioningError,
      createdAt: sub.createdAt,
      updatedAt: sub.updatedAt
    },
    adminAccount: {
      fullName: sub.adminName,
      email: sub.adminEmail,
      loginPortalUrl: orgLoginUrl,
      accountStatus: adminAccountStatus,
      invitationStatus,
      invitationSentAt: sub.invitationSentAt || sub.updatedAt,
      invitationExpiresAt: sub.activationExpiresAt,
      invitationResendCount: sub.invitationResendCount || 0,
      activatedAt: sub.activatedAt,
      lastLoginAt: null,
      isActive: adminAssignment ? adminAssignment.isActive : (sub.status === 'ACTIVE' || sub.status === 'TRIAL'),
      isMissingAssignment: isMissingAdminAccount,
      assignmentId: adminAssignment?.id || null,
      authUserId: adminAssignment?.authUserId || null,
      employeeId: adminAssignment?.employeeId || null
    },
    subscription: {
      id: sub.id,
      planCode: sub.planCode,
      planName: planInfo.name,
      billingCycle: sub.billingCycle,
      amountCents: sub.amountCents,
      currency: sub.currency,
      status: sub.status,
      startsAt: sub.startsAt,
      expiresAt: sub.expiresAt,
      activatedAt: sub.activatedAt,
      paymentStatus,
      approvedBy: sub.approvedBy,
      approvedAt: sub.approvedAt,
      cancelledAt: sub.cancelledAt,
      cancelledBy: sub.cancelledBy,
      cancellationReason: sub.cancellationReason
    },
    jobsSummary: {
      publishedJobCount,
      totalJobCount
    },
    payments
  };
}

module.exports = {
  listPlatformOrganisations,
  getPlatformOrganisationDetails,
  resendPlatformOrgAdminActivation: recoveryService.resendPlatformOrgAdminActivation,
  recoverPlatformOrgAdminAccount: recoveryService.recoverPlatformOrgAdminAccount,
  triggerPlatformOrgAdminPasswordReset: recoveryService.triggerPlatformOrgAdminPasswordReset,
  cancelOrganisationSubscription: cancellationService.cancelOrganisationSubscription
};
