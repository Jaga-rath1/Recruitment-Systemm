const { withTransaction } = require('../../config/database');
const { ConflictError, NotFoundError } = require('../../utils/AppError');
const trackingRepo = require('./tracking.repository');
const applicationRepo = require('../application/application.repository');
const offerRepo = require('../offer/offer.repository');
const auditService = require('../audit/audit.service');
const storageAdapter = require('../../integrations/storage/storage.adapter');
const notificationAdapter = require('../../integrations/notification/notification.adapter');
const organisationAdapter = require('../../integrations/organisation/organisation.adapter');
const { stripSalaryApprovalMetadata } = require('../offer/offer.service');

const PIPELINE_STEPS = [
  { key: 'APPLIED', label: 'Applied' },
  { key: 'SCREENING', label: 'Screening' },
  { key: 'TECHNICAL_INTERVIEW', label: 'Technical Interview' },
  { key: 'MANAGERIAL_INTERVIEW', label: 'Managerial Interview' },
  { key: 'FINAL_SELECTION', label: 'Final Selection' },
  { key: 'OFFER_PROCESSING', label: 'Offer Processing' },
  { key: 'OFFER_ACCEPTED', label: 'Offer Accepted' },
  { key: 'JOINING', label: 'Joining' }
];

function computeStageTracker(currentStage, stageHistory = []) {
  const stageOrder = PIPELINE_STEPS.map((s) => s.key);
  const visitedSet = new Set(stageHistory.map((h) => h.toStage));
  const effectiveIndex =
    currentStage === 'HIRED'
      ? stageOrder.length
      : stageOrder.indexOf(currentStage);

  return PIPELINE_STEPS.map((step, idx) => {
    let status = 'UPCOMING';
    if (currentStage === 'HIRED') {
      status = 'COMPLETED';
    } else if (currentStage === 'REJECTED' || currentStage === 'ON_HOLD') {
      status = visitedSet.has(step.key) ? 'COMPLETED' : 'SKIPPED';
    } else if (idx < effectiveIndex) {
      status = 'COMPLETED';
    } else if (idx === effectiveIndex) {
      status = 'CURRENT';
    }
    return {
      key: step.key,
      label: step.label,
      status
    };
  });
}

