const { Op, Sequelize } = require('sequelize');
const { getModels } = require('../../config/database');
const { toPlain, toPlainList } = require('../../utils/sequelizeHelpers');

async function createSubscription(data, transaction = null) {
  const { Subscription } = getModels();
  const row = await Subscription.create(data, { transaction });
  return toPlain(row);
}

async function findSubscriptionById(id, transaction = null) {
  const { Subscription, SubscriptionPayment } = getModels();
  const row = await Subscription.findByPk(id, {
    include: [{ model: SubscriptionPayment, as: 'payments' }],
    order: [[{ model: SubscriptionPayment, as: 'payments' }, 'createdAt', 'DESC']],
    transaction
  });
  return toPlain(row);
}

async function findSubscriptionByIdempotencyKey(idempotencyKey, transaction = null) {
  if (!idempotencyKey) return null;
  const { Subscription, SubscriptionPayment } = getModels();
  const row = await Subscription.findOne({
    where: { idempotencyKey },
    include: [{ model: SubscriptionPayment, as: 'payments' }],
    transaction
  });
  return toPlain(row);
}

async function findSubscriptionByActivationHash(activationTokenHash, transaction = null) {
  const { Subscription } = getModels();
  const row = await Subscription.findOne({
    where: { activationTokenHash },
    transaction
  });
  return toPlain(row);
}

async function listSubscriptions({ search, status, archived, skip = 0, take = 20 } = {}) {
  const { Subscription, SubscriptionPayment } = getModels();
  const where = {};

  const isArchivedFilter =
    archived === true ||
    archived === 'true' ||
    String(archived).toLowerCase() === 'archived' ||
    String(status).toUpperCase() === 'ARCHIVED';

  if (isArchivedFilter) {
    where.isArchived = true;
  } else if (archived === 'all' || archived === 'ALL' || String(status).toUpperCase() === 'ALL_INCL_ARCHIVED') {
    // Show all (both active and archived)
  } else {
    // Default: Show only unarchived/active bookings
    where.isArchived = false;
  }

  if (status && String(status).toUpperCase() !== 'ALL' && String(status).toUpperCase() !== 'ARCHIVED' && String(status).toUpperCase() !== 'ALL_INCL_ARCHIVED') {
    const s = String(status).toUpperCase().trim();
    if (s === 'PENDING') {
      where.status = { [Op.in]: ['PENDING_VERIFICATION', 'PENDING_PAYMENT'] };
    } else if (s === 'APPROVED' || s === 'ACTIVE') {
      where.status = { [Op.in]: ['ACTIVE', 'TRIAL'] };
    } else if (s === 'REJECTED') {
      where.status = 'REJECTED';
    } else if (['PENDING_VERIFICATION', 'PENDING_PAYMENT', 'TRIAL', 'EXPIRED', 'SUSPENDED', 'CANCELLED'].includes(s)) {
      where.status = s;
    } else {
      where.status = s;
    }
  }

  const include = [{ model: SubscriptionPayment, as: 'payments' }];

  if (search && String(search).trim()) {
    const cleanSearch = String(search).trim();
    const strippedSearch = cleanSearch.replace(/^#/, '');
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cleanSearch);

    if (isUuid) {
      where[Op.or] = [
        { id: cleanSearch },
        { organisationId: cleanSearch }
      ];
    } else {
      const term = `%${cleanSearch}%`;
      const strippedTerm = `%${strippedSearch}%`;
      where[Op.or] = [
        { organisationName: { [Op.iLike]: term } },
        { organisationDomain: { [Op.iLike]: term } },
        { adminEmail: { [Op.iLike]: term } },
        { adminName: { [Op.iLike]: term } },
        { '$payments.payment_reference$': { [Op.iLike]: term } },
        Sequelize.where(
          Sequelize.cast(Sequelize.col('Subscription.id'), 'text'),
          { [Op.iLike]: strippedTerm }
        )
      ];
    }
  }

  const [rows, total] = await Promise.all([
    Subscription.findAll({
      where,
      include,
      order: [
        ['createdAt', 'DESC'],
        [{ model: SubscriptionPayment, as: 'payments' }, 'createdAt', 'DESC']
      ],
      offset: skip,
      limit: take,
      distinct: true,
      subQuery: false
    }),
    Subscription.count({
      where,
      include: search ? include : [],
      distinct: true,
      col: 'id'
    })
  ]);
  return { items: toPlainList(rows), total };
}

async function archiveSubscriptionBooking(id, { archivedBy, archiveReason }, transaction = null) {
  const { Subscription } = getModels();
  await Subscription.update(
    {
      isArchived: true,
      archivedAt: new Date(),
      archivedBy,
      archiveReason
    },
    { where: { id }, transaction }
  );
  return findSubscriptionById(id, transaction);
}

async function updateSubscription(id, data, transaction = null) {
  const { Subscription } = getModels();
  await Subscription.update(data, { where: { id }, transaction });
  return findSubscriptionById(id, transaction);
}

async function findPaymentByReference(paymentReference, transaction = null) {
  const { SubscriptionPayment } = getModels();
  const row = await SubscriptionPayment.findOne({
    where: { paymentReference },
    transaction
  });
  return toPlain(row);
}

