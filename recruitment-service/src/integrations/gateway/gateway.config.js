const crypto = require('crypto');
const env = require('../../config/env');

const TRUSTED_GATEWAY_HEADERS = [
  'x-user-id',
  'x-user-role',
  'x-user-email',
  'x-user-name',
  'x-organization-id',
  'x-tenant-id',
  'x-industry-id',
  'x-internal-token',
  'x-service-name'
];

const GATEWAY_ROUTES_MANIFEST = {
  service: 'recruitment-service',
  envVar: 'RECRUITMENT_SERVICE_URL',
  defaultUrl: `http://localhost:${env.port}`,
  apiPrefix: env.apiPrefix,
  publicBypassPaths: [
    'GET /api/v1/jobs/public/careers',
    'GET /api/v1/jobs/public/careers/:identifier',
    'POST /api/v1/applications/public/jobs/:jobId/apply',
    'POST /api/v1/subscriptions',
    'GET /api/v1/subscriptions/:id',
    'POST /api/v1/subscriptions/:id/payments',
    'POST /api/v1/subscriptions/activate'
  ],
  candidateAuthBypassPaths: [
    '/api/v1/portal',
    '/api/v1/files/download',
    'POST /api/v1/auth/candidate/register',
    'POST /api/v1/auth/candidate/login',
    'POST /api/v1/auth/candidate/verify-email',
    'POST /api/v1/auth/candidate/resend-verification',
    'POST /api/v1/auth/candidate/forgot-password',
    'POST /api/v1/auth/candidate/reset-password',
    'POST /api/v1/auth/candidate/change-password'
  ],
  protectedGatewayPaths: [
    '/api/v1/jobs',
    '/api/v1/candidates',
    '/api/v1/applications',
    '/api/v1/interviews',
    '/api/v1/offers',
    '/api/v1/joining',
    '/api/v1/organisations',
    '/api/v1/roles',
    '/api/v1/reports',
    '/api/v1/audit-logs',
    '/api/v1/subscriptions/platform-admin'
  ],
  gatewayIntegrationNotes: [
    'api-gateway already mounts /api/v1/auth -> AUTH (4001); mount /api/v1/auth/candidate -> RECRUITMENT before /api/v1/auth if routing candidate registration via Gateway.',
    'Candidate Portal (/api/v1/portal/*) validates Recruitment CANDIDATE_JWT_SECRET against candidate_accounts and must use stripTrustedHeaders instead of Gateway protect ([verifyToken, verifySession]).',
    'Public routes (/api/v1/jobs/public/careers, /api/v1/applications/public, /api/v1/files/download, non-admin /api/v1/subscriptions) must mount with stripTrustedHeaders before protected path prefixes.'
  ]
};

function safeTokenEquals(a, b) {
  if (!a || !b) return false;
  const bufA = Buffer.from(String(a), 'utf8');
  const bufB = Buffer.from(String(b), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function mapSharedRoleToRecruitmentContext(sharedRole) {
  const normalized = String(sharedRole || '').trim().toLowerCase().replace(/[-\s]+/g, '_');
  if (normalized === 'super_admin' || normalized === 'platform_admin' || normalized === 'superadmin') {
    return {
      userType: 'PLATFORM_ADMIN',
      roles: ['PLATFORM_ADMIN'],
      sharedRole: normalized
    };
  }
  if (normalized === 'candidate') {
    return {
      userType: 'CANDIDATE',
      roles: ['CANDIDATE'],
      sharedRole: normalized
    };
  }

  const roleMap = {
    org_admin: 'ORGANISATION_ADMIN',
    organization_admin: 'ORGANISATION_ADMIN',
    hr: 'RECRUITER',
    recruiter: 'RECRUITER',
    manager: 'SENIOR_INTERVIEWER',
    technical_interviewer: 'TECHNICAL_INTERVIEWER',
    senior_interviewer: 'SENIOR_INTERVIEWER',
    employee: 'EMPLOYEE',
    agent: 'EMPLOYEE',
    service_manager: 'EMPLOYEE'
  };

  const mappedRole = roleMap[normalized] || (normalized ? normalized.toUpperCase() : 'EMPLOYEE');
  return {
    userType: 'ORG_USER',
    roles: [mappedRole],
    sharedRole: normalized || null
  };
}

function isTrustedGatewayRequest(req) {
  const token = req?.headers?.['x-internal-token'];
  const expected = env.services.internalToken;
  return Boolean(expected && token && safeTokenEquals(token, expected));
}

function extractGatewayContext(req) {
  if (!isTrustedGatewayRequest(req)) return null;

  const userId = req.headers['x-user-id'];
  if (!userId || userId === 'guest') return null;

  const sharedRole = req.headers['x-user-role'] || '';
  const mapped = mapSharedRoleToRecruitmentContext(sharedRole);
  const organizationId = req.headers['x-organization-id'] || req.headers['x-tenant-id'] || null;

  return {
    userId,
    email: req.headers['x-user-email'] || '',
    name: req.headers['x-user-name'] || req.headers['x-user-email'] || userId,
    organisationId: organizationId === '00000000-0000-0000-0000-000000000001' ? null : organizationId,
    employeeId: req.headers['x-employee-id'] || null,
    userType: mapped.userType,
    roles: mapped.roles,
    sharedRole: mapped.sharedRole,
    viaGateway: true
  };
}

function buildServiceIdentityHeaders(organisationId, actor = {}) {
  return {
    'x-user-id': actor.userId || 'svc-recruitment',
    'x-user-role': actor.role || 'super_admin',
    'x-user-email': actor.email || 'recruitment@nexnuv.internal',
    ...(organisationId ? { 'x-organization-id': organisationId, 'x-tenant-id': organisationId } : {})
  };
}

module.exports = {
  TRUSTED_GATEWAY_HEADERS,
  GATEWAY_ROUTES_MANIFEST,
  mapSharedRoleToRecruitmentContext,
  isTrustedGatewayRequest,
  extractGatewayContext,
  buildServiceIdentityHeaders
};

