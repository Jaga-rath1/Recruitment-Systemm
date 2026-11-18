const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const env = require('../../config/env');
const { getModels, isDatabaseInitialized } = require('../../config/database');
const logger = require('../../config/logger');
const { requestJson } = require('../common/httpClient');
const {
  CANDIDATE_JWT_ISSUER,
  CANDIDATE_JWT_AUDIENCE,
  hashPassword,
  verifyPassword,
  signCandidateToken
} = require('../../utils/candidateSecurity');
const candidateIdentityService = require('../../modules/candidate/candidateIdentity.service');
const {
  extractGatewayContext,
  mapSharedRoleToRecruitmentContext
} = require('../gateway/gateway.config');
const {
  UnauthorizedError,
  BadRequestError,
  ForbiddenError,
  ConflictError,
  ServiceUnavailableError
} = require('../../utils/AppError');

// Standalone dev/test credential store (used ONLY when INTEGRATION_MODE=standalone for org/admin users)
const standaloneUsersByEmail = new Map();
const standaloneUsersById = new Map();
const STANDALONE_AUTH_STORE_PATH = path.resolve(__dirname, '../../../storage/.standalone-auth-users.json');

function shouldPersistStandaloneStore() {
  return env.integrationMode === 'standalone' && process.env.NODE_ENV !== 'test';
}

function saveStandaloneUsersToDisk() {
  if (!shouldPersistStandaloneStore()) return;
  try {
    const dir = path.dirname(STANDALONE_AUTH_STORE_PATH);
    fs.mkdirSync(dir, { recursive: true });
    const serialized = Array.from(standaloneUsersByEmail.values());
    fs.writeFileSync(STANDALONE_AUTH_STORE_PATH, JSON.stringify(serialized, null, 2), 'utf8');
  } catch (err) {
    logger.warn({ err: err.message }, '[Standalone Auth Adapter] Failed to persist standalone users store');
  }
}

function loadStandaloneUsersFromDisk() {
  if (!shouldPersistStandaloneStore()) return;
  try {
    if (!fs.existsSync(STANDALONE_AUTH_STORE_PATH)) return;
    const raw = fs.readFileSync(STANDALONE_AUTH_STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      for (const rec of parsed) {
        if (rec && rec.email && rec.userId) {
          const normalized = String(rec.email).trim().toLowerCase();
          standaloneUsersByEmail.set(normalized, { ...rec, email: normalized });
          standaloneUsersById.set(rec.userId, { ...rec, email: normalized });
        }
      }
    }
  } catch (err) {
    logger.warn({ err: err.message }, '[Standalone Auth Adapter] Failed to load standalone users store');
  }
}

function initDefaultStandaloneUsers() {
  if (env.integrationMode === 'standalone' && env.nodeEnv !== 'production') {
    const adminEmail = 'platformadmin@nexnuv.com';
    const adminRecord = {
      userId: '7112e443-6b55-4ae5-81a6-a35f28c042a4',
      email: adminEmail,
      name: 'Platform Administrator',
      organisationId: null,
      employeeId: null,
      userType: 'PLATFORM_ADMIN',
      roles: ['PLATFORM_ADMIN'],
      passwordHash: hashPassword('Welcome@123'),
      isActive: true
    };
    standaloneUsersByEmail.set(adminEmail, adminRecord);
    standaloneUsersById.set(adminRecord.userId, adminRecord);

    const superAdminEmail = 'superadmin@nexnuv.com';
    const superAdminRecord = {
      userId: '8223f554-7c66-5bf6-92b7-b46f39d153b5',
      email: superAdminEmail,
      name: 'Super Administrator',
      organisationId: null,
      employeeId: null,
      userType: 'PLATFORM_ADMIN',
      roles: ['PLATFORM_ADMIN', 'SUPER_ADMIN'],
      passwordHash: hashPassword('SuperAdmin@2026!'),
      isActive: true
    };
    standaloneUsersByEmail.set(superAdminEmail, superAdminRecord);
    standaloneUsersById.set(superAdminRecord.userId, superAdminRecord);
  }
  loadStandaloneUsersFromDisk();
}
initDefaultStandaloneUsers();

