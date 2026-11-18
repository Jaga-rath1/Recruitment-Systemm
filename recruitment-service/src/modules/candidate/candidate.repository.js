const { Op } = require('sequelize');
const { getModels } = require('../../config/database');
const { ConflictError } = require('../../utils/AppError');
const { toPlain, toPlainList } = require('../../utils/sequelizeHelpers');

async function upsertCandidateForOrg(organisationId, data, transaction = null) {
  const { Candidate } = getModels();
  const email = data.email.trim().toLowerCase();
  const existing = await Candidate.findOne({
    where: { organisationId, email },
    transaction
  });

  if (existing) {
    if (existing.authUserId && data.authUserId !== existing.authUserId) {
      throw new ConflictError(
        'An application profile for this email in this organisation already belongs to a registered candidate account. Please sign in to submit another application.',
        'CANDIDATE_ACCOUNT_SIGN_IN_REQUIRED'
      );
    }
    const canBindVerifiedOwner = Boolean(!existing.authUserId && data.authUserId && data.verifiedEmailMatch);
    await existing.update(
      {
        ...(canBindVerifiedOwner ? { authUserId: data.authUserId, claimedAt: new Date() } : {}),
        fullName: data.fullName,
        mobileNumber: data.mobileNumber,
        location: data.location,
        totalExperienceYears: data.totalExperienceYears,
        ...(data.currentCompany !== undefined ? { currentCompany: data.currentCompany } : {}),
        ...(data.currentSalary !== undefined ? { currentSalary: data.currentSalary } : {}),
        ...(data.expectedSalary !== undefined ? { expectedSalary: data.expectedSalary } : {}),
        ...(data.noticePeriodDays !== undefined ? { noticePeriodDays: data.noticePeriodDays } : {}),
        ...(data.skills !== undefined ? { skills: data.skills } : {}),
        ...(data.headline !== undefined ? { headline: data.headline } : {}),
        ...(data.linkedinUrl !== undefined ? { linkedinUrl: data.linkedinUrl } : {}),
        ...(data.portfolioUrl !== undefined ? { portfolioUrl: data.portfolioUrl } : {})
      },
      { transaction }
    );
    return toPlain(existing);
  }

  try {
    const created = await Candidate.create(
      {
        organisationId,
        authUserId: data.authUserId || null,
        fullName: data.fullName,
        email,
        mobileNumber: data.mobileNumber,
        location: data.location,
        totalExperienceYears: data.totalExperienceYears,
        currentCompany: data.currentCompany || null,
        currentSalary: data.currentSalary || null,
        expectedSalary: data.expectedSalary || null,
        noticePeriodDays: data.noticePeriodDays ?? 0,
        skills: data.skills || [],
        headline: data.headline || null,
        linkedinUrl: data.linkedinUrl || null,
        portfolioUrl: data.portfolioUrl || null
      },
      { transaction }
    );
    return toPlain(created);
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      const raced = await Candidate.findOne({ where: { organisationId, email }, transaction });
      if (raced) return toPlain(raced);
    }
    throw err;
  }
}

async function listCandidates(organisationId, { search, skip = 0, take = 21 } = {}) {
  const { Candidate, Application, Job } = getModels();
  const where = {
    organisationId,
    ...(search
      ? {
          [Op.or]: [
            { fullName: { [Op.iLike]: `%${search}%` } },
            { email: { [Op.iLike]: `%${search}%` } },
            { location: { [Op.iLike]: `%${search}%` } },
            { currentCompany: { [Op.iLike]: `%${search}%` } }
          ]
        }
      : {})
  };

  const [rows, total] = await Promise.all([
    Candidate.findAll({
      where,
      include: [
        {
          model: Application,
          as: 'applications',
          attributes: ['id', 'applicationReference', 'currentStage', 'screeningStatus', 'createdAt'],
          include: [{ model: Job, as: 'job', attributes: ['id', 'title', 'department'] }]
        }
      ],
      order: [
        ['createdAt', 'DESC'],
        [{ model: Application, as: 'applications' }, 'createdAt', 'DESC']
      ],
      offset: skip,
      limit: take
    }),
    Candidate.count({ where })
  ]);

  return { items: toPlainList(rows), total };
}

async function findCandidateById(organisationId, candidateId) {
  const { Candidate, Application, Job, ApplicationDocument, Offer, JoiningRecord } = getModels();
  const row = await Candidate.findOne({
    where: { id: candidateId, organisationId },
    include: [
      {
        model: Application,
        as: 'applications',
        include: [
          { model: Job, as: 'job', attributes: ['id', 'title', 'department', 'location'] },
          { model: ApplicationDocument, as: 'documents' },
          { model: Offer, as: 'offer' },
          { model: JoiningRecord, as: 'joiningRecord' }
        ]
      }
    ],
    order: [[{ model: Application, as: 'applications' }, 'createdAt', 'DESC']]
  });
  return toPlain(row);
}

module.exports = {
  upsertCandidateForOrg,
  listCandidates,
  findCandidateById
};
