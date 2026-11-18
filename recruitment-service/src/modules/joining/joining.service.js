const { withTransaction } = require('../../config/database');
const {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ServiceUnavailableError
} = require('../../utils/AppError');
const { parsePagination, buildPaginationMeta } = require('../../utils/pagination');
const joiningRepo = require('./joining.repository');
const applicationRepo = require('../application/application.repository');
const offerRepo = require('../offer/offer.repository');
const auditService = require('../audit/audit.service');
const storageAdapter = require('../../integrations/storage/storage.adapter');
const notificationAdapter = require('../../integrations/notification/notification.adapter');
const employeeAdapter = require('../../integrations/employee/employee.adapter');
const logger = require('../../config/logger');

function attachSignedJoiningLetter(record, organisationId) {
  if (!record) return null;
  return {
    ...record,
    joiningLetterDownloadUrl: record.joiningLetterStorageKey
      ? storageAdapter.buildSignedDownloadUrl({
        storageKey: record.joiningLetterStorageKey,
        fileName: record.joiningLetterFileName,
        mimeType: record.joiningLetterMimeType,
        organisationId,
        docScope: 'JOINING',
        candidateEmail: record.application?.candidate?.email,
        candidateAuthUserId: record.application?.candidate?.authUserId
      })
      : null
  };
}

async function initiateJoining(organisationId, input, file, context = {}) {
  const idempotencyKey = context.idempotencyKey || input.idempotencyKey || null;

  if (idempotencyKey) {
    const existingByKey = await joiningRepo.findJoiningByIdempotencyKey(idempotencyKey);
    if (existingByKey) {
      const full = await joiningRepo.findJoiningById(organisationId, existingByKey.id);
      return { joining: attachSignedJoiningLetter(full, organisationId), idempotentReplay: true };
    }
  }

  const app = await applicationRepo.findApplicationById(organisationId, input.applicationId);
  if (!app) {
    throw new NotFoundError('Application not found in organisation');
  }

  const offer = await offerRepo.findOfferByApplicationId(app.id);
  if (!offer || offer.status !== 'ACCEPTED') {
    throw new ConflictError('Joining can only be initiated after the candidate accepts the offer');
  }

  const existingJoining = await joiningRepo.findJoiningByApplicationId(app.id);
  if (existingJoining) {
    throw new ConflictError('Joining record already exists for this application');
  }

  let storedLetter = null;
  if (file) {
    storedLetter = await storageAdapter.saveFile({
      organisationId,
      folder: 'joining-letters',
      originalName: file.originalname,
      mimeType: file.mimetype,
      buffer: file.buffer
    });
  }

  let created;
  try {
    created = await withTransaction(async (tx) => {
      const record = await joiningRepo.createJoiningRecord(
        {
          organisationId,
          applicationId: app.id,
          offerId: offer.id,
          expectedJoiningDate: new Date(input.expectedJoiningDate || offer.joiningDate),
          joiningLocation: input.joiningLocation.trim(),
          reportingManager: input.reportingManager?.trim() || null,
          onboardingNotes: input.onboardingNotes?.trim() || null,
          joiningLetterFileName: storedLetter?.fileName || null,
          joiningLetterMimeType: storedLetter?.mimeType || null,
          joiningLetterFileSizeBytes: storedLetter?.fileSizeBytes || null,
          joiningLetterStorageProvider: storedLetter?.storageProvider || null,
          joiningLetterStorageKey: storedLetter?.storageKey || null,
          joiningLetterCloudinaryPublicId: storedLetter?.cloudinaryPublicId || null,
          joiningLetterCloudinaryResourceType: storedLetter?.cloudinaryResourceType || null,
          joiningLetterCloudinaryFormat: storedLetter?.cloudinaryFormat || null,
          joiningLetterCloudinaryVersion: storedLetter?.cloudinaryVersion || null,
          joiningLetterVisibility: storedLetter?.storageVisibility || 'AUTHENTICATED',
          joiningLetterChecksumSha256: storedLetter?.checksumSha256 || null,
          joiningLetterScanStatus: storedLetter?.scanStatus || 'NOT_SCANNED',
          joiningLetterScanCheckedAt: storedLetter?.scanCheckedAt || null,
          status: storedLetter ? 'LETTER_SENT' : 'INITIATED',
          initiatedBy: context.actorUserId,
          idempotencyKey
        },
        tx
      );

      await applicationRepo.updateApplication(
        organisationId,
        app.id,
        { currentStage: 'JOINING' },
        tx
      );

      await applicationRepo.addStageHistory(
        {
          organisationId,
          applicationId: app.id,
          fromStage: app.currentStage,
          toStage: 'JOINING',
          action: 'JOINING_INITIATED',
          actorUserId: context.actorUserId,
          actorRole: context.actorRole,
          candidateVisibleNote: `Onboarding and joining initiated for ${input.joiningLocation}.`,
          metadata: { joiningRecordId: record.id }
        },
        tx
      );

      await auditService.recordAudit(
        {
          organisationId,
          actorUserId: context.actorUserId,
          actorEmployeeId: context.actorEmployeeId,
          actorRole: context.actorRole,
          entityType: 'JOINING',
          entityId: record.id,
          action: 'JOINING_INITIATED',
          requestId: context.requestId,
          afterState: {
            applicationId: app.id,
            expectedJoiningDate: record.expectedJoiningDate,
            status: record.status
          }
        },
        tx
      );

      return record;
    });
  } catch (err) {
    if (storedLetter?.storageKey) {
      await storageAdapter.deleteFile(storedLetter.storageKey, storedLetter);
    }
    throw err;
  }

  if (storedLetter) {
    await notificationAdapter.dispatchNotification({
      eventType: 'JOINING_LETTER_SENT',
      organisationId,
      recipientEmail: app.candidate.email,
      recipientName: app.candidate.fullName,
      requestId: context.requestId,
      payload: {
        joiningId: created.id,
        expectedJoiningDate: created.expectedJoiningDate,
        joiningLocation: created.joiningLocation
      }
    });
  }

  return { joining: attachSignedJoiningLetter(created, organisationId), idempotentReplay: false };
}