function signAccessToken(claims) {
  return jwt.sign(claims, env.jwt.secret, {
    algorithm: 'HS256',
    issuer: env.jwt.issuer,
    audience: env.jwt.audience,
    expiresIn: env.jwt.expiresIn
  });
}

function mapRoleCodeToSharedAuthRole(roleCode = '') {
  const code = String(roleCode).toUpperCase();
  if (code === 'ORGANISATION_ADMIN') return 'org_admin';
  if (code === 'RECRUITER') return 'hr';
  if (code === 'SENIOR_INTERVIEWER') return 'manager';
  if (code === 'TECHNICAL_INTERVIEWER') return 'employee';
  return 'employee';
}

function normalizeSharedUser(user) {
  if (!user) return null;
  const mapped = mapSharedRoleToRecruitmentContext(user.role);
  return {
    userId: user.id || user.userId,
    email: user.email,
    name: user.name || [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email,
    organisationId: user.organizationId || user.organisationId || null,
    employeeId: user.employeeId || null,
    userType: mapped.userType,
    roles: mapped.roles,
    sharedRole: mapped.sharedRole,
    mustChangePassword: Boolean(user.mustChangePassword)
  };
}

// Synchronous helper preserved for standalone unit/middleware usage
function verifyAccessToken(token) {
  if (!token) {
    throw new UnauthorizedError('Missing bearer token');
  }

  const unverified = jwt.decode(token);
  if (unverified && unverified.aud === CANDIDATE_JWT_AUDIENCE) {
    try {
      const decoded = jwt.verify(token, env.jwt.candidateSecret, {
        algorithms: ['HS256'],
        issuer: CANDIDATE_JWT_ISSUER,
        audience: CANDIDATE_JWT_AUDIENCE
      });
      if (
        decoded.userType !== 'CANDIDATE' ||
        decoded.organisationId ||
        decoded.employeeId ||
        (!decoded.sub && !decoded.userId)
      ) {
        throw new UnauthorizedError('Invalid candidate token claims');
      }
      return {
        userId: decoded.sub || decoded.userId,
        email: decoded.email,
        name: decoded.name || decoded.email,
        organisationId: null,
        employeeId: null,
        userType: 'CANDIDATE',
        roles: ['CANDIDATE'],
        sharedRole: 'candidate',
        tokenVersion: Number(decoded.tokenVersion || 1),
        emailVerified: Boolean(decoded.emailVerified)
      };
    } catch (err) {
      if (err instanceof UnauthorizedError) throw err;
      throw new UnauthorizedError(`Invalid or expired token: ${err.message}`);
    }
  }

  if (env.integrationMode === 'live') {
    throw new Error('Live mode requires async verifyRequestAuth() so Auth Service validates the token');
  }

  try {
    const key = env.jwt.publicKey || env.jwt.secret;
    const allowedAlgorithms = env.jwt.publicKey ? ['RS256', 'RS384', 'RS512', 'ES256', 'HS256'] : ['HS256'];
    const decoded = jwt.verify(token, key, {
      algorithms: allowedAlgorithms,
      issuer: env.jwt.issuer,
      audience: env.jwt.audience
    });
    if (decoded.userType === 'CANDIDATE' || decoded.aud === CANDIDATE_JWT_AUDIENCE) {
      throw new UnauthorizedError('Candidate token cannot be verified as administrative token');
    }
    return {
      userId: decoded.sub || decoded.userId,
      email: decoded.email,
      name: decoded.name || decoded.email,
      organisationId: decoded.organisationId || decoded.organizationId || null,
      employeeId: decoded.employeeId || null,
      userType: decoded.userType || 'ORG_USER',
      roles: Array.isArray(decoded.roles) ? decoded.roles : [],
      sharedRole: decoded.role || null
    };
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
    throw new UnauthorizedError(`Invalid or expired token: ${err.message}`);
  }
}

async function verifyRequestAuth(req) {
  const authHeader = req.headers?.authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (bearerToken) {
    const decodedPreview = jwt.decode(bearerToken);
    if (!decodedPreview || typeof decodedPreview !== 'object') {
      throw new UnauthorizedError('Invalid or malformed bearer token');
    }
    if (decodedPreview.aud === CANDIDATE_JWT_AUDIENCE) {
      const verifiedCandidate = verifyAccessToken(bearerToken);
      if (!isDatabaseInitialized()) {
        throw new ServiceUnavailableError(
          'Candidate session store is unavailable',
          'SESSION_STORE_UNAVAILABLE'
        );
      }

      const { CandidateAccount } = getModels();
      let account;
      try {
        account = await CandidateAccount.findByPk(verifiedCandidate.userId, {
          attributes: [
            'id',
            'email',
            'fullName',
            'isActive',
            'emailVerified',
            'emailVerifiedAt',
            'passwordChangedAt',
            'lastLoginAt',
            'tokenVersion'
          ]
        });
      } catch (_err) {
        throw new ServiceUnavailableError(
          'Candidate session verification failed due to database unavailability',
          'SESSION_STORE_UNAVAILABLE'
        );
      }

      if (!account || !account.isActive) {
        throw new UnauthorizedError('Candidate account is inactive or no longer exists', 'ACCOUNT_INACTIVE');
      }
      if (!account.emailVerified) {
        throw new UnauthorizedError('Candidate email address is not verified', 'EMAIL_NOT_VERIFIED');
      }
      if (Number(verifiedCandidate.tokenVersion) !== Number(account.tokenVersion)) {
        throw new UnauthorizedError('Candidate session has been revoked. Please sign in again.', 'SESSION_REVOKED');
      }

      verifiedCandidate.email = account.email;
      verifiedCandidate.name = account.fullName || verifiedCandidate.name;
      verifiedCandidate.emailVerified = true;
      verifiedCandidate.emailVerifiedAt = account.emailVerifiedAt || null;
      verifiedCandidate.passwordChangedAt = account.passwordChangedAt || null;
      verifiedCandidate.lastLoginAt = account.lastLoginAt || null;
      return verifiedCandidate;
    }

    if (env.integrationMode === 'standalone') {
      try {
        const verified = verifyAccessToken(bearerToken);
        const standaloneRecord = standaloneUsersById.get(verified.userId);
        if (standaloneRecord && standaloneRecord.isActive === false) {
          throw new UnauthorizedError('This account is no longer active');
        }
        return verified;
      } catch (localErr) {
        if (localErr instanceof UnauthorizedError && localErr.message === 'This account is no longer active') {
          throw localErr;
        }
        if (env.services.authUrl) {
          try {
            const res = await requestJson({
              serviceName: 'Auth Service',
              baseUrl: env.services.authUrl,
              method: 'GET',
              path: '/api/v1/auth/me',
              authorization: `Bearer ${bearerToken}`,
              requestId: req.requestId
            });
            const sharedUser = res.data?.user;
            if (sharedUser) {
              if (sharedUser.mustChangePassword) {
                throw new ForbiddenError(
                  'You must change your temporary password before continuing',
                  'PASSWORD_CHANGE_REQUIRED'
                );
              }
              return normalizeSharedUser(sharedUser);
            }
          } catch (upstreamErr) {
            if (upstreamErr instanceof ForbiddenError) throw upstreamErr;
          }
        }
        throw localErr;
      }
    }

    // Never assume JWT_SECRET is shared: delegate JWT verification & active-account check to Auth Service /me
    const res = await requestJson({
      serviceName: 'Auth Service',
      baseUrl: env.services.authUrl,
      method: 'GET',
      path: '/api/v1/auth/me',
      authorization: `Bearer ${bearerToken}`,
      requestId: req.requestId
    });

    const sharedUser = res.data?.user;
    if (!sharedUser) {
      throw new UnauthorizedError('Auth Service did not return an authenticated user');
    }
    if (sharedUser.mustChangePassword) {
      throw new ForbiddenError(
        'You must change your temporary password before continuing',
        'PASSWORD_CHANGE_REQUIRED'
      );
    }
    return normalizeSharedUser(sharedUser);
  }

  // Gateway-proxied request authenticated with shared x-internal-token & x-user-* headers
  const gatewayCtx = extractGatewayContext(req);
  if (gatewayCtx) {
    if (env.integrationMode === 'live') {
      const stateRes = await requestJson({
        serviceName: 'Auth Service',
        baseUrl: env.services.authUrl,
        method: 'GET',
        path: `/api/v1/auth/internal/accounts/${encodeURIComponent(gatewayCtx.userId)}`,
        requestId: req.requestId
      });
      const state = stateRes.data?.data;
      if (!state || state.status !== 'active') {
        throw new UnauthorizedError('This account is no longer active');
      }
      if (String(state.role || '').trim().toLowerCase() === 'candidate') {
        throw new UnauthorizedError('Candidate identities must authenticate via Candidate Portal tokens');
      }
      const mapped = mapSharedRoleToRecruitmentContext(state.role);
      return {
        userId: gatewayCtx.userId,
        email: gatewayCtx.email,
        name: gatewayCtx.name,
        organisationId: state.organizationId || null,
        employeeId: gatewayCtx.employeeId,
        userType: mapped.userType,
        roles: mapped.roles,
        sharedRole: mapped.sharedRole,
        viaGateway: true
      };
    }
    return gatewayCtx;
  }

  throw new UnauthorizedError('Missing Authorization Bearer token');
}

async function sendAccountActivationInvitation({ organisationId, email, fullName, activationToken, expiresAt }) {
  const activationLink = `${env.clientAppUrl}/activate-account?token=${encodeURIComponent(activationToken)}`;

  if (env.integrationMode === 'live') {
    // Auth Service has no org-admin passwordless invite endpoint; Notification Service delivers the link
    // and provisionOrgAdminAccount creates + sets password on Auth Service upon token redemption.
    logger.info(
      { organisationId, email, expiresAt },
      '[Live Auth Adapter] Prepared passwordless org admin activation link'
    );
    return {
      dispatched: true,
      mode: 'live',
      activationLink
    };
  }

  logger.info(
    { organisationId, email, expiresAt },
    '[Standalone Auth Adapter] Prepared passwordless org admin activation invitation'
  );
  return {
    dispatched: true,
    mode: 'standalone',
    activationLink
  };
}

async function provisionOrgAdminAccount({
  organisationId,
  employeeId,
  email,
  fullName,
  password,
  requestId = null
}) {
  const normalizedEmail = email.trim().toLowerCase();

  if (env.integrationMode === 'live') {
    const provRes = await requestJson({
      serviceName: 'Auth Service',
      baseUrl: env.services.authUrl,
      method: 'POST',
      path: '/api/v1/auth/internal/provision-agent',
      requestId,
      body: {
        email: normalizedEmail,
        name: fullName,
        role: 'org_admin',
        organizationId,
        forceResetPassword: true
      }
    });

    const provData = provRes.data?.data || provRes.data;
    const createdUser = provData?.user;
    const tempPassword = provData?.tempPassword;

    if (!createdUser) {
      throw new BadRequestError('Auth Service failed to provision organisation admin user');
    }

    let finalToken = null;
    let finalUser = createdUser;

    if (tempPassword && password) {
      const tempLoginRes = await requestJson({
        serviceName: 'Auth Service',
        baseUrl: env.services.authUrl,
        method: 'POST',
        path: '/api/v1/auth/login',
        requestId,
        body: { email: normalizedEmail, password: tempPassword }
      });

      const tempToken = tempLoginRes.data?.token;
      if (tempToken) {
        const setupRes = await requestJson({
          serviceName: 'Auth Service',
          baseUrl: env.services.authUrl,
          method: 'POST',
          path: '/api/v1/auth/setup-password',
          authorization: `Bearer ${tempToken}`,
          requestId,
          body: {
            temporaryPassword: tempPassword,
            newPassword: password,
            confirmPassword: password
          }
        });
        finalToken = setupRes.data?.token || null;
        finalUser = setupRes.data?.user || finalUser;
      }
    }

    return {
      userId: finalUser.id || createdUser.id,
      email: normalizedEmail,
      organisationId,
      employeeId: employeeId || finalUser.employeeId || null,
      token: finalToken,
      sharedUser: normalizeSharedUser(finalUser)
    };
  }

  const userId = uuidv4();
  const record = {
    userId,
    email: normalizedEmail,
    name: fullName,
    organisationId,
    employeeId,
    userType: 'ORG_USER',
    roles: ['ORGANISATION_ADMIN'],
    passwordHash: hashPassword(password),
    isActive: true
  };
  standaloneUsersByEmail.set(normalizedEmail, record);
  standaloneUsersById.set(userId, record);
  saveStandaloneUsersToDisk();

  return {
    userId,
    email: normalizedEmail,
    organisationId,
    employeeId
  };
}

async function findOrgAuthUserByEmail(organisationId, email, { requestId = null } = {}) {
  if (env.integrationMode !== 'live' || !organisationId || !email) return null;
  const normalizedEmail = email.trim().toLowerCase();
  const res = await requestJson({
    serviceName: 'Auth Service',
    baseUrl: env.services.authUrl,
    method: 'GET',
    path: '/api/v1/auth/internal/users',
    query: {
      organizationId: organisationId,
      roles: 'super_admin,org_admin,service_manager,hr,manager,employee,agent'
    },
    requestId
  });
  const users = Array.isArray(res.data?.data) ? res.data.data : [];
  return (
    users.find(
      (u) =>
        (u.email || '').toLowerCase() === normalizedEmail &&
        (!u.organizationId || u.organizationId === organisationId)
    ) || null
  );
}

async function inviteEmployeeAccount({
  organisationId,
  employeeId,
  email,
  fullName,
  roleCode,
  password = null,
  authorization = null,
  requestId = null
}) {
  const normalizedEmail = email.trim().toLowerCase();
  const inviteToken = crypto.randomBytes(24).toString('hex');
  const sharedRole = mapRoleCodeToSharedAuthRole(roleCode);

  if (env.integrationMode === 'live') {
    const existingInOrg = await findOrgAuthUserByEmail(organisationId, normalizedEmail, { requestId });
    if (existingInOrg) {
      return {
        userId: existingInOrg.id || existingInOrg.userId,
        email: normalizedEmail,
        alreadyExists: true,
        emailDelivered: false,
        inviteLink: `${env.clientAppUrl}/login`
      };
    }

    let provResult;
    try {
      if (authorization) {
        const nameParts = String(fullName || '').trim().split(/\s+/);
        const res = await requestJson({
          serviceName: 'Auth Service',
          baseUrl: env.services.authUrl,
          method: 'POST',
          path: '/api/v1/auth/provision',
          authorization,
          organisationId,
          requestId,
          body: {
            email: normalizedEmail,
            role: sharedRole,
            firstName: nameParts[0] || fullName,
            lastName: nameParts.slice(1).join(' ') || undefined,
            organizationId: organisationId
          }
        });
        provResult = res.data;
      } else {
        const res = await requestJson({
          serviceName: 'Auth Service',
          baseUrl: env.services.authUrl,
          method: 'POST',
          path: '/api/v1/auth/internal/provision-agent',
          organisationId,
          requestId,
          body: {
            email: normalizedEmail,
            name: fullName,
            role: sharedRole,
            organizationId: organisationId
          }
        });
        provResult = res.data?.data || res.data;
      }
    } catch (err) {
      if (err.statusCode === 409) {
        const retryExisting = await findOrgAuthUserByEmail(organisationId, normalizedEmail, { requestId });
        if (retryExisting) {
          return {
            userId: retryExisting.id || retryExisting.userId,
            email: normalizedEmail,
            alreadyExists: true,
            emailDelivered: false,
            inviteLink: `${env.clientAppUrl}/login`
          };
        }
        throw new ConflictError(
          'Email is already registered under a different organisation in Auth Service',
          'CROSS_ORG_AUTH_CONFLICT'
        );
      }
      throw err;
    }

    const user = provResult?.user;
    return {
      userId: user?.id,
      email: normalizedEmail,
      alreadyExists: false,
      emailDelivered: Boolean(provResult?.emailDelivered),
      inviteLink: `${env.clientAppUrl}/login`
    };
  }

  const existing = standaloneUsersByEmail.get(normalizedEmail);
  if (existing && existing.organisationId && existing.organisationId !== organisationId) {
    throw new ConflictError(
      'Email is already associated with another organisation account',
      'CROSS_ORG_AUTH_CONFLICT'
    );
  }
  if (existing && existing.isActive === false) {
    throw new ForbiddenError('Employee account is inactive', 'EMPLOYEE_INACTIVE');
  }
  const userId = existing?.userId || uuidv4();
  const record = {
    userId,
    email: normalizedEmail,
    name: fullName,
    organisationId,
    employeeId,
    userType: 'ORG_USER',
    roles: [roleCode],
    passwordHash: password ? hashPassword(password) : existing?.passwordHash || null,
    inviteToken,
    isActive: true
  };
  standaloneUsersByEmail.set(normalizedEmail, record);
  standaloneUsersById.set(userId, record);
  saveStandaloneUsersToDisk();

  return {
    userId,
    email: normalizedEmail,
    alreadyExists: Boolean(existing),
    inviteLink: `${env.clientAppUrl}/activate-account?employeeInvite=${inviteToken}`
  };
}

async function activateEmployeeAccountCredentials({ authUserId, email, password, requestId = null }) {
  const normalizedEmail = email ? email.trim().toLowerCase() : null;
  let record = null;
  if (normalizedEmail && standaloneUsersByEmail.has(normalizedEmail)) {
    record = standaloneUsersByEmail.get(normalizedEmail);
  } else if (authUserId && standaloneUsersById.has(authUserId)) {
    record = standaloneUsersById.get(authUserId);
  }

  if (record) {
    record.passwordHash = hashPassword(password);
    record.isActive = true;
    record.mustChangePassword = false;
    standaloneUsersByEmail.set(record.email, record);
    standaloneUsersById.set(record.userId, record);
    saveStandaloneUsersToDisk();
    return { userId: record.userId, email: record.email };
  }

  if (env.integrationMode === 'live' && authUserId) {
    try {
      await requestJson({
        serviceName: 'Auth Service',
        baseUrl: env.services.authUrl,
        method: 'PATCH',
        path: `/api/v1/auth/users/${encodeURIComponent(authUserId)}/password`,
        requestId,
        body: { password }
      });
      await setAuthUserStatus(authUserId, 'ACTIVE', { requestId });
    } catch (err) {
      logger.warn({ authUserId, err: err.message }, 'Failed to set employee password on live Auth Service');
    }
  }

  return { userId: authUserId, email: normalizedEmail };
}

async function setAuthUserStatus(authUserId, status, { authorization = null, requestId = null } = {}) {
  if (env.integrationMode !== 'live' || !authUserId || !authorization) return null;
  const res = await requestJson({
    serviceName: 'Auth Service',
    baseUrl: env.services.authUrl,
    method: 'PATCH',
    path: `/api/v1/auth/users/${encodeURIComponent(authUserId)}/status`,
    authorization,
    requestId,
    body: { status }
  });
  return res.data?.user || null;
}

async function registerOrLoginCandidate({
  email,
  fullName,
  password,
  mode = 'login',
  requestId = null,
  ipAddress = null,
  userAgent = null
}) {
  const normalizedEmail = email.trim().toLowerCase();

  if (mode === 'register') {
    return candidateIdentityService.registerCandidate({
      fullName,
      email: normalizedEmail,
      password,
      requestId,
      ipAddress,
      userAgent
    });
  }

  if (mode === 'candidate_login') {
    return candidateIdentityService.authenticateCandidate({
      email: normalizedEmail,
      password,
      requestId,
      ipAddress,
      userAgent
    });
  }

  // In standalone mode, prefer local standalone accounts (e.g. provisioned/reset Org Admins & Recruiters)
  // before consulting an external Auth Service on AUTH_SERVICE_URL, preventing stale external role collisions.
  if (env.integrationMode === 'standalone') {
    const localRecord = standaloneUsersByEmail.get(normalizedEmail);
    if (
      localRecord &&
      localRecord.userType !== 'CANDIDATE' &&
      localRecord.isActive !== false &&
      localRecord.passwordHash &&
      verifyPassword(password, localRecord.passwordHash)
    ) {
      const token = signAccessToken({
        sub: localRecord.userId,
        email: localRecord.email,
        name: localRecord.name,
        organisationId: localRecord.organisationId,
        employeeId: localRecord.employeeId,
        userType: localRecord.userType,
        roles: localRecord.roles
      });
      return { token, user: sanitizeUser(localRecord) };
    }
  }

  if (env.integrationMode === 'live' || env.services.authUrl) {
    // Try Auth Service first for Org Users & Platform Admins;
    // In live mode: fail closed (503) if Auth Service is unreachable, never silently fake login!
    // In standalone mode: if Auth Service is reachable, authenticate against it; if offline, fall through to standalone records!
    try {
      const loginRes = await requestJson({
        serviceName: 'Auth Service',
        baseUrl: env.services.authUrl,
        method: 'POST',
        path: '/api/v1/auth/login',
        requestId,
        body: { email: normalizedEmail, password }
      });

      const normalizedUser = normalizeSharedUser(loginRes.data?.user);
      if (normalizedUser?.mustChangePassword) {
        throw new ForbiddenError(
          'You must change your temporary password before continuing',
          'PASSWORD_CHANGE_REQUIRED'
        );
      }
      return {
        token: loginRes.data?.token,
        user: normalizedUser
      };
    } catch (err) {
      if (env.integrationMode === 'live') {
        if (err.statusCode !== 401) {
          throw err;
        }

        // Only check Recruitment's Candidate Portal account if Auth Service rejected credentials (401)
        return candidateIdentityService.authenticateCandidate({
          email: normalizedEmail,
          password,
          requestId,
          ipAddress,
          userAgent
        });
      }

      // Standalone mode: if Auth Service explicitly rejected credentials with 401:
      if (err.statusCode === 401) {
        const record = standaloneUsersByEmail.get(normalizedEmail);
        if (
          record &&
          record.userType !== 'CANDIDATE' &&
          record.isActive !== false &&
          verifyPassword(password, record.passwordHash)
        ) {
          const token = signAccessToken({
            sub: record.userId,
            email: record.email,
            name: record.name,
            organisationId: record.organisationId,
            employeeId: record.employeeId,
            userType: record.userType,
            roles: record.roles
          });
          return { token, user: sanitizeUser(record) };
        }

        if (isDatabaseInitialized()) {
          try {
            return await candidateIdentityService.authenticateCandidate({
              email: normalizedEmail,
              password,
              requestId,
              ipAddress,
              userAgent
            });
          } catch (_candErr) {
            // Re-throw original 401
            throw err;
          }
        }
        throw err;
      }
      // If Auth Service was offline (e.g. 503 / connection error) in standalone mode, fall through to standalone records
    }
  }

  const record = standaloneUsersByEmail.get(normalizedEmail);
  if (
    record &&
    record.userType !== 'CANDIDATE' &&
    record.isActive !== false &&
    verifyPassword(password, record.passwordHash)
  ) {
    const token = signAccessToken({
      sub: record.userId,
      email: record.email,
      name: record.name,
      organisationId: record.organisationId,
      employeeId: record.employeeId,
      userType: record.userType,
      roles: record.roles
    });
    return { token, user: sanitizeUser(record) };
  }

  if (isDatabaseInitialized()) {
    return candidateIdentityService.authenticateCandidate({
      email: normalizedEmail,
      password,
      requestId,
      ipAddress,
      userAgent
    });
  }

  throw new UnauthorizedError('Invalid email or password');
}

async function updateOrgUserPassword({
  email,
  organisationId,
  employeeId = null,
  authUserId = null,
  fullName = 'Organisation Administrator',
  roles = ['ORGANISATION_ADMIN'],
  password,
  requestId = null
}) {
  const normalizedEmail = email.trim().toLowerCase();

  if (env.integrationMode === 'live' && authUserId) {
    await requestJson({
      serviceName: 'Auth Service',
      baseUrl: env.services.authUrl,
      method: 'PATCH',
      path: `/api/v1/auth/users/${encodeURIComponent(authUserId)}/password`,
      requestId,
      body: { password }
    });
    return { userId: authUserId, email: normalizedEmail };
  }

  const existing =
    standaloneUsersByEmail.get(normalizedEmail) ||
    (authUserId ? standaloneUsersById.get(authUserId) : null);

  const userId = existing?.userId || authUserId || uuidv4();
  const record = {
    userId,
    email: normalizedEmail,
    name: existing?.name || fullName,
    organisationId: organisationId || existing?.organisationId || null,
    employeeId: employeeId || existing?.employeeId || null,
    userType: 'ORG_USER',
    roles: existing?.roles?.length ? existing.roles : roles,
    passwordHash: hashPassword(password),
    isActive: true,
    mustChangePassword: false
  };

  standaloneUsersByEmail.set(normalizedEmail, record);
  standaloneUsersById.set(userId, record);
  saveStandaloneUsersToDisk();

  return { userId, email: normalizedEmail };
}

function seedStandaloneUser(user) {
  const normalizedEmail = user.email.trim().toLowerCase();
  const record = {
    userId: user.userId || uuidv4(),
    email: normalizedEmail,
    name: user.name,
    organisationId: user.organisationId || null,
    employeeId: user.employeeId || null,
    userType: user.userType || 'ORG_USER',
    roles: user.roles || [],
    passwordHash: user.password ? hashPassword(user.password) : user.passwordHash || null,
    isActive: user.isActive !== false
  };
  standaloneUsersByEmail.set(normalizedEmail, record);
  standaloneUsersById.set(record.userId, record);
  saveStandaloneUsersToDisk();
  return record;
}

function clearStandaloneUsers() {
  standaloneUsersByEmail.clear();
  standaloneUsersById.clear();
  initDefaultStandaloneUsers();
}

function sanitizeUser(record) {
  return {
    userId: record.userId,
    email: record.email,
    name: record.name,
    organisationId: record.organisationId,
    employeeId: record.employeeId,
    userType: record.userType,
    roles: record.roles
  };
}

module.exports = {
  signAccessToken,
  signCandidateToken,
  verifyAccessToken,
  verifyRequestAuth,
  sendAccountActivationInvitation,
  provisionOrgAdminAccount,
  inviteEmployeeAccount,
  activateEmployeeAccountCredentials,
  updateOrgUserPassword,
  setAuthUserStatus,
  registerOrLoginCandidate,
  seedStandaloneUser,
  clearStandaloneUsers
};
