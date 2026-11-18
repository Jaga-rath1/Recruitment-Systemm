const { withTransaction } = require('../../config/database');
const {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError
} = require('../../utils/AppError');
const { parsePagination, buildPaginationMeta } = require('../../utils/pagination');
const offerRepo = require('./offer.repository');
const applicationRepo = require('../application/application.repository');
const auditService = require('../audit/audit.service');
const storageAdapter = require('../../integrations/storage/storage.adapter');
const notificationAdapter = require('../../integrations/notification/notification.adapter');

function hasSalaryApprovalAuthority(context = {}) {
  const role = (context.actorRole || '').toUpperCase();
  if (role === 'SUPER_ADMIN' || role === 'ORGANISATION_ADMIN' || role === 'ADMIN') return true;
  const permissions = Array.isArray(context.permissions) ? context.permissions : [];
  return (
    permissions.includes('offer:salary_approve') ||
    permissions.includes('organisation:manage')
  );
}

function stripSalaryApprovalMetadata(termsSummary = '') {
  return String(termsSummary || '')
    .replace(/<!--SALARY_APPROVAL:[\s\S]*?-->\s*/g, '')
    .replace(/\[SALARY_APPROVED\]/gi, '')
    .trim();
}

function parseSalaryApproval(termsSummary = '') {
  if (!termsSummary) return { approved: false, status: 'NONE' };
  try {
    const match = String(termsSummary).match(/^<!--SALARY_APPROVAL:(\{[^\r\n]*?\})-->/);
    if (match && match[1]) {
      const data = JSON.parse(match[1]);
      return { approved: data.status === 'APPROVED', ...data };
    }
  } catch (_e) {}
  return { approved: false, status: 'NONE' };
}

function embedSalaryApproval(termsSummary = '', approvalData = {}) {
  const cleanSummary = stripSalaryApprovalMetadata(termsSummary);
  const tag = `<!--SALARY_APPROVAL:${JSON.stringify(approvalData)}-->`;
  return cleanSummary ? `${tag}\n${cleanSummary}` : tag;
}

function withSignedOfferDocs(offer, organisationId) {
  if (!offer) return null;
  return {
    ...offer,
    salaryApproval: parseSalaryApproval(offer.termsSummary),
    documents: (offer.documents || []).map((doc) => ({
      ...doc,
      downloadUrl: storageAdapter.buildSignedDownloadUrl({
        storageKey: doc.storageKey,
        fileName: doc.fileName,
        mimeType: doc.mimeType,
        organisationId,
        docScope: 'OFFER',
        candidateEmail: offer.application?.candidate?.email,
        candidateAuthUserId: offer.application?.candidate?.authUserId
      })
    }))
  };
}

