const { withTransaction, getModels } = require('../../config/database');
const {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError
} = require('../../utils/AppError');
const { parsePagination, buildPaginationMeta } = require('../../utils/pagination');
const interviewRepo = require('./interview.repository');
const applicationRepo = require('../application/application.repository');
const auditService = require('../audit/audit.service');
const notificationAdapter = require('../../integrations/notification/notification.adapter');
const employeeAdapter = require('../../integrations/employee/employee.adapter');
const storageAdapter = require('../../integrations/storage/storage.adapter');

async function scheduleInterview(organisationId, input, context = {}) {
  const { EmployeeRoleAssignment, RecruitmentRole } = getModels();
  const app = await applicationRepo.findApplicationById(organisationId, input.applicationId);
  if (!app) {
    throw new NotFoundError('Application not found in organisation');
  }

  if (app.currentStage === 'REJECTED' || app.currentStage === 'HIRED') {
    throw new ConflictError(`Cannot schedule interview when application is ${app.currentStage}`);
  }

  const requiredRoleCode = input.roundType === 'TECHNICAL' ? 'TECHNICAL_INTERVIEWER' : 'SENIOR_INTERVIEWER';

  if (input.roundType === 'TECHNICAL' && app.screeningStatus !== 'SHORTLISTED') {
    throw new BadRequestError('Candidate must be shortlisted during screening before scheduling a Technical Interview');
  }

  if (input.roundType === 'MANAGERIAL') {
    const hasSelectedTechFeedback = (app.feedbacks || []).some(
      (f) => f.roundType === 'TECHNICAL' && f.recommendation === 'SELECTED'
    );
    if (!hasSelectedTechFeedback) {
      throw new BadRequestError('Technical interview must result in SELECTED recommendation before scheduling Managerial Interview');
    }
  }

  const assignment = await EmployeeRoleAssignment.findOne({
    where: {
      organisationId,
      employeeId: input.interviewerEmployeeId
    },
    include: [{ model: RecruitmentRole, as: 'role' }]
  });

  if (!assignment || !assignment.isActive || assignment.role?.code !== requiredRoleCode) {
    throw new BadRequestError(`Selected interviewer must have an active ${requiredRoleCode} role`);
  }

  const interviewer = await employeeAdapter.getEmployeeById(organisationId, input.interviewerEmployeeId, {
    actorUserId: context.actorUserId,
    requestId: context.requestId
  });
  if (interviewer && !interviewer.isActive) {
    throw new BadRequestError('Selected interviewer is inactive in Employee Service');
  }

  const existingRounds = (app.interviews || []).filter((i) => i.roundType === input.roundType).length;
  const targetStage = input.roundType === 'TECHNICAL' ? 'TECHNICAL_INTERVIEW' : 'MANAGERIAL_INTERVIEW';

  const result = await withTransaction(async (tx) => {
    const { interview } = await interviewRepo.createInterviewWithAssignment(
      {
        organisationId,
        applicationId: app.id,
        roundType: input.roundType,
        roundNumber: existingRounds + 1,
        scheduledAt: new Date(input.scheduledAt),
        durationMinutes: input.durationMinutes || 60,
        meetingMode: input.meetingMode || 'VIDEO',
        meetingLinkOrLocation: input.meetingLinkOrLocation,
        status: 'SCHEDULED',
        scheduledBy: context.actorUserId
      },
      {
        organisationId,
        interviewerEmployeeId: input.interviewerEmployeeId,
        interviewerRole: requiredRoleCode,
        assignedBy: context.actorUserId,
        status: 'ASSIGNED'
      },
      tx
    );

    await applicationRepo.updateApplication(
      organisationId,
      app.id,
      { currentStage: targetStage },
      tx
    );

    await applicationRepo.addStageHistory(
      {
        organisationId,
        applicationId: app.id,
        fromStage: app.currentStage,
        toStage: targetStage,
        action: `${input.roundType}_INTERVIEW_SCHEDULED`,
        actorUserId: context.actorUserId,
        actorRole: context.actorRole,
        candidateVisibleNote: `${input.roundType === 'TECHNICAL' ? 'Technical' : 'Managerial'} interview round scheduled.`,
        metadata: { interviewId: interview.id, scheduledAt: interview.scheduledAt }
      },
      tx
    );

    await auditService.recordAudit(
      {
        organisationId,
        actorUserId: context.actorUserId,
        actorEmployeeId: context.actorEmployeeId,
        actorRole: context.actorRole,
        entityType: 'INTERVIEW',
        entityId: interview.id,
        action: `${input.roundType}_INTERVIEW_SCHEDULED`,
        requestId: context.requestId,
        afterState: {
          applicationId: app.id,
          roundType: input.roundType,
          interviewerEmployeeId: input.interviewerEmployeeId
        }
      },
      tx
    );

    return interview;
  });

  await notificationAdapter.dispatchNotification({
    eventType: 'INTERVIEW_SCHEDULED',
    organisationId,
    recipientEmail: app.candidate.email,
    recipientName: app.candidate.fullName,
    requestId: context.requestId,
    payload: {
      interviewId: result.id,
      applicationReference: app.applicationReference,
      jobTitle: app.job.title,
      roundType: input.roundType,
      scheduledAt: result.scheduledAt,
      meetingLinkOrLocation: result.meetingLinkOrLocation
    }
  });

  if (interviewer?.email) {
    await notificationAdapter.dispatchNotification({
      eventType: 'INTERVIEW_SCHEDULED',
      organisationId,
      recipientUserId: interviewer.authUserId || interviewer.employeeId,
      recipientEmail: interviewer.email,
      recipientName: interviewer.fullName,
      requestId: context.requestId,
      payload: {
        interviewId: result.id,
        candidateName: app.candidate.fullName,
        jobTitle: app.job.title,
        roundType: input.roundType,
        scheduledAt: result.scheduledAt
      }
    });
  }

  return interviewRepo.findInterviewById(organisationId, result.id);
}