async function uploadAndSendJoiningLetter(organisationId, joiningId, file, context = {}) {
  if (!file) {
    throw new BadRequestError('Joining letter file is required');
  }
  const existing = await joiningRepo.findJoiningById(organisationId, joiningId);
  if (!existing) {
    throw new NotFoundError('Joining record not found');
  }

  const stored = await storageAdapter.saveFile({
    organisationId,
    folder: 'joining-letters',
    originalName: file.originalname,
    mimeType: file.mimetype,
    buffer: file.buffer
  });

  let updated;
  try {
    updated = await joiningRepo.updateJoiningRecord(organisationId, joiningId, {
      joiningLetterFileName: stored.fileName,
      joiningLetterMimeType: stored.mimeType,
      joiningLetterFileSizeBytes: stored.fileSizeBytes,
      joiningLetterStorageProvider: stored.storageProvider,
      joiningLetterStorageKey: stored.storageKey,
      joiningLetterCloudinaryPublicId: stored.cloudinaryPublicId || null,
      joiningLetterCloudinaryResourceType: stored.cloudinaryResourceType || null,
      joiningLetterCloudinaryFormat: stored.cloudinaryFormat || null,
      joiningLetterCloudinaryVersion: stored.cloudinaryVersion || null,
      joiningLetterVisibility: stored.storageVisibility || 'AUTHENTICATED',
      joiningLetterChecksumSha256: stored.checksumSha256,
      joiningLetterScanStatus: stored.scanStatus,
      joiningLetterScanCheckedAt: stored.scanCheckedAt,
      status: existing.status === 'INITIATED' ? 'LETTER_SENT' : existing.status
    });
  } catch (err) {
    await storageAdapter.deleteFile(stored.storageKey, stored);
    throw err;
  }

  if (existing.joiningLetterStorageKey && existing.joiningLetterStorageKey !== stored.storageKey) {
    await storageAdapter.deleteFile(existing.joiningLetterStorageKey, {
      storageProvider: existing.joiningLetterStorageProvider,
      cloudinaryPublicId: existing.joiningLetterCloudinaryPublicId,
      cloudinaryResourceType: existing.joiningLetterCloudinaryResourceType,
      mimeType: existing.joiningLetterMimeType
    });
  }

  await notificationAdapter.dispatchNotification({
    eventType: 'JOINING_LETTER_SENT',
    organisationId,
    recipientEmail: existing.application.candidate.email,
    recipientName: existing.application.candidate.fullName,
    requestId: context.requestId,
    payload: {
      joiningId,
      expectedJoiningDate: updated.expectedJoiningDate,
      joiningLocation: updated.joiningLocation
    }
  });

  await auditService.recordAudit({
    organisationId,
    actorUserId: context.actorUserId,
    actorEmployeeId: context.actorEmployeeId,
    actorRole: context.actorRole,
    entityType: 'JOINING',
    entityId: joiningId,
    action: 'JOINING_LETTER_SENT',
    requestId: context.requestId,
    afterState: { fileName: stored.fileName }
  });

  return attachSignedJoiningLetter(updated, organisationId);
}