async function createOrPrepareOffer(organisationId, input, file, context = {}) {
  const idempotencyKey = context.idempotencyKey || input.idempotencyKey || null;

  if (idempotencyKey) {
    const existingByKey = await offerRepo.findOfferByIdempotencyKey(idempotencyKey);
    if (existingByKey) {
      return { offer: withSignedOfferDocs(existingByKey, organisationId), idempotentReplay: true };
    }
  }

  const app = await applicationRepo.findApplicationById(organisationId, input.applicationId);
  if (!app) {
    throw new NotFoundError('Application not found in organisation');
  }

  if (!['FINAL_SELECTION', 'OFFER_PROCESSING'].includes(app.currentStage)) {
    throw new ConflictError(`Application must reach FINAL_SELECTION before offer processing (current: ${app.currentStage})`);
  }

  const existingOffer = await offerRepo.findOfferByApplicationId(app.id);
  if (existingOffer) {
    throw new ConflictError('An offer already exists for this application');
  }

  let storedLetter = null;
  if (file) {
    storedLetter = await storageAdapter.saveFile({
      organisationId,
      folder: 'offers',
      originalName: file.originalname,
      mimeType: file.mimetype,
      buffer: file.buffer
    });
  }

  const shouldSend = Boolean(input.sendImmediately);
  const now = new Date();

  const offeredSalary = Number(input.offeredSalary);
  const jobMaxSalary = app.job?.salaryMax ? Number(app.job.salaryMax) : null;
  const exceedsBudget = jobMaxSalary !== null && offeredSalary > jobMaxSalary;
  const hasAuthority = hasSalaryApprovalAuthority(context);

  if (exceedsBudget && shouldSend && !hasAuthority) {
    throw new ForbiddenError(
      `Offered salary (${offeredSalary} ${input.salaryCurrency || 'USD'}) exceeds maximum requisition budget (${jobMaxSalary} ${app.job?.salaryCurrency || 'USD'}). Formal managerial/executive salary approval is required before dispatching this offer.`,
      'SALARY_APPROVAL_REQUIRED'
    );
  }

  let initialApproval = null;
  if (exceedsBudget) {
    if (hasAuthority) {
      initialApproval = {
        status: 'APPROVED',
        approvedBy: context.actorUserId,
        approvedRole: context.actorRole,
        approvedAt: now.toISOString(),
        approvedSalary: offeredSalary,
        notes: 'Executive salary approval authorized upon offer creation'
      };
    } else {
      initialApproval = {
        status: 'PENDING_APPROVAL',
        requestedBy: context.actorUserId,
        requestedRole: context.actorRole,
        requestedAt: now.toISOString(),
        offeredSalary,
        notes: 'Exceeds job requisition band, awaiting managerial approval'
      };
    }
  } else {
    initialApproval = {
      status: 'APPROVED',
      approvedBy: context.actorUserId,
      approvedRole: context.actorRole,
      approvedAt: now.toISOString(),
      approvedSalary: offeredSalary,
      notes: 'Within budgeted salary range'
    };
  }

  const termsSummary = embedSalaryApproval(input.termsSummary?.trim() || '', initialApproval);

  let created;
  try {
    created = await withTransaction(async (tx) => {
      const offer = await offerRepo.createOffer(
        {
          organisationId,
          applicationId: app.id,
          offeredSalary,
          salaryCurrency: input.salaryCurrency || 'USD',
          designation: input.designation.trim(),
          department: input.department.trim(),
          joiningDate: new Date(input.joiningDate),
          offerValidUntil: new Date(input.offerValidUntil),
          termsSummary,
          status: shouldSend ? 'SENT' : 'DRAFT',
          sentBy: shouldSend ? context.actorUserId : null,
          sentAt: shouldSend ? now : null,
          idempotencyKey
        },
        tx
      );

      if (storedLetter) {
        await offerRepo.createOfferDocument(
          {
            organisationId,
            offerId: offer.id,
            documentType: 'OFFER_LETTER',
            fileName: storedLetter.fileName,
            mimeType: storedLetter.mimeType,
            fileSizeBytes: storedLetter.fileSizeBytes,
            storageProvider: storedLetter.storageProvider,
            storageKey: storedLetter.storageKey,
            cloudinaryPublicId: storedLetter.cloudinaryPublicId || null,
            cloudinaryResourceType: storedLetter.cloudinaryResourceType || null,
            cloudinaryFormat: storedLetter.cloudinaryFormat || null,
            cloudinaryVersion: storedLetter.cloudinaryVersion || null,
            storageVisibility: storedLetter.storageVisibility || 'AUTHENTICATED',
            checksumSha256: storedLetter.checksumSha256,
            scanStatus: storedLetter.scanStatus,
            scanCheckedAt: storedLetter.scanCheckedAt,
            scanEngine: storedLetter.scanEngine,
            uploadedBy: context.actorUserId
          },
          tx
        );
      }

      await applicationRepo.updateApplication(
        organisationId,
        app.id,
        { currentStage: 'OFFER_PROCESSING' },
        tx
      );

      await applicationRepo.addStageHistory(
        {
          organisationId,
          applicationId: app.id,
          fromStage: app.currentStage,
          toStage: 'OFFER_PROCESSING',
          action: shouldSend ? 'OFFER_CREATED_AND_SENT' : 'OFFER_DRAFT_CREATED',
          actorUserId: context.actorUserId,
          actorRole: context.actorRole,
          candidateVisibleNote: shouldSend
            ? `Offer letter sent for ${input.designation}.`
            : 'Offer is currently being prepared.',
          metadata: { offerId: offer.id }
        },
        tx
      );

      await auditService.recordAudit(
        {
          organisationId,
          actorUserId: context.actorUserId,
          actorEmployeeId: context.actorEmployeeId,
          actorRole: context.actorRole,
          entityType: 'OFFER',
          entityId: offer.id,
          action: shouldSend ? 'OFFER_SENT' : 'OFFER_CREATED',
          requestId: context.requestId,
          afterState: {
            applicationId: app.id,
            offeredSalary: offer.offeredSalary,
            designation: offer.designation,
            status: offer.status
          }
        },
        tx
      );

      return offerRepo.findOfferById(organisationId, offer.id, tx);
    });
  } catch (err) {
    if (storedLetter?.storageKey) {
      await storageAdapter.deleteFile(storedLetter.storageKey, storedLetter);
    }
    throw err;
  }

  if (shouldSend) {
    await notificationAdapter.dispatchNotification({
      eventType: 'OFFER_LETTER_SENT',
      organisationId,
      recipientEmail: app.candidate.email,
      recipientName: app.candidate.fullName,
      requestId: context.requestId,
      payload: {
        offerId: created.id,
        applicationReference: app.applicationReference,
        designation: created.designation,
        offeredSalary: created.offeredSalary,
        salaryCurrency: created.salaryCurrency,
        offerValidUntil: created.offerValidUntil
      }
    });
  }

  return { offer: withSignedOfferDocs(created, organisationId), idempotentReplay: false };
}