async function rescheduleInterview(organisationId, interviewId, input, context = {}) {
  const existing = await interviewRepo.findInterviewById(organisationId, interviewId);
  if (!existing) {
    throw new NotFoundError('Interview not found in organisation');
  }
  if (existing.status === 'COMPLETED' || existing.status === 'CANCELLED') {
    throw new ConflictError(`Cannot reschedule an interview with status ${existing.status}`);
  }

  const updated = await withTransaction(async (tx) => {
    const record = await interviewRepo.updateInterview(
      organisationId,
      interviewId,
      {
        scheduledAt: new Date(input.scheduledAt),
        durationMinutes: input.durationMinutes ?? existing.durationMinutes,
        meetingMode: input.meetingMode ?? existing.meetingMode,
        meetingLinkOrLocation: input.meetingLinkOrLocation ?? existing.meetingLinkOrLocation,
        status: 'RESCHEDULED',
        rescheduleReason: input.reason || 'Rescheduled by recruitment team'
      },
      tx
    );

    await auditService.recordAudit(
      {
        organisationId,
        actorUserId: context.actorUserId,
        actorEmployeeId: context.actorEmployeeId,
        actorRole: context.actorRole,
        entityType: 'INTERVIEW',
        entityId: interviewId,
        action: 'INTERVIEW_RESCHEDULED',
        requestId: context.requestId,
        beforeState: { scheduledAt: existing.scheduledAt },
        afterState: { scheduledAt: record.scheduledAt, reason: record.rescheduleReason }
      },
      tx
    );

    return record;
  });

  await notificationAdapter.dispatchNotification({
    eventType: 'INTERVIEW_RESCHEDULED',
    organisationId,
    recipientEmail: existing.application.candidate.email,
    recipientName: existing.application.candidate.fullName,
    requestId: context.requestId,
    payload: {
      interviewId,
      roundType: existing.roundType,
      newScheduledAt: updated.scheduledAt,
      reason: updated.rescheduleReason
    }
  });

  return interviewRepo.findInterviewById(organisationId, interviewId);
}

async function listOrganisationInterviews(organisationId, query = {}) {
  const { page, limit, skip } = parsePagination(query);
  const { items, total } = await interviewRepo.listInterviews(organisationId, {
    roundType: query.roundType,
    status: query.status,
    applicationId: query.applicationId,
    skip,
    take: limit + 1
  });
  return buildPaginationMeta({ items, limit, total, page });
}

async function listAssignedInterviews(organisationId, employeeId, roundType, query = {}) {
  if (!employeeId) {
    throw new ForbiddenError('Employee context missing for assigned interviews');
  }
  const { page, limit, skip } = parsePagination(query);
  const { items, total } = await interviewRepo.listInterviews(organisationId, {
    roundType,
    status: query.status,
    interviewerEmployeeId: employeeId,
    skip,
    take: limit + 1
  });

  const formatted = items.map((interview) => ({
    ...interview,
    application: {
      ...interview.application,
      documents: (interview.application?.documents || []).map((doc) => ({
        ...doc,
        downloadUrl: storageAdapter.buildSignedDownloadUrl({
          storageKey: doc.storageKey,
          fileName: doc.fileName,
          mimeType: doc.mimeType,
          organisationId,
          docScope: 'INTERVIEW_RESUME',
          candidateEmail: interview.application?.candidate?.email,
          candidateAuthUserId: interview.application?.candidate?.authUserId
        })
      }))
    }
  }));

  return buildPaginationMeta({ items: formatted, limit, total, page });
}

