'use strict';

const { Op } = require('sequelize');
const { getModels } = require('../../config/database');
const { BadRequestError } = require('../../utils/AppError');

function computeAdminAccountStatus(sub, assignment) {
  if (assignment) {
    if (!assignment.isActive) return 'DISABLED';
    if (
      assignment.accountActivatedAt ||
      sub.activatedAt ||
      sub.status === 'ACTIVE' ||
      sub.status === 'TRIAL' ||
      assignment.invitationStatus === 'ACCOUNT_ACTIVATED'
    ) {
      return 'ACTIVATED';
    }
    return 'INVITED';
  }
  if (sub.activatedAt || sub.status === 'ACTIVE' || sub.status === 'TRIAL') {
    return 'ACTIVATED';
  }
  if (sub.status === 'APPROVED') {
    return 'INVITED';
  }
  if (sub.provisioningStatus === 'FAILED') {
    return 'NOT_PROVISIONED';
  }
  return 'PENDING';
}

function computeInvitationStatus(sub, assignment) {
  if (
    sub.activatedAt ||
    sub.status === 'ACTIVE' ||
    sub.status === 'TRIAL' ||
    assignment?.accountActivatedAt
  ) {
    return 'ACCOUNT_ACTIVATED';
  }
  if (sub.status === 'APPROVED') {
    if (sub.activationExpiresAt && new Date(sub.activationExpiresAt) < new Date()) {
      return 'INVITATION_EXPIRED';
    }
    if ((sub.invitationResendCount || 0) > 0) {
      return 'INVITATION_RESENT';
    }
    return 'INVITATION_SENT';
  }
  if (sub.provisioningStatus === 'FAILED') {
    return 'INVITATION_FAILED';
  }
  return 'PENDING';
}

async function findSubscriptionByOrgOrSubId(id) {
  const { Subscription, SubscriptionPayment } = getModels();
  if (!id) throw new BadRequestError('Organisation or Subscription ID required');

  const sub = await Subscription.findOne({
    where: {
      [Op.or]: [{ organisationId: id }, { id }]
    },
    include: [
      {
        model: SubscriptionPayment,
        as: 'payments',
        required: false
      }
    ]
  });

  return sub;
}

module.exports = {
  computeAdminAccountStatus,
  computeInvitationStatus,
  findSubscriptionByOrgOrSubId
};