function sanitizeCandidateApplication(app, orgNameMap, auth = null) {
  return {
    id: app.id,
    organisationId: app.organisationId,
    organisationName: orgNameMap.get(app.organisationId) || 'NEXNUV Partner Organisation',
    applicationReference: app.applicationReference,
    currentStage: app.currentStage,
    screeningStatus: app.screeningStatus,
    coverLetter: app.coverLetter,
    submittedAt: app.createdAt,
    updatedAt: app.updatedAt,
    job: app.job,
    progressTracker: computeStageTracker(app.currentStage, app.stageHistory),
    stageHistory: (app.stageHistory || []).map((h) => ({
      id: h.id,
      fromStage: h.fromStage,
      toStage: h.toStage,
      action: h.action,
      note: h.candidateVisibleNote || null,
      createdAt: h.createdAt
    })),
    interviews: app.interviews || [],
    documents: (app.documents || []).map((d) => ({
      id: d.id,
      documentType: d.documentType,
      fileName: d.fileName,
      mimeType: d.mimeType,
      fileSizeBytes: d.fileSizeBytes,
      downloadUrl: storageAdapter.buildSignedDownloadUrl({
        storageKey: d.storageKey,
        fileName: d.fileName,
        mimeType: d.mimeType,
        organisationId: app.organisationId,
        docScope: 'APPLICATION',
        candidateEmail: auth?.email || null,
        candidateAuthUserId: auth?.userId || null
      })
    })),
    offer: app.offer
      ? {
          id: app.offer.id,
          offeredSalary: app.offer.offeredSalary,
          salaryCurrency: app.offer.salaryCurrency,
          designation: app.offer.designation,
          department: app.offer.department,
          joiningDate: app.offer.joiningDate,
          offerValidUntil: app.offer.offerValidUntil,
          termsSummary: stripSalaryApprovalMetadata(app.offer.termsSummary),
          status: app.offer.status,
          sentAt: app.offer.sentAt,
          candidateRespondedAt: app.offer.candidateRespondedAt,
          documents: (app.offer.documents || []).map((od) => ({
            id: od.id,
            documentType: od.documentType,
            fileName: od.fileName,
            downloadUrl: storageAdapter.buildSignedDownloadUrl({
              storageKey: od.storageKey,
              fileName: od.fileName,
              mimeType: od.mimeType,
              organisationId: app.organisationId,
              docScope: 'OFFER',
              candidateEmail: auth?.email || null,
              candidateAuthUserId: auth?.userId || null
            })
          }))
        }
      : null,
    joiningRecord: app.joiningRecord
      ? {
          id: app.joiningRecord.id,
          expectedJoiningDate: app.joiningRecord.expectedJoiningDate,
          actualJoiningDate: app.joiningRecord.actualJoiningDate,
          joiningLocation: app.joiningRecord.joiningLocation,
          reportingManager: app.joiningRecord.reportingManager,
          onboardingNotes: app.joiningRecord.onboardingNotes,
          status: app.joiningRecord.status,
          hiredAt: app.joiningRecord.hiredAt,
          joiningLetterFileName: app.joiningRecord.joiningLetterFileName,
          joiningLetterDownloadUrl: app.joiningRecord.joiningLetterStorageKey
            ? storageAdapter.buildSignedDownloadUrl({
                storageKey: app.joiningRecord.joiningLetterStorageKey,
                fileName: app.joiningRecord.joiningLetterFileName,
                mimeType: app.joiningRecord.joiningLetterMimeType,
                organisationId: app.organisationId,
                docScope: 'JOINING',
                candidateEmail: auth?.email || null,
                candidateAuthUserId: auth?.userId || null
              })
            : null
        }
      : null
  };
}

async function getCandidatePortalOverview(auth) {
  const [profiles, applications] = await Promise.all([
    trackingRepo.findCandidateProfilesForAuthUser({ userId: auth.userId, email: auth.email }),
    trackingRepo.findCandidateApplications({ userId: auth.userId, email: auth.email })
  ]);

  const uniqueOrgIds = Array.from(new Set(applications.map((a) => a.organisationId).filter(Boolean)));
  const orgNameMap = new Map();
  await Promise.all(
    uniqueOrgIds.map(async (orgId) => {
      const org = await organisationAdapter.getOrganisation(orgId);
      orgNameMap.set(orgId, org?.name || 'NEXNUV Partner Organisation');
    })
  );

  const primaryProfile = profiles[0] || {
    fullName: auth.name,
    email: auth.email,
    mobileNumber: '',
    location: '',
    totalExperienceYears: 0,
    skills: []
  };

  return {
    profile: primaryProfile,
    accountSecurity: {
      emailVerified: Boolean(auth.emailVerified),
      emailVerifiedAt: auth.emailVerifiedAt || null,
      passwordChangedAt: auth.passwordChangedAt || null,
      lastLoginAt: auth.lastLoginAt || null
    },
    applications: applications.map((app) => sanitizeCandidateApplication(app, orgNameMap, auth))
  };
}

async function updateCandidateSelfProfile(auth, input) {
  const updateData = {
    ...(input.fullName !== undefined ? { fullName: input.fullName.trim() } : {}),
    ...(input.mobileNumber !== undefined ? { mobileNumber: input.mobileNumber.trim() } : {}),
    ...(input.location !== undefined ? { location: input.location.trim() } : {}),
    ...(input.totalExperienceYears !== undefined ? { totalExperienceYears: Number(input.totalExperienceYears) } : {}),
    ...(input.currentCompany !== undefined ? { currentCompany: input.currentCompany.trim() } : {}),
    ...(input.currentSalary !== undefined ? { currentSalary: input.currentSalary.trim() } : {}),
    ...(input.expectedSalary !== undefined ? { expectedSalary: input.expectedSalary.trim() } : {}),
    ...(input.noticePeriodDays !== undefined ? { noticePeriodDays: Number(input.noticePeriodDays) } : {}),
    ...(input.skills !== undefined ? { skills: input.skills } : {}),
    ...(input.headline !== undefined ? { headline: input.headline.trim() } : {}),
    ...(input.linkedinUrl !== undefined ? { linkedinUrl: input.linkedinUrl.trim() } : {}),
    ...(input.portfolioUrl !== undefined ? { portfolioUrl: input.portfolioUrl.trim() } : {})
  };

  await trackingRepo.updateCandidateProfilesForAuthUser({ userId: auth.userId, email: auth.email }, updateData);
  const profiles = await trackingRepo.findCandidateProfilesForAuthUser({ userId: auth.userId, email: auth.email });
  return profiles[0] || null;
}