async function submitInterviewFeedback(organisationId, interviewId, input, context = {}) {
  const { Subscription } = getModels();
  const interview = await interviewRepo.findInterviewById(organisationId, interviewId);
  if (!interview) {
    throw new NotFoundError('Interview not found in organisation');
  }

  const employeeId = context.actorEmployeeId;
  if (!employeeId) {
    throw new ForbiddenError('Employee identifier required to submit feedback');
  }

  const assigned = (interview.assignments || []).find((a) => a.interviewerEmployeeId === employeeId);
  if (!assigned) {
    throw new ForbiddenError('You can only submit feedback for interviews explicitly assigned to you');
  }

  if (interview.roundType === 'TECHNICAL' && context.actorRole !== 'TECHNICAL_INTERVIEWER' && context.actorRole !== 'ORGANISATION_ADMIN') {
    throw new ForbiddenError('Only assigned Technical Interviewer can submit Technical round feedback');
  }
  if (interview.roundType === 'MANAGERIAL' && context.actorRole !== 'SENIOR_INTERVIEWER' && context.actorRole !== 'ORGANISATION_ADMIN') {
    throw new ForbiddenError('Only assigned Senior Interviewer can submit Managerial round feedback');
  }

  const alreadySubmitted = (interview.feedbacks || []).find((f) => f.interviewerEmployeeId === employeeId);
  if (alreadySubmitted) {
    throw new ConflictError('Feedback has already been submitted for this interview');
  }

  if (interview.roundType === 'TECHNICAL' && (input.technicalSkillsRating === undefined || input.technicalSkillsRating === null)) {
    throw new BadRequestError('technicalSkillsRating is required for Technical Interview feedback');
  }

  if (
    interview.roundType === 'MANAGERIAL' &&
    (input.communicationRating === undefined ||
      input.behaviouralRating === undefined ||
      input.problemSolvingRating === undefined ||
      input.leadershipRating === undefined)
  ) {
    throw new BadRequestError(
      'communicationRating, behaviouralRating, problemSolvingRating, and leadershipRating are required for Managerial Interview feedback'
    );
  }

  const feedback = await withTransaction(async (tx) => {
    const created = await interviewRepo.createFeedback(
      {
        organisationId,
        interviewId,
        applicationId: interview.applicationId,
        interviewerEmployeeId: employeeId,
        roundType: interview.roundType,
        overallRating: input.overallRating,
        technicalSkillsRating: input.technicalSkillsRating ?? null,
        communicationRating: input.communicationRating ?? null,
        behaviouralRating: input.behaviouralRating ?? null,
        problemSolvingRating: input.problemSolvingRating ?? null,
        leadershipRating: input.leadershipRating ?? null,
        strengths: input.strengths.trim(),
        weaknesses: input.weaknesses.trim(),
        detailedFeedback: input.detailedFeedback.trim(),
        recommendation: input.recommendation
      },
      tx
    );

    await interviewRepo.updateInterview(organisationId, interviewId, { status: 'COMPLETED' }, tx);
    await interviewRepo.updateAssignmentStatus(interviewId, employeeId, 'COMPLETED', tx);

    await applicationRepo.addStageHistory(
      {
        organisationId,
        applicationId: interview.applicationId,
        fromStage: interview.application.currentStage,
        toStage: interview.application.currentStage,
        action: `${interview.roundType}_FEEDBACK_SUBMITTED`,
        actorUserId: context.actorUserId,
        actorRole: context.actorRole,
        internalRemark: `Recommendation: ${input.recommendation} | Rating: ${input.overallRating}/10`,
        candidateVisibleNote: `${interview.roundType === 'TECHNICAL' ? 'Technical' : 'Managerial'} interview completed.`,
        metadata: { interviewId, recommendation: input.recommendation }
      },
      tx
    );

    await auditService.recordAudit(
      {
        organisationId,
        actorUserId: context.actorUserId,
        actorEmployeeId: employeeId,
        actorRole: context.actorRole,
        entityType: 'INTERVIEW_FEEDBACK',
        entityId: created.id,
        action: `${interview.roundType}_FEEDBACK_SUBMITTED`,
        requestId: context.requestId,
        afterState: {
          interviewId,
          applicationId: interview.applicationId,
          overallRating: created.overallRating,
          recommendation: created.recommendation
        }
      },
      tx
    );

    return created;
  });

  const schedulerEmployees = await employeeAdapter.listEmployees(organisationId);
  const scheduler =
    schedulerEmployees.find((e) => e.authUserId === interview.scheduledBy || e.employeeId === interview.scheduledBy) ||
    null;
  const subRecord = !scheduler?.email
    ? await Subscription.findOne({ where: { organisationId }, order: [['createdAt', 'DESC']], attributes: ['adminEmail', 'adminName'] })
    : null;
  const recipientEmail = scheduler?.email || subRecord?.adminEmail || null;

  if (recipientEmail) {
    await notificationAdapter.dispatchNotification({
      eventType: 'INTERVIEW_FEEDBACK_SUBMITTED',
      organisationId,
      recipientEmail,
      recipientName: scheduler?.fullName || subRecord?.adminName || 'Recruitment Team',
      requestId: context.requestId,
      payload: {
        interviewId,
        applicationId: interview.applicationId,
        applicationReference: interview.application.applicationReference,
        roundType: interview.roundType,
        recommendation: feedback.recommendation
      }
    });
  }

  return feedback;
}

module.exports = {
  scheduleInterview,
  rescheduleInterview,
  listOrganisationInterviews,
  listAssignedInterviews,
  submitInterviewFeedback
};