async function updateJoiningStatus(organisationId, joiningId, input, context = {}) {
  const existing = await joiningRepo.findJoiningById(organisationId, joiningId);
  if (!existing) {
    throw new NotFoundError('Joining record not found');
  }

  const targetStatus = input.status;
  const now = new Date();
  const isJoined = targetStatus === 'JOINED';

  // Idempotency: If already confirmed JOINED, return cleanly
  if (existing.status === 'JOINED' && isJoined) {
    return attachSignedJoiningLetter(existing, organisationId);
  }

  const updated = await withTransaction(async (tx) => {
    const record = await joiningRepo.updateJoiningRecord(
      organisationId,
      joiningId,
      {
        status: targetStatus,
        ...(isJoined
          ? {
            actualJoiningDate: input.actualJoiningDate ? new Date(input.actualJoiningDate) : now,
            confirmedBy: context.actorUserId,
            hiredAt: now
          }
          : {}),
        ...(input.onboardingNotes ? { onboardingNotes: input.onboardingNotes } : {})
      },
      tx
    );

    if (isJoined) {
      await applicationRepo.updateApplication(
        organisationId,
        existing.applicationId,
        { currentStage: 'HIRED' },
        tx
      );

      await applicationRepo.addStageHistory(
        {
          organisationId,
          applicationId: existing.applicationId,
          fromStage: existing.application.currentStage,
          toStage: 'HIRED',
          action: 'CANDIDATE_HIRED',
          actorUserId: context.actorUserId,
          actorRole: context.actorRole,
          candidateVisibleNote: 'Welcome aboard! Joining confirmed and marked as HIRED.',
          metadata: { joiningRecordId: joiningId }
        },
        tx
      );
    }

    await auditService.recordAudit(
      {
        organisationId,
        actorUserId: context.actorUserId,
        actorEmployeeId: context.actorEmployeeId,
        actorRole: context.actorRole,
        entityType: 'JOINING',
        entityId: joiningId,
        action: `JOINING_STATUS_${targetStatus}`,
        requestId: context.requestId,
        beforeState: { status: existing.status },
        afterState: { status: targetStatus, hiredAt: record.hiredAt }
      },
      tx
    );

    return record;
  });

  if (isJoined) {
    // Automatically provision employee record in Employee Service (:4004)
    const candidate = existing.application?.candidate;
    const job = existing.application?.job;
    const offer = existing.offer;

    try {
      const createdEmployee = await employeeAdapter.createEmployee(
        organisationId,
        {
          fullName: candidate?.fullName || 'Hired Candidate',
          email: candidate?.email,
          phone: candidate?.mobileNumber || candidate?.phone || undefined,
          status: 'ACTIVE',
          department: offer?.department || job?.department || 'People & Talent',
          designation: offer?.designation || job?.title || 'Team Member',
          joiningDate: (input.actualJoiningDate ? new Date(input.actualJoiningDate) : now).toISOString().split('T')[0]
        },
        context
      );

      logger.info(
        {
          organisationId,
          candidateEmail: candidate?.email,
          employeeId: createdEmployee?.id || createdEmployee?.employeeId
        },
        '[Joining] Successfully provisioned employee record upon candidate joining'
      );

      await auditService.recordAudit({
        organisationId,
        actorUserId: context.actorUserId,
        actorEmployeeId: context.actorEmployeeId,
        actorRole: context.actorRole,
        entityType: 'EMPLOYEE',
        entityId: createdEmployee?.id || createdEmployee?.employeeId,
        action: 'EMPLOYEE_PROVISIONED_FROM_JOINING',
        requestId: context.requestId,
        afterState: {
          employeeId: createdEmployee?.id || createdEmployee?.employeeId,
          candidateEmail: candidate?.email,
          joiningId
        }
      });
    } catch (empErr) {
      // Partial failure resilience: do NOT fail joining confirmation if downstream employee service has transient outage
      logger.warn(
        {
          organisationId,
          candidateEmail: candidate?.email,
          error: empErr.message
        },
        '[Joining] Candidate marked JOINED but automatic employee provisioning failed or pending sync'
      );

      await auditService.recordAudit({
        organisationId,
        actorUserId: context.actorUserId,
        actorEmployeeId: context.actorEmployeeId,
        actorRole: context.actorRole,
        entityType: 'JOINING',
        entityId: joiningId,
        action: 'EMPLOYEE_PROVISIONING_PENDING_SYNC',
        requestId: context.requestId,
        afterState: {
          candidateEmail: candidate?.email,
          joiningId,
          error: empErr.message
        }
      });
    }

    await notificationAdapter.dispatchNotification({
      eventType: 'JOINING_CONFIRMED',
      organisationId,
      recipientEmail: existing.application.candidate.email,
      recipientName: existing.application.candidate.fullName,
      requestId: context.requestId,
      payload: {
        joiningId,
        applicationReference: existing.application.applicationReference,
        actualJoiningDate: updated.actualJoiningDate
      }
    });
  }

  return attachSignedJoiningLetter(updated, organisationId);
}