async function uploadOfferLetter(organisationId, offerId, file, context = {}) {
  if (!file) {
    throw new BadRequestError('Offer letter file is required');
  }
  const offer = await offerRepo.findOfferById(organisationId, offerId);
  if (!offer) {
    throw new NotFoundError('Offer not found in organisation');
  }

  const stored = await storageAdapter.saveFile({
    organisationId,
    folder: 'offers',
    originalName: file.originalname,
    mimeType: file.mimetype,
    buffer: file.buffer
  });

  try {
    await withTransaction(async (tx) => {
      await offerRepo.createOfferDocument(
        {
          organisationId,
          offerId,
          documentType: 'OFFER_LETTER',
          fileName: stored.fileName,
          mimeType: stored.mimeType,
          fileSizeBytes: stored.fileSizeBytes,
          storageProvider: stored.storageProvider,
          storageKey: stored.storageKey,
          cloudinaryPublicId: stored.cloudinaryPublicId || null,
          cloudinaryResourceType: stored.cloudinaryResourceType || null,
          cloudinaryFormat: stored.cloudinaryFormat || null,
          cloudinaryVersion: stored.cloudinaryVersion || null,
          storageVisibility: stored.storageVisibility || 'AUTHENTICATED',
          checksumSha256: stored.checksumSha256,
          scanStatus: stored.scanStatus,
          scanCheckedAt: stored.scanCheckedAt,
          scanEngine: stored.scanEngine,
          uploadedBy: context.actorUserId
        },
        tx
      );

      await auditService.recordAudit(
        {
          organisationId,
          actorUserId: context.actorUserId,
          actorEmployeeId: context.actorEmployeeId,
          actorRole: context.actorRole,
          entityType: 'OFFER',
          entityId: offerId,
          action: 'OFFER_LETTER_UPLOADED',
          requestId: context.requestId,
          afterState: { fileName: stored.fileName }
        },
        tx
      );
    });
  } catch (err) {
    await storageAdapter.deleteFile(stored.storageKey, stored);
    throw err;
  }

  const refreshed = await offerRepo.findOfferById(organisationId, offerId);
  return withSignedOfferDocs(refreshed, organisationId);
}