async function findPaymentByIdempotencyKey(idempotencyKey, transaction = null) {
  if (!idempotencyKey) return null;
  const { SubscriptionPayment } = getModels();
  const row = await SubscriptionPayment.findOne({
    where: { idempotencyKey },
    transaction
  });
  return toPlain(row);
}

async function createPayment(data, transaction = null) {
  const { SubscriptionPayment } = getModels();
  const row = await SubscriptionPayment.create(data, { transaction });
  return toPlain(row);
}

async function updatePayment(id, data, transaction = null) {
  const { SubscriptionPayment } = getModels();
  await SubscriptionPayment.update(data, { where: { id }, transaction });
  const row = await SubscriptionPayment.findByPk(id, { transaction });
  return toPlain(row);
}

async function findLatestPaymentForSubscription(subscriptionId, transaction = null) {
  const { SubscriptionPayment } = getModels();
  const row = await SubscriptionPayment.findOne({
    where: { subscriptionId },
    order: [['createdAt', 'DESC']],
    transaction
  });
  return toPlain(row);
}

async function findActiveOrPastTrialByDomainOrEmail(domain, email, transaction = null) {
  const { Subscription } = getModels();
  const { Op } = require('sequelize');
  const normalizedDomain = String(domain || '').trim().toLowerCase();
  const normalizedEmail = String(email || '').trim().toLowerCase();

  const row = await Subscription.findOne({
    where: {
      [Op.or]: [
        { organisationDomain: normalizedDomain },
        { adminEmail: normalizedEmail }
      ],
      status: {
        [Op.in]: ['TRIAL', 'ACTIVE', 'EXPIRED', 'PENDING_VERIFICATION']
      }
    },
    order: [['createdAt', 'DESC']],
    transaction
  });
  return toPlain(row);
}

async function findLatestSubscriptionByOrganisationId(organisationId, transaction = null) {
  if (!organisationId) return null;
  const { Subscription, SubscriptionPayment } = getModels();
  const row = await Subscription.findOne({
    where: { organisationId },
    include: [{ model: SubscriptionPayment, as: 'payments' }],
    order: [['createdAt', 'DESC']],
    transaction
  });
  return toPlain(row);
}

async function findPaymentById(id, transaction = null) {
  const { Subscription, SubscriptionPayment } = getModels();
  const row = await SubscriptionPayment.findByPk(id, {
    include: [{ model: Subscription, as: 'subscription' }],
    transaction
  });
  return toPlain(row);
}

async function listPayments({ search, status, skip = 0, take = 20 } = {}) {
  const { Subscription, SubscriptionPayment } = getModels();
  const { Op } = require('sequelize');

  const where = {};

  if (status && String(status).toUpperCase() !== 'ALL') {
    const s = String(status).toUpperCase().trim();
    if (s === 'PENDING') {
      where.status = 'SUBMITTED';
    } else if (s === 'APPROVED') {
      where.status = 'VERIFIED';
    } else if (s === 'REJECTED') {
      where.status = 'REJECTED';
    } else if (s === 'VOIDED' || s === 'ARCHIVED' || s === 'VOIDED_ARCHIVED') {
      where.status = { [Op.in]: ['VOIDED', 'ARCHIVED'] };
    } else if (['SUBMITTED', 'VERIFIED'].includes(s)) {
      where.status = s;
    }
  }

  const subWhere = {};
  if (search && String(search).trim()) {
    const term = `%${String(search).trim()}%`;
    const cleanSearch = String(search).trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cleanSearch);

    if (isUuid) {
      where[Op.or] = [
        { id: cleanSearch },
        { subscriptionId: cleanSearch },
        { paymentReference: { [Op.iLike]: term } }
      ];
    } else {
      where[Op.or] = [
        { paymentReference: { [Op.iLike]: term } },
        { submittedByEmail: { [Op.iLike]: term } },
        { '$subscription.organisation_name$': { [Op.iLike]: term } }
      ];
    }
  }

  const [rows, total] = await Promise.all([
    SubscriptionPayment.findAll({
      where,
      include: [
        {
          model: Subscription,
          as: 'subscription',
          attributes: [
            'id',
            'organisationName',
            'organisationDomain',
            'adminName',
            'adminEmail',
            'planCode',
            'billingCycle',
            'amountCents',
            'currency',
            'status',
            'provisioningStatus'
          ]
        }
      ],
      order: [['createdAt', 'DESC']],
      offset: skip,
      limit: take
    }),
    SubscriptionPayment.count({
      where,
      include: [
        {
          model: Subscription,
          as: 'subscription',
          attributes: []
        }
      ]
    })
  ]);

  return { items: toPlainList(rows), total };
}

module.exports = {
  createSubscription,
  findSubscriptionById,
  findSubscriptionByIdempotencyKey,
  findSubscriptionByActivationHash,
  listSubscriptions,
  updateSubscription,
  findPaymentByReference,
  findPaymentByIdempotencyKey,
  findPaymentById,
  listPayments,
  createPayment,
  updatePayment,
  findLatestPaymentForSubscription,
  findActiveOrPastTrialByDomainOrEmail,
  findLatestSubscriptionByOrganisationId,
  archiveSubscriptionBooking
};
