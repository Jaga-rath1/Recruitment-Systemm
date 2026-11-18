const crypto = require('crypto');
const { withTransaction, getModels } = require('../../config/database');
const {
  BadRequestError,
  ConflictError,
  NotFoundError
} = require('../../utils/AppError');
const { parsePagination, buildPaginationMeta } = require('../../utils/pagination');
const applicationRepo = require('./application.repository');
const candidateRepo = require('../candidate/candidate.repository');
const auditService = require('../audit/audit.service');
const storageAdapter = require('../../integrations/storage/storage.adapter');
const notificationAdapter = require('../../integrations/notification/notification.adapter');
const employeeAdapter = require('../../integrations/employee/employee.adapter');

function normalizeSkills(skillsInput) {
  if (Array.isArray(skillsInput)) {
    return skillsInput.map((s) => String(s).trim()).filter(Boolean);
  }
  if (typeof skillsInput === 'string') {
    const trimmed = skillsInput.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.map((s) => String(s).trim()).filter(Boolean);
      } catch (_err) {
        // Fallback to comma split
      }
    }
    return trimmed.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function generateApplicationReference() {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `NXV-${datePart}-${randomPart}`;
}

function attachSignedDocUrls(docs = [], organisationId, docScope = 'APPLICATION', candidate = null) {
  return docs.map((doc) => ({
    ...doc,
    downloadUrl: storageAdapter.buildSignedDownloadUrl({
      storageKey: doc.storageKey,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      organisationId,
      docScope,
      candidateEmail: candidate?.email || null,
      candidateAuthUserId: candidate?.authUserId || null
    })
  }));
}

async function submitPublicApplication(jobId, input, file, context = {}) {
  const job = await applicationRepo.findPublishedJobForApply(jobId);
  if (!job) {
    throw new NotFoundError('Published job position not found or no longer accepting applications');
  }

  if (job.applicationDeadline && new Date(job.applicationDeadline) < new Date()) {
    throw new BadRequestError('Application deadline for this position has passed');
  }

  if (!file) {
    throw new BadRequestError('Resume file is required to apply');
  }

  const organisationId = job.organisationId;
  const normalizedEmail = input.email.trim().toLowerCase();
  const skills = normalizeSkills(input.skills);

  // Check duplicate application before uploading file to storage
  const { Candidate } = getModels();
  const existingCandidate = await Candidate.findOne({
    where: { organisationId, email: normalizedEmail },
    attributes: ['id']
  });
  if (existingCandidate) {
    const existingAppBeforeUpload = await applicationRepo.findDuplicateApplication(job.id, existingCandidate.id);
    if (existingAppBeforeUpload) {
      throw new ConflictError(
        `Duplicate application prevented: already applied with reference ${existingAppBeforeUpload.applicationReference}`,
        'DUPLICATE_APPLICATION'
      );
    }
  }

  const storedResume = await storageAdapter.saveFile({
    organisationId,
    folder: 'resumes',
    originalName: file.originalname,
    mimeType: file.mimetype,
    buffer: file.buffer
  });

  let result;
  try {
    result = await withTransaction(async (tx) => {
      const candidate = await candidateRepo.upsertCandidateForOrg(
        organisationId,
        {
          authUserId: context.authUserId || null,
          verifiedEmailMatch: Boolean(context.authUserId),
          fullName: input.fullName.trim(),
          email: normalizedEmail,
          mobileNumber: input.mobileNumber.trim(),
          location: input.location.trim(),
          totalExperienceYears: Number(input.totalExperienceYears),
          currentCompany: input.currentCompany?.trim() || null,
          currentSalary: input.currentSalary?.trim() || null,
          expectedSalary: input.expectedSalary?.trim() || null,
          noticePeriodDays: Number(input.noticePeriodDays ?? 0),
          skills,
          linkedinUrl: input.linkedinUrl?.trim() || null,
          portfolioUrl: input.portfolioUrl?.trim() || null
        },
        tx
      );

      const existingApp = await applicationRepo.findDuplicateApplication(job.id, candidate.id, tx);
      if (existingApp) {
        throw new ConflictError(
          `Duplicate application prevented: already applied with reference ${existingApp.applicationReference}`,
          'DUPLICATE_APPLICATION'
        );
      }

      const applicationReference = generateApplicationReference();
      const application = await applicationRepo.createApplication(
        {
          organisationId,
          jobId: job.id,
          candidateId: candidate.id,
          applicationReference,
          coverLetter: input.coverLetter?.trim() || null,
          screeningStatus: 'PENDING',
          currentStage: 'APPLIED',
          sourceChannel: 'CAREERS_PORTAL'
        },
        tx
      );

      const document = await applicationRepo.createApplicationDocument(
        {
          organisationId,
          applicationId: application.id,
          candidateId: candidate.id,
          documentType: 'RESUME',
          fileName: storedResume.fileName,
          mimeType: storedResume.mimeType,
          fileSizeBytes: storedResume.fileSizeBytes,
          storageProvider: storedResume.storageProvider,
          storageKey: storedResume.storageKey,
          cloudinaryPublicId: storedResume.cloudinaryPublicId || null,
          cloudinaryResourceType: storedResume.cloudinaryResourceType || null,
          cloudinaryFormat: storedResume.cloudinaryFormat || null,
          cloudinaryVersion: storedResume.cloudinaryVersion || null,
          storageVisibility: storedResume.storageVisibility || 'AUTHENTICATED',
          checksumSha256: storedResume.checksumSha256,
          scanStatus: storedResume.scanStatus,
          scanCheckedAt: storedResume.scanCheckedAt,
          scanEngine: storedResume.scanEngine,
          uploadedBy: context.authUserId || null
        },
        tx
      );

      await applicationRepo.addStageHistory(
        {
          organisationId,
          applicationId: application.id,
          fromStage: null,
          toStage: 'APPLIED',
          action: 'APPLICATION_SUBMITTED',
          actorUserId: context.authUserId || null,
          actorRole: 'CANDIDATE',
          candidateVisibleNote: `Application submitted for ${job.title}`,
          metadata: { applicationReference }
        },
        tx
      );

      await auditService.recordAudit(
        {
          organisationId,
          actorUserId: context.authUserId || null,
          actorRole: 'CANDIDATE',
          entityType: 'APPLICATION',
          entityId: application.id,
          action: 'APPLICATION_SUBMITTED',
          requestId: context.requestId,
          ipAddress: context.ipAddress,
          afterState: {
            applicationReference,
            jobId: job.id,
            candidateEmail: candidate.email
          }
        },
        tx
      );

      return { application, candidate, document };
    });
  } catch (err) {
    await storageAdapter.deleteFile(storedResume.storageKey, storedResume);
    throw err;
  }

  await notificationAdapter.dispatchNotification({
    eventType: 'APPLICATION_RECEIVED',
    organisationId,
    recipientEmail: result.candidate.email,
    recipientName: result.candidate.fullName,
    requestId: context.requestId,
    payload: {
      applicationId: result.application.id,
      applicationReference: result.application.applicationReference,
      jobId: job.id,
      jobTitle: job.title
    }
  });

  return {
    applicationId: result.application.id,
    applicationReference: result.application.applicationReference,
    organisationId,
    jobId: job.id,
    jobTitle: job.title,
    candidateId: result.candidate.id,
    currentStage: result.application.currentStage,
    submittedAt: result.application.createdAt
  };
}