async function sendOfferToCandidate(organisationId, offerId, context = {}) {
  const offer = await offerRepo.findOfferById(organisationId, offerId);
  if (!offer) {
    throw new NotFoundError('Offer not found in organisation');
  }
  if (!['DRAFT', 'SENT'].includes(offer.status)) {
    throw new ConflictError(`Cannot send offer with status ${offer.status}`);
  }

  const offeredSalary = Number(offer.offeredSalary);
  const jobMax = offer.application?.job?.salaryMax ? Number(offer.application.job.salaryMax) : null;
  const exceedsBudget = jobMax !== null && offeredSalary > jobMax;
  const hasAuthority = hasSalaryApprovalAuthority(context);
  const approval = parseSalaryApproval(offer.termsSummary);

  if (exceedsBudget && !approval.approved && !hasAuthority) {
    throw new ForbiddenError(
      `Cannot dispatch offer: offered salary (${offeredSalary} ${offer.salaryCurrency}) exceeds job requisition budget (${jobMax} ${offer.application?.job?.salaryCurrency || 'USD'}) and formal managerial/executive salary approval has not been granted.`,
      'SALARY_APPROVAL_REQUIRED'
    );
  }

  const now = new Date();
  let finalTermsSummary = offer.termsSummary;
  if (exceedsBudget && !approval.approved && hasAuthority) {
    finalTermsSummary = embedSalaryApproval(offer.termsSummary, {
      status: 'APPROVED',
      approvedBy: context.actorUserId,
      approvedRole: context.actorRole,
      approvedAt: now.toISOString(),
      approvedSalary: offeredSalary,
      notes: 'Executive salary approval authorized at dispatch'
    });
  }

  const updated = await withTransaction(async (tx) => {
    await offerRepo.updateOffer(
      organisationId,
      offerId,
      {
        status: 'SENT',
        sentBy: context.actorUserId,
        sentAt: now,
        ...(finalTermsSummary !== offer.termsSummary ? { termsSummary: finalTermsSummary } : {})
      },
      tx
    );

    await applicationRepo.updateApplication(
      organisationId,
      offer.applicationId,
      { currentStage: 'OFFER_PROCESSING' },
      tx
    );

    await applicationRepo.addStageHistory(
      {
        organisationId,
        applicationId: offer.applicationId,
        fromStage: offer.application.currentStage,
        toStage: 'OFFER_PROCESSING',
        action: 'OFFER_SENT',
        actorUserId: context.actorUserId,
        actorRole: context.actorRole,
        candidateVisibleNote: `Offer letter sent for ${offer.designation}.`,
        metadata: { offerId }
      },
      tx
    );

    await auditService.recordAudit(
      {
        organisationId,
        actorUserId: context.actorUserId,
        actorEmployeeId: context.actorEmployeeId,
        actorRole: context.actorRole,
        entityType: 'OFFER',
        entityId: offerId,
        action: 'OFFER_SENT',
        requestId: context.requestId,
        beforeState: { status: offer.status },
        afterState: { status: 'SENT' }
      },
      tx
    );

    return offerRepo.findOfferById(organisationId, offerId, tx);
  });

  await notificationAdapter.dispatchNotification({
    eventType: 'OFFER_LETTER_SENT',
    organisationId,
    recipientEmail: offer.application.candidate.email,
    recipientName: offer.application.candidate.fullName,
    requestId: context.requestId,
    payload: {
      offerId,
      applicationReference: offer.application.applicationReference,
      designation: offer.designation,
      offeredSalary: offer.offeredSalary,
      salaryCurrency: offer.salaryCurrency,
      offerValidUntil: offer.offerValidUntil
    }
  });

  return withSignedOfferDocs(updated, organisationId);
}

