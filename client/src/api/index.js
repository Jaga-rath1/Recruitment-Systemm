import httpClient from './httpClient';

export const authApi = {
  login: (payload) => httpClient.post('/auth/login', payload),
  candidateLogin: (payload) => httpClient.post('/auth/candidate/login', payload),
  platformAdminLogin: (payload) => httpClient.post('/auth/platform-admin/login', payload),
  orgAdminLogin: (payload) => httpClient.post('/auth/org-admin/login', payload),
  recruiterLogin: (payload) => httpClient.post('/auth/recruiter/login', payload),
  registerCandidate: (payload) => httpClient.post('/auth/candidate/register', payload),
  verifyCandidateEmail: (payload) => httpClient.post('/auth/candidate/verify-email', payload),
  resendCandidateVerification: (payload) => httpClient.post('/auth/candidate/resend-verification', payload),
  forgotCandidatePassword: (payload) => httpClient.post('/auth/candidate/forgot-password', payload),
  resetCandidatePassword: (payload) => httpClient.post('/auth/candidate/reset-password', payload),
  changeCandidatePassword: (payload) => httpClient.post('/auth/candidate/change-password', payload),
  me: () => httpClient.get('/auth/me')
};

export const subscriptionApi = {
  create: (payload, idempotencyKey) =>
    httpClient.post('/subscriptions', payload, {
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}
    }),
  activateTrial: (payload) => httpClient.post('/subscriptions/trial', payload),
  getPlans: () => httpClient.get('/subscriptions/plans'),
  getCurrentStatus: () => httpClient.get('/subscriptions/current'),
  getStatus: (id) => httpClient.get(`/subscriptions/${id}`),
  submitPaymentProof: (id, formData) => httpClient.post(`/subscriptions/${id}/payments`, formData),
  activateAccount: (payload) => httpClient.post('/subscriptions/activate', payload),
  listAdminQueue: (params) => httpClient.get('/subscriptions/platform-admin/queue', { params }),
  listPayments: (params) => httpClient.get('/subscriptions/platform-admin/payments', { params }),
  voidPayment: (id, payload) => httpClient.post(`/subscriptions/platform-admin/payments/${id}/void`, payload),
  archivePayment: (id, payload) => httpClient.post(`/subscriptions/platform-admin/payments/${id}/archive`, payload),
  archiveBooking: (id, payload) => httpClient.post(`/subscriptions/platform-admin/${id}/archive`, payload),
  verifyPayment: (id, payload) => httpClient.post(`/subscriptions/platform-admin/${id}/verify`, payload),
  resendActivationInvitation: (id) => httpClient.post(`/subscriptions/platform-admin/${id}/resend-activation`),
  updateStatus: (id, status) => httpClient.patch(`/subscriptions/platform-admin/${id}/status`, { status }),
  inspectActivationToken: (token) => httpClient.get('/subscriptions/activate/inspect', { params: { token } }),
  listNotificationHistory: (params) => httpClient.get('/subscriptions/platform-admin/notifications', { params }),
  getNotificationDetails: (id) => httpClient.get(`/subscriptions/platform-admin/notifications/${id}`),
  clearNotificationHistory: (id, payload) => httpClient.post(`/subscriptions/platform-admin/notifications/${id}/clear`, payload),
  bulkClearNotificationHistory: (payload) => httpClient.post('/subscriptions/platform-admin/notifications/bulk-clear', payload),
  listOrganisations: (params) => httpClient.get('/subscriptions/platform-admin/organisations', { params }),
  getOrganisationDetails: (id) => httpClient.get(`/subscriptions/platform-admin/organisations/${id}`),
  resendOrgAdminActivation: (id) => httpClient.post(`/subscriptions/platform-admin/organisations/${id}/resend-activation`),
  recoverOrgAdminAccount: (id) => httpClient.post(`/subscriptions/platform-admin/organisations/${id}/recover-admin`),
  triggerOrgAdminPasswordReset: (id) => httpClient.post(`/subscriptions/platform-admin/organisations/${id}/password-reset`),
  cancelSubscription: (id, payload) => httpClient.post(`/subscriptions/platform-admin/organisations/${id}/cancel`, payload)
};

