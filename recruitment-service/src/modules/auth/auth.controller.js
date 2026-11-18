'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/apiResponse');
const authAdapter = require('../../integrations/auth/auth.adapter');
const organisationAdapter = require('../../integrations/organisation/organisation.adapter');
const candidateIdentityService = require('../candidate/candidateIdentity.service');
const orgAdminRecoveryService = require('../subscription/platformAdminOrganisationRecovery.service');
const employeePasswordResetService = require('../organisation/employeePasswordReset.service');
const authPortalService = require('./authPortal.service');
const { resolveEffectivePermissions } = require('../../middleware/rbac');

function requestMeta(req) {
  return {
    requestId: req.requestId,
    ipAddress: req.ip || null,
    userAgent: req.get('user-agent') || null
  };
}

const login = asyncHandler(async (req, res) => {
  const result = await authAdapter.registerOrLoginCandidate({
    email: req.body.email,
    password: req.body.password,
    mode: 'login',
    ...requestMeta(req)
  });
  return sendSuccess(res, {
    message: 'Login successful',
    data: result
  });
});

const candidateLogin = asyncHandler(async (req, res) => {
  const result = await authPortalService.authenticateCandidatePortal({
    email: req.body.email,
    password: req.body.password,
    requestMeta: requestMeta(req)
  });
  return sendSuccess(res, {
    message: 'Candidate login successful',
    data: result
  });
});

const platformAdminLogin = asyncHandler(async (req, res) => {
  const result = await authPortalService.authenticatePlatformAdminPortal({
    email: req.body.email,
    password: req.body.password,
    requestMeta: requestMeta(req)
  });
  return sendSuccess(res, {
    message: 'Platform Admin login successful',
    data: result
  });
});

const orgAdminLogin = asyncHandler(async (req, res) => {
  const result = await authPortalService.authenticateOrgAdminPortal({
    email: req.body.email,
    password: req.body.password,
    requestMeta: requestMeta(req)
  });
  return sendSuccess(res, {
    message: 'Organisation Admin login successful',
    data: result
  });
});

const recruiterLogin = asyncHandler(async (req, res) => {
  const result = await authPortalService.authenticateRecruiterPortal({
    email: req.body.email,
    password: req.body.password,
    requestMeta: requestMeta(req)
  });
  return sendSuccess(res, {
    message: 'Recruiter login successful',
    data: result
  });
});

const candidateRegister = asyncHandler(async (req, res) => {
  const result = await authAdapter.registerOrLoginCandidate({
    fullName: req.body.fullName,
    email: req.body.email,
    password: req.body.password,
    mode: 'register',
    ...requestMeta(req)
  });
  return sendSuccess(res, {
    statusCode: 201,
    message: 'Candidate account registered. Please verify your email with the 6-digit code sent to your inbox.',
    data: result
  });
});

const verifyCandidateEmail = asyncHandler(async (req, res) => {
  const result = await candidateIdentityService.verifyCandidateEmail({
    email: req.body.email,
    otp: req.body.otp,
    ...requestMeta(req)
  });
  return sendSuccess(res, {
    message: 'Candidate email verified successfully. You may now sign in.',
    data: result
  });
});

const resendCandidateVerification = asyncHandler(async (req, res) => {
  const result = await candidateIdentityService.resendCandidateVerification({
    email: req.body.email,
    ...requestMeta(req)
  });
  return sendSuccess(res, {
    message: result.message,
    data: result
  });
});

const forgotCandidatePassword = asyncHandler(async (req, res) => {
  const meta = requestMeta(req);
  const result = await candidateIdentityService.requestPasswordReset({
    email: req.body.email,
    ...meta
  });

  // Also support self-service password reset for active/trial Organisation Admins and Recruiters/Employees
  const orgRes = await orgAdminRecoveryService.requestOrgAdminPasswordResetByEmail(req.body.email, meta);
  if (!orgRes?.found) {
    await employeePasswordResetService.requestEmployeePasswordResetByEmail(req.body.email, meta);
  }

  return sendSuccess(res, {
    message: result.message,
    data: result
  });
});

const resetCandidatePassword = asyncHandler(async (req, res) => {
  const meta = requestMeta(req);

  // 1. Check if token belongs to an Organisation Admin password reset
  const orgResetResult = await orgAdminRecoveryService.completeOrgAdminPasswordReset(
    {
      token: req.body.token,
      newPassword: req.body.newPassword
    },
    meta
  );

  if (orgResetResult) {
    return sendSuccess(res, {
      message: orgResetResult.message,
      data: orgResetResult
    });
  }

  // 2. Check if token belongs to a Recruiter / Hiring Team employee password reset
  const empResetResult = await employeePasswordResetService.completeEmployeePasswordReset(
    {
      token: req.body.token,
      newPassword: req.body.newPassword
    },
    meta
  );

  if (empResetResult) {
    return sendSuccess(res, {
      message: empResetResult.message,
      data: empResetResult
    });
  }

  // 3. Fall back to Candidate Portal password reset
  const result = await candidateIdentityService.resetCandidatePassword({
    token: req.body.token,
    newPassword: req.body.newPassword,
    confirmPassword: req.body.confirmPassword,
    ...meta
  });
  return sendSuccess(res, {
    message: result.message,
    data: result
  });
});

const changeCandidatePassword = asyncHandler(async (req, res) => {
  const result = await candidateIdentityService.changeCandidatePassword({
    auth: req.auth,
    currentPassword: req.body.currentPassword,
    newPassword: req.body.newPassword,
    confirmPassword: req.body.confirmPassword,
    ...requestMeta(req)
  });
  return sendSuccess(res, {
    message: result.message,
    data: result
  });
});

const getMe = asyncHandler(async (req, res) => {
  let resolvedRole = req.auth.userType;
  let permissions = [];
  let organisation = null;

  if (req.auth.userType === 'PLATFORM_ADMIN') {
    resolvedRole = 'PLATFORM_ADMIN';
    permissions = ['platform_admin:subscriptions'];
  } else if (req.auth.userType === 'CANDIDATE') {
    resolvedRole = 'CANDIDATE';
    permissions = ['candidate:self'];
  } else if (req.auth.organisationId) {
    const [resolved, org] = await Promise.all([
      resolveEffectivePermissions(req.auth, { requestId: req.requestId }),
      organisationAdapter.getOrganisation(req.auth.organisationId, {
        actor: req.auth,
        requestId: req.requestId
      })
    ]);
    if (resolved) {
      resolvedRole = resolved.roleCode;
      permissions = Array.from(resolved.permissions);
      if (!req.auth.employeeId && resolved.employeeId) {
        req.auth.employeeId = resolved.employeeId;
      }
    }
    organisation = org;
  }

  return sendSuccess(res, {
    message: 'Authenticated profile',
    data: {
      user: {
        ...req.auth,
        activeRoleCode: resolvedRole,
        permissions
      },
      organisation
    }
  });
});

module.exports = {
  login,
  candidateLogin,
  platformAdminLogin,
  orgAdminLogin,
  recruiterLogin,
  candidateRegister,
  verifyCandidateEmail,
  resendCandidateVerification,
  forgotCandidatePassword,
  resetCandidatePassword,
  changeCandidatePassword,
  getMe
};