async function listOrganisationApplications(organisationId, query = {}) {
  const { page, limit, skip } = parsePagination(query);
  const { items, total } = await applicationRepo.listApplications(organisationId, {
    jobId: query.jobId,
    currentStage: query.currentStage,
    screeningStatus: query.screeningStatus,
    search: query.search,
    skip,
    take: limit + 1
  });

  const formatted = items.map((app) => ({
    ...app,
    documents: attachSignedDocUrls(app.documents, organisationId, 'APPLICATION', app.candidate)
  }));

  return buildPaginationMeta({ items: formatted, limit, total, page });
}

async function getOrganisationApplicationDetail(organisationId, applicationId) {
  const app = await applicationRepo.findApplicationById(organisationId, applicationId);
  if (!app) {
    throw new NotFoundError('Application not found in organisation');
  }

  return {
    ...app,
    documents: attachSignedDocUrls(app.documents, organisationId, 'APPLICATION', app.candidate),
    offer: app.offer
      ? {
          ...app.offer,
          documents: attachSignedDocUrls(app.offer.documents, organisationId, 'OFFER', app.candidate)
        }
      : null
  };
}

async function screenApplication(organisationId, applicationId, input, context = {}) {
  const { EmployeeRoleAssignment, RecruitmentRole, Interview, InterviewAssignment } = getModels();
  const app = await applicationRepo.findApplicationById(organisationId, applicationId);
  if (!app) {
    throw new NotFoundError('Application not found in organisation');
  }

  if (!['APPLIED', 'SCREENING', 'ON_HOLD'].includes(app.currentStage)) {
    throw new ConflictError(`Cannot screen application currently in stage ${app.currentStage}`);
  }

  const decisionMap = {
    SHORTLIST: { screeningStatus: 'SHORTLISTED', nextStage: 'SCREENING' },
    REJECT: { screeningStatus: 'REJECTED', nextStage: 'REJECTED' },
    HOLD: { screeningStatus: 'ON_HOLD', nextStage: 'ON_HOLD' }
  };

  const mapped = decisionMap[input.decision];
  if (!mapped) {
    throw new BadRequestError('Invalid screening decision');
  }

  const shouldScheduleTech = input.decision === 'SHORTLIST' && input.technicalInterviewerEmployeeId && input.scheduledAt;
  let scheduledInterviewer = null;
  if (shouldScheduleTech) {
    scheduledInterviewer = await employeeAdapter.getEmployeeById(
      organisationId,
      input.technicalInterviewerEmployeeId,
      { actorUserId: context.actorUserId, requestId: context.requestId }
    );
    const assignment = await EmployeeRoleAssignment.findOne({
      where: {
        organisationId,
        employeeId: input.technicalInterviewerEmployeeId
      },
      include: [{ model: RecruitmentRole, as: 'role' }]
    });
    if (!assignment || !assignment.isActive || assignment.role?.code !== 'TECHNICAL_INTERVIEWER') {
      throw new BadRequestError('Assigned employee must have an active TECHNICAL_INTERVIEWER role');
    }
    if (scheduledInterviewer && !scheduledInterviewer.isActive) {
      throw new BadRequestError('Selected interviewer is inactive in Employee Service');
    }
  }

  const updated = await withTransaction(async (tx) => {
    const finalStage = shouldScheduleTech ? 'TECHNICAL_INTERVIEW' : mapped.nextStage;

    await applicationRepo.updateApplication(
      organisationId,
      applicationId,
      {
        screeningStatus: mapped.screeningStatus,
        screeningNotes: input.notes || null,
        screenedBy: context.actorEmployeeId || context.actorUserId || null,
        screenedAt: new Date(),
        currentStage: finalStage
      },
      tx
    );

    await applicationRepo.addStageHistory(
      {
        organisationId,
        applicationId,
        fromStage: app.currentStage,
        toStage: mapped.nextStage,
        action: `SCREENING_${input.decision}`,
        actorUserId: context.actorUserId,
        actorRole: context.actorRole,
        internalRemark: input.notes || null,
        candidateVisibleNote:
          input.decision === 'SHORTLIST'
            ? 'Application shortlisted during recruiter screening.'
            : input.decision === 'REJECT'
            ? 'Application was not moved forward after screening.'
            : 'Application placed on hold for further review.'
      },
      tx
    );

    let scheduledInterview = null;
    if (shouldScheduleTech) {
      const createdIv = await Interview.create(
        {
          organisationId,
          applicationId,
          roundType: 'TECHNICAL',
          roundNumber: 1,
          scheduledAt: new Date(input.scheduledAt),
          durationMinutes: input.durationMinutes || 60,
          meetingMode: input.meetingMode || 'VIDEO',
          meetingLinkOrLocation: input.meetingLinkOrLocation || 'https://meet.nexnuv.local/technical-round',
          status: 'SCHEDULED',
          scheduledBy: context.actorUserId
        },
        { transaction: tx }
      );
      scheduledInterview = createdIv.get({ plain: true });

      await InterviewAssignment.create(
        {
          organisationId,
          interviewId: scheduledInterview.id,
          interviewerEmployeeId: input.technicalInterviewerEmployeeId,
          interviewerRole: 'TECHNICAL_INTERVIEWER',
          assignedBy: context.actorUserId,
          status: 'ASSIGNED'
        },
        { transaction: tx }
      );

      await applicationRepo.addStageHistory(
        {
          organisationId,
          applicationId,
          fromStage: 'SCREENING',
          toStage: 'TECHNICAL_INTERVIEW',
          action: 'TECHNICAL_INTERVIEW_SCHEDULED',
          actorUserId: context.actorUserId,
          actorRole: context.actorRole,
          candidateVisibleNote: 'Technical interview scheduled.',
          metadata: { interviewId: scheduledInterview.id }
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
        entityType: 'APPLICATION',
        entityId: applicationId,
        action: `SCREENING_${input.decision}`,
        requestId: context.requestId,
        beforeState: { currentStage: app.currentStage, screeningStatus: app.screeningStatus },
        afterState: { currentStage: finalStage, screeningStatus: mapped.screeningStatus }
      },
      tx
    );

    return { scheduledInterview };
  });

  if (input.decision === 'SHORTLIST') {
    await notificationAdapter.dispatchNotification({
      eventType: 'CANDIDATE_SHORTLISTED',
      organisationId,
      recipientEmail: app.candidate.email,
      recipientName: app.candidate.fullName,
      requestId: context.requestId,
      payload: {
        applicationReference: app.applicationReference,
        jobTitle: app.job.title
      }
    });
  } else if (input.decision === 'REJECT') {
    await notificationAdapter.dispatchNotification({
      eventType: 'CANDIDATE_REJECTED',
      organisationId,
      recipientEmail: app.candidate.email,
      recipientName: app.candidate.fullName,
      requestId: context.requestId,
      payload: {
        applicationReference: app.applicationReference,
        jobTitle: app.job.title,
        stage: 'SCREENING'
      }
    });
  }

  if (updated.scheduledInterview) {
    await notificationAdapter.dispatchNotification({
      eventType: 'INTERVIEW_SCHEDULED',
      organisationId,
      recipientEmail: app.candidate.email,
      recipientName: app.candidate.fullName,
      requestId: context.requestId,
      payload: {
        interviewId: updated.scheduledInterview.id,
        roundType: 'TECHNICAL',
        scheduledAt: updated.scheduledInterview.scheduledAt,
        meetingLinkOrLocation: updated.scheduledInterview.meetingLinkOrLocation
      }
    });

    if (scheduledInterviewer?.email) {
      await notificationAdapter.dispatchNotification({
        eventType: 'INTERVIEW_SCHEDULED',
        organisationId,
        recipientUserId: scheduledInterviewer.authUserId || scheduledInterviewer.employeeId,
        recipientEmail: scheduledInterviewer.email,
        recipientName: scheduledInterviewer.fullName,
        requestId: context.requestId,
        payload: {
          interviewId: updated.scheduledInterview.id,
          candidateName: app.candidate.fullName,
          jobTitle: app.job.title,
          roundType: 'TECHNICAL',
          scheduledAt: updated.scheduledInterview.scheduledAt
        }
      });
    }
  }

  return getOrganisationApplicationDetail(organisationId, applicationId);
}

async function recordFinalDecision(organisationId, applicationId, input, context = {}) {
  const app = await applicationRepo.findApplicationById(organisationId, applicationId);
  if (!app) {
    throw new NotFoundError('Application not found in organisation');
  }

  if (!['MANAGERIAL_INTERVIEW', 'TECHNICAL_INTERVIEW', 'FINAL_SELECTION', 'ON_HOLD'].includes(app.currentStage)) {
    throw new ConflictError(`Cannot record final selection from stage ${app.currentStage}`);
  }

  const nextStage =
    input.decision === 'SELECTED'
      ? 'FINAL_SELECTION'
      : input.decision === 'REJECTED'
      ? 'REJECTED'
      : 'ON_HOLD';

  await withTransaction(async (tx) => {
    await applicationRepo.updateApplication(
      organisationId,
      applicationId,
      {
        currentStage: nextStage,
        finalDecisionBy: context.actorEmployeeId || context.actorUserId || null,
        finalDecisionAt: new Date(),
        finalDecisionNotes: input.notes || null
      },
      tx
    );

    await applicationRepo.addStageHistory(
      {
        organisationId,
        applicationId,
        fromStage: app.currentStage,
        toStage: nextStage,
        action: `FINAL_DECISION_${input.decision}`,
        actorUserId: context.actorUserId,
        actorRole: context.actorRole,
        internalRemark: input.notes || null,
        candidateVisibleNote:
          input.decision === 'SELECTED'
            ? 'Selected in final evaluation! Moving to offer processing.'
            : input.decision === 'REJECTED'
            ? 'Thank you for interviewing. We are not moving forward at this time.'
            : 'Application placed on hold following final review.'
      },
      tx
    );

    await auditService.recordAudit(
      {
        organisationId,
        actorUserId: context.actorUserId,
        actorEmployeeId: context.actorEmployeeId,
        actorRole: context.actorRole,
        entityType: 'APPLICATION',
        entityId: applicationId,
        action: `FINAL_DECISION_${input.decision}`,
        requestId: context.requestId,
        beforeState: { currentStage: app.currentStage },
        afterState: { currentStage: nextStage }
      },
      tx
    );
  });

  if (input.decision === 'SELECTED') {
    await notificationAdapter.dispatchNotification({
      eventType: 'FINAL_SELECTION',
      organisationId,
      recipientEmail: app.candidate.email,
      recipientName: app.candidate.fullName,
      requestId: context.requestId,
      payload: {
        applicationReference: app.applicationReference,
        jobTitle: app.job.title
      }
    });
  } else if (input.decision === 'REJECTED') {
    await notificationAdapter.dispatchNotification({
      eventType: 'CANDIDATE_REJECTED',
      organisationId,
      recipientEmail: app.candidate.email,
      recipientName: app.candidate.fullName,
      requestId: context.requestId,
      payload: {
        applicationReference: app.applicationReference,
        jobTitle: app.job.title,
        stage: 'FINAL_SELECTION'
      }
    });
  }

  return getOrganisationApplicationDetail(organisationId, applicationId);
}

module.exports = {
  submitPublicApplication,
  listOrganisationApplications,
  getOrganisationApplicationDetail,
  screenApplication,
  recordFinalDecision
};