async function respondToOffer(auth, offerId, input, context = {}) {
  const offer = await trackingRepo.findOwnedOffer({
    userId: auth.userId,
    email: auth.email,
    offerId
  });
  if (!offer) {
    throw new NotFoundError('Offer not found for authenticated candidate');
  }
  if (offer.status !== 'SENT') {
    throw new ConflictError(`Offer cannot be responded to when status is ${offer.status}`);
  }
  if (new Date(offer.offerValidUntil) < new Date() && input.decision === 'ACCEPT') {
    throw new ConflictError('Offer validity window has expired');
  }

  const isAccepted = input.decision === 'ACCEPT';
  const nextOfferStatus = isAccepted ? 'ACCEPTED' : 'REJECTED';
  const nextAppStage = isAccepted ? 'OFFER_ACCEPTED' : 'REJECTED';

  const updated = await withTransaction(async (tx) => {
    const updatedOffer = await offerRepo.updateOffer(
      offer.organisationId,
      offer.id,
      {
        status: nextOfferStatus,
        candidateRespondedAt: new Date(),
        candidateResponseNote: input.note?.trim() || null
      },
      tx
    );

    await applicationRepo.updateApplication(
      offer.organisationId,
      offer.applicationId,
      { currentStage: nextAppStage },
      tx
    );

    await applicationRepo.addStageHistory(
      {
        organisationId: offer.organisationId,
        applicationId: offer.applicationId,
        fromStage: offer.application.currentStage,
        toStage: nextAppStage,
        action: isAccepted ? 'OFFER_ACCEPTED' : 'OFFER_REJECTED',
        actorUserId: auth.userId,
        actorRole: 'CANDIDATE',
        candidateVisibleNote: isAccepted
          ? 'Candidate accepted the offer! Joining process will begin shortly.'
          : 'Candidate declined the offer.',
        metadata: { offerId: offer.id }
      },
      tx
    );

    await auditService.recordAudit(
      {
        organisationId: offer.organisationId,
        actorUserId: auth.userId,
        actorRole: 'CANDIDATE',
        entityType: 'OFFER',
        entityId: offer.id,
        action: isAccepted ? 'OFFER_ACCEPTED' : 'OFFER_REJECTED',
        requestId: context.requestId,
        beforeState: { status: offer.status },
        afterState: { status: nextOfferStatus }
      },
      tx
    );

    return updatedOffer;
  });

  await notificationAdapter.dispatchNotification({
    eventType: isAccepted ? 'OFFER_ACCEPTED' : 'OFFER_REJECTED',
    organisationId: offer.organisationId,
    recipientEmail: offer.application.candidate.email,
    recipientName: offer.application.candidate.fullName,
    requestId: context.requestId,
    payload: {
      offerId: offer.id,
      applicationReference: offer.application.applicationReference,
      designation: offer.designation,
      status: nextOfferStatus
    }
  });

  return updated;
}

async function getOrganisationReports(organisationId) {
  return trackingRepo.getRecruitmentAnalytics(organisationId);
}

module.exports = {
  PIPELINE_STEPS,
  computeStageTracker,
  getCandidatePortalOverview,
  updateCandidateSelfProfile,
  respondToOffer,
  getOrganisationReports
};