const inFlightRetries = new Map();

async function retryEmployeeSync(organisationId, joiningId, context = {}) {
  const lockKey = `${organisationId}:${joiningId}`;
  if (inFlightRetries.has(lockKey)) {
    return inFlightRetries.get(lockKey);
  }

  const execution = (async () => {
    const existing = await joiningRepo.findJoiningById(organisationId, joiningId);
    if (!existing) {
      throw new NotFoundError('Joining record not found in organisation');
    }

    if (existing.status !== 'JOINED') {
      throw new ConflictError(
        `Candidate joining status is '${existing.status}'. Employee synchronization can only be performed for confirmed JOINED candidates.`,
        'JOINING_STATUS_NOT_JOINED'
      );
    }

    const candidate = existing.application?.candidate;
    if (!candidate || !candidate.email) {
      throw new BadRequestError('Candidate profile or email address is missing on this joining record');
    }

    const job = existing.application?.job;
    const offer = existing.offer;
    const normalizedEmail = candidate.email.trim().toLowerCase();

    // 1. Check if employee already exists in Employee Service (Deduplication)
    try {
      const existingEmployees = await employeeAdapter.listEmployees(
        organisationId,
        { search: normalizedEmail, limit: 10 },
        context
      );
      const matched = (existingEmployees || []).find(
        (emp) =>
          (!emp.organisationId || emp.organisationId === organisationId) &&
          [emp.email, emp.personalEmail, emp.workEmail]
            .filter(Boolean)
            .some((em) => em.toLowerCase() === normalizedEmail)
      );

      if (matched) {
        logger.info(
          { organisationId, candidateEmail: normalizedEmail, employeeId: matched.id || matched.employeeId },
          '[Joining Retry Sync] Candidate already exists as active employee in Employee Service'
        );

        await auditService.recordAudit({
          organisationId,
          actorUserId: context.actorUserId,
          actorEmployeeId: context.actorEmployeeId,
          actorRole: context.actorRole,
          entityType: 'JOINING',
          entityId: joiningId,
          action: 'EMPLOYEE_PROVISIONING_ALREADY_SYNCED',
          requestId: context.requestId,
          afterState: {
            employeeId: matched.id || matched.employeeId,
            candidateEmail: normalizedEmail,
            alreadyExisted: true,
            timestamp: new Date().toISOString()
          }
        });

        return {
          success: true,
          status: 'ALREADY_SYNCED',
          message: `Employee '${normalizedEmail}' is already provisioned in Employee Service.`,
          data: {
            employeeId: matched.id || matched.employeeId,
            employeeCode: matched.employeeCode,
            email: matched.email,
            fullName: matched.fullName,
            department: matched.department,
            designation: matched.designation,
            status: matched.status
          }
        };
      }
    } catch (listErr) {
      logger.warn({ error: listErr.message }, '[Joining Retry Sync] Pre-check listEmployees failed, proceeding to create');
    }

    // 2. Attempt Employee Service Provisioning
    const payload = {
      fullName: candidate.fullName || 'Hired Candidate',
      email: normalizedEmail,
      phone: candidate.mobileNumber || candidate.phone || undefined,
      status: 'ACTIVE',
      department: offer?.department || job?.department || 'People & Talent',
      designation: offer?.designation || job?.title || 'Team Member',
      joiningDate: existing.actualJoiningDate
        ? new Date(existing.actualJoiningDate).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0]
    };

    let createdEmployee;
    try {
      createdEmployee = await employeeAdapter.createEmployee(organisationId, payload, context);
    } catch (empErr) {
      logger.error(
        {
          organisationId,
          candidateEmail: normalizedEmail,
          error: empErr.message
        },
        '[Joining Retry Sync] Employee Service provisioning retry failed'
      );

      await auditService.recordAudit({
        organisationId,
        actorUserId: context.actorUserId,
        actorEmployeeId: context.actorEmployeeId,
        actorRole: context.actorRole,
        entityType: 'JOINING',
        entityId: joiningId,
        action: 'EMPLOYEE_PROVISIONING_RETRY_FAILED',
        requestId: context.requestId,
        afterState: {
          candidateEmail: normalizedEmail,
          error: empErr.message,
          attemptTimestamp: new Date().toISOString()
        }
      });

      throw new ServiceUnavailableError(
        `Employee Service provisioning failed: ${empErr.message}. Ensure Employee Service is running and retry.`,
        'EMPLOYEE_SERVICE_SYNC_FAILED',
        { error: empErr.message }
      );
    }

    // 3. Record Successful Audit History
    logger.info(
      {
        organisationId,
        candidateEmail: normalizedEmail,
        employeeId: createdEmployee.id || createdEmployee.employeeId
      },
      '[Joining Retry Sync] Successfully provisioned employee record on retry'
    );

    await auditService.recordAudit({
      organisationId,
      actorUserId: context.actorUserId,
      actorEmployeeId: context.actorEmployeeId,
      actorRole: context.actorRole,
      entityType: 'JOINING',
      entityId: joiningId,
      action: 'EMPLOYEE_PROVISIONING_RETRY_SUCCESS',
      requestId: context.requestId,
      afterState: {
        employeeId: createdEmployee.id || createdEmployee.employeeId,
        candidateEmail: normalizedEmail,
        attemptTimestamp: new Date().toISOString()
      }
    });

    return {
      success: true,
      status: 'SYNCED',
      message: 'Employee record successfully provisioned in Employee Service.',
      data: {
        employeeId: createdEmployee.id || createdEmployee.employeeId,
        employeeCode: createdEmployee.employeeCode,
        email: createdEmployee.email,
        fullName: createdEmployee.fullName,
        department: createdEmployee.department,
        designation: createdEmployee.designation,
        joiningDate: payload.joiningDate
      }
    };
  })();

  inFlightRetries.set(lockKey, execution);
  try {
    return await execution;
  } finally {
    inFlightRetries.delete(lockKey);
  }
}

async function listOrganisationJoiningRecords(organisationId, query = {}) {
  const { page, limit, skip } = parsePagination(query);
  const { items, total } = await joiningRepo.listJoiningRecords(organisationId, {
    status: query.status,
    skip,
    take: limit + 1
  });
  return buildPaginationMeta({
    items: items.map((r) => attachSignedJoiningLetter(r, organisationId)),
    limit,
    total,
    page
  });
}

module.exports = {
  initiateJoining,
  uploadAndSendJoiningLetter,
  updateJoiningStatus,
  retryEmployeeSync,
  listOrganisationJoiningRecords
};
