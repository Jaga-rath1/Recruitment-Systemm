const { getModels } = require('../../config/database');
const { toPlain, toPlainList } = require('../../utils/sequelizeHelpers');

async function findOfferById(organisationId, offerId, transaction = null) {
  const { Offer, Application, Candidate, Job, OfferDocument, JoiningRecord } = getModels();
  const row = await Offer.findOne({
    where: { id: offerId, organisationId },
    include: [
      {
        model: Application,
        as: 'application',
        include: [
          { model: Candidate, as: 'candidate' },
          { model: Job, as: 'job' }
        ]
      },
      { model: OfferDocument, as: 'documents' },
      { model: JoiningRecord, as: 'joiningRecord' }
    ],
    transaction
  });
  return toPlain(row);
}

async function findOfferByIdempotencyKey(idempotencyKey, transaction = null) {
  if (!idempotencyKey) return null;
  const { Offer, OfferDocument } = getModels();
  const row = await Offer.findOne({
    where: { idempotencyKey },
    include: [{ model: OfferDocument, as: 'documents' }],
    transaction
  });
  return toPlain(row);
}

async function findOfferByApplicationId(applicationId, transaction = null) {
  const { Offer, OfferDocument } = getModels();
  const row = await Offer.findOne({
    where: { applicationId },
    include: [{ model: OfferDocument, as: 'documents' }],
    transaction
  });
  return toPlain(row);
}

async function createOffer(data, transaction = null) {
  const { Offer, OfferDocument } = getModels();
  const created = await Offer.create(data, { transaction });
  const reloaded = await Offer.findByPk(created.id, {
    include: [{ model: OfferDocument, as: 'documents' }],
    transaction
  });
  return toPlain(reloaded);
}

async function updateOffer(organisationId, offerId, data, transaction = null) {
  const { Offer, OfferDocument } = getModels();
  const existing = await Offer.findOne({ where: { id: offerId, organisationId }, transaction });
  if (!existing) return null;
  await existing.update(data, { transaction });
  const reloaded = await Offer.findByPk(offerId, {
    include: [{ model: OfferDocument, as: 'documents' }],
    transaction
  });
  return toPlain(reloaded);
}

async function createOfferDocument(data, transaction = null) {
  const { OfferDocument } = getModels();
  const row = await OfferDocument.create(data, { transaction });
  return toPlain(row);
}

async function listOffers(organisationId, { status, skip = 0, take = 21 } = {}) {
  const { Offer, Application, Candidate, Job, OfferDocument, JoiningRecord } = getModels();
  const where = {
    organisationId,
    ...(status ? { status } : {})
  };

  const [rows, total] = await Promise.all([
    Offer.findAll({
      where,
      include: [
        {
          model: Application,
          as: 'application',
          attributes: ['id', 'applicationReference', 'currentStage'],
          include: [
            { model: Candidate, as: 'candidate', attributes: ['id', 'fullName', 'email'] },
            { model: Job, as: 'job', attributes: ['id', 'title'] }
          ]
        },
        { model: OfferDocument, as: 'documents' },
        { model: JoiningRecord, as: 'joiningRecord', attributes: ['id', 'status'] }
      ],
      order: [['createdAt', 'DESC']],
      offset: skip,
      limit: take
    }),
    Offer.count({ where })
  ]);

  return { items: toPlainList(rows), total };
}

module.exports = {
  findOfferById,
  findOfferByIdempotencyKey,
  findOfferByApplicationId,
  createOffer,
  updateOffer,
  createOfferDocument,
  listOffers
};