export const organisationApi = {
  getProfile: () => httpClient.get('/organisations/profile'),
  getDashboard: () => httpClient.get('/organisations/dashboard'),
  listEmployees: (params) => httpClient.get('/organisations/employees', { params }),
  addEmployee: (payload) => httpClient.post('/organisations/employees', payload),
  assignRole: (employeeId, payload) => httpClient.patch(`/organisations/employees/${employeeId}/role`, payload),
  updatePermissions: (employeeId, payload) => httpClient.patch(`/organisations/employees/${employeeId}/permissions`, payload),
  deactivateAccess: (employeeId) => httpClient.patch(`/organisations/employees/${employeeId}/deactivate`),
  reactivateAccess: (employeeId) => httpClient.patch(`/organisations/employees/${employeeId}/reactivate`),
  getActivity: (employeeId) => httpClient.get(`/organisations/employees/${employeeId}/activity`),
  resendInvitation: (employeeId) => httpClient.post(`/organisations/employees/${employeeId}/resend-invitation`),
  inspectEmployeeActivation: (token) => httpClient.get('/organisations/employees/activate/inspect', { params: { token } }),
  activateEmployee: (payload) => httpClient.post('/organisations/employees/activate', payload)
};

export const roleApi = {
  listPermissions: () => httpClient.get('/roles/permissions'),
  listRoles: () => httpClient.get('/roles'),
  createRole: (payload) => httpClient.post('/roles', payload),
  updateRolePermissions: (roleId, permissionCodes) => httpClient.put(`/roles/${roleId}/permissions`, { permissionCodes })
};

export const jobApi = {
  listPublicCareers: (params) => httpClient.get('/jobs/public/careers', { params }),
  getPublicJob: (identifier) => httpClient.get(`/jobs/public/careers/${identifier}`),
  syncHrms: () => httpClient.post('/jobs/hrms/sync'),
  listOrgJobs: (params) => httpClient.get('/jobs', { params }),
  getOrgJob: (id) => httpClient.get(`/jobs/${id}`),
  createManual: (payload) => httpClient.post('/jobs', payload),
  updateJob: (id, payload) => httpClient.patch(`/jobs/${id}`, payload),
  publish: (id) => httpClient.post(`/jobs/${id}/publish`),
  unpublish: (id) => httpClient.post(`/jobs/${id}/unpublish`),
  close: (id) => httpClient.post(`/jobs/${id}/close`)
};

export const applicationApi = {
  applyPublic: (jobId, formData) => httpClient.post(`/applications/public/jobs/${jobId}/apply`, formData),
  list: (params) => httpClient.get('/applications', { params }),
  getById: (id) => httpClient.get(`/applications/${id}`),
  screen: (id, payload) => httpClient.post(`/applications/${id}/screen`, payload),
  finalDecision: (id, payload) => httpClient.post(`/applications/${id}/final-decision`, payload)
};

export const candidateApi = {
  list: (params) => httpClient.get('/candidates', { params }),
  getById: (id) => httpClient.get(`/candidates/${id}`)
};

export const interviewApi = {
  listAll: (params) => httpClient.get('/interviews', { params }),
  listAssignedTechnical: (params) => httpClient.get('/interviews/assigned/technical', { params }),
  listAssignedManagerial: (params) => httpClient.get('/interviews/assigned/managerial', { params }),
  schedule: (payload) => httpClient.post('/interviews', payload),
  reschedule: (id, payload) => httpClient.patch(`/interviews/${id}/reschedule`, payload),
  submitFeedback: (id, payload) => httpClient.post(`/interviews/${id}/feedback`, payload)
};

export const offerApi = {
  list: (params) => httpClient.get('/offers', { params }),
  getById: (id) => httpClient.get(`/offers/${id}`),
  create: (formData) => httpClient.post('/offers', formData),
  uploadLetter: (id, formData) => httpClient.post(`/offers/${id}/letter`, formData),
  send: (id) => httpClient.post(`/offers/${id}/send`)
};

export const joiningApi = {
  list: (params) => httpClient.get('/joining', { params }),
  initiate: (formData) => httpClient.post('/joining', formData),
  uploadLetter: (id, formData) => httpClient.post(`/joining/${id}/letter`, formData),
  updateStatus: (id, payload) => httpClient.patch(`/joining/${id}/status`, payload)
};

export const portalApi = {
  getOverview: () => httpClient.get('/portal/overview'),
  updateProfile: (payload) => httpClient.patch('/portal/profile', payload),
  claimApplication: (payload) => httpClient.post('/portal/claims', payload),
  respondOffer: (offerId, payload) => httpClient.post(`/portal/offers/${offerId}/respond`, payload)
};

export const reportApi = {
  getSummary: () => httpClient.get('/reports/summary'),
  getAuditLogs: (params) => httpClient.get('/audit-logs', { params })
};

export { platformApi, platformHttpClient } from './platformApi';