async function approveSalary(organisationId, offerId, input = {}, context = {}) {
  if (!hasSalaryApprovalAuthority(context)) {
    throw new ForbiddenError(
      'Only managerial or executive administrators (ORGANISATION_ADMIN or offer:salary_approve) can approve salary offers.',
      'SALARY_APPROVAL_FORBIDDEN'
    );
  }

  const offer = await offerRepo.findOfferById(organisationId, offerId);
  if (!offer) {
    throw new NotFoundError('Offer not found in organisation');
  }

  if (['ACCEPTED', 'REJECTED', 'EXPIRED', 'WITHDRAWN'].includes(offer.status)) {
    throw new ConflictError(`Cannot approve salary for offer with terminal status: ${offer.status}`);
  }

  const now = new Date();
  const approvedSalary = input.approvedSalary ? Number(input.approvedSalary) : Number(offer.offeredSalary);
  const approvalData = {
    status: 'APPROVED',
    approvedBy: context.actorUserId,
    approvedRole: context.actorRole,
    approvedAt: now.toISOString(),
    approvedSalary,
    notes: input.approvalNotes?.trim() || 'Managerial salary approval granted'
  };

  const updatedTerms = embedSalaryApproval(offer.termsSummary, approvalData);

  const updated = await withTransaction(async (tx) => {
    const record = await offerRepo.updateOffer(
      organisationId,
      offerId,
      {
        offeredSalary: approvedSalary,
        termsSummary: updatedTerms
      },
      tx
    );

    await applicationRepo.addStageHistory(
      {
        organisationId,
        applicationId: offer.applicationId,
        fromStage: offer.application?.currentStage,
        toStage: offer.application?.currentStage || 'OFFER_PROCESSING',
        action: 'SALARY_APPROVED',
        actorUserId: context.actorUserId,
        actorRole: context.actorRole,
        candidateVisibleNote: 'Salary offer approved by management.',
        internalRemark: `Salary approved: ${approvedSalary} ${offer.salaryCurrency}. Notes: ${approvalData.notes}`,
        metadata: { offerId, approval: approvalData }
      },
      tx
    );

    await auditService.recordAudit(
      {
        organisationId,
        actorUserId: context.actorUserId,
        actorEmployeeId: context.actorEmployeeId,
        actorRole: context.actorRole,
        entityType: 'OFFER',
        entityId: offerId,
        action: 'OFFER_SALARY_APPROVED',
        requestId: context.requestId,
        beforeState: { offeredSalary: offer.offeredSalary },
        afterState: { offeredSalary: approvedSalary, approval: approvalData }
      },
      tx
    );

    return record;
  });

  return withSignedOfferDocs(updated, organisationId);
}

async function listOrganisationOffers(organisationId, query = {}) {
  const { page, limit, skip } = parsePagination(query);
  const { items, total } = await offerRepo.listOffers(organisationId, {
    status: query.status,
    skip,
    take: limit + 1
  });
  return buildPaginationMeta({
    items: items.map((o) => withSignedOfferDocs(o, organisationId)),
    limit,
    total,
    page
  });
}

async function getOrganisationOffer(organisationId, offerId) {
  const offer = await offerRepo.findOfferById(organisationId, offerId);
  if (!offer) {
    throw new NotFoundError('Offer not found in organisation');
  }
  return withSignedOfferDocs(offer, organisationId);
}

module.exports = {
  createOrPrepareOffer,
  uploadOfferLetter,
  sendOfferToCandidate,
  approveSalary,
  listOrganisationOffers,
  getOrganisationOffer,
  withSignedOfferDocs,
  hasSalaryApprovalAuthority,
  parseSalaryApproval,
  stripSalaryApprovalMetadata
};
