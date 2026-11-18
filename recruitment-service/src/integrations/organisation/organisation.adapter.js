const crypto = require('crypto');
const env = require('../../config/env');
const { requestJson } = require('../common/httpClient');
const { buildServiceIdentityHeaders } = require('../gateway/gateway.config');
const { ForbiddenError, NotFoundError } = require('../../utils/AppError');

// Standalone dev/test fixture store (never used when INTEGRATION_MODE=live)
const standaloneOrganisations = new Map();

function deriveDeterministicOrgCode(subscriptionId) {
  if (!subscriptionId) return null;
  const hex = crypto.createHash('sha256').update(String(subscriptionId)).digest('hex').slice(0, 12).toUpperCase();
  return `ORG-${hex}`;
}

function seedOrganisationProfile(organisationId, profile = {}) {
  if (env.integrationMode === 'live') return null;
  const record = {
    organisationId,
    id: organisationId,
    name: profile.name || 'NEXNUV Tenant Organisation',
    domain: profile.domain || profile.code || 'nexnuv-tenant.local',
    code: profile.code || profile.domain || `ORG-${String(organisationId).slice(0, 6).toUpperCase()}`,
    industry: profile.industry || 'Enterprise Software',
    companySize: profile.companySize || '50-200',
    country: profile.country || 'United States',
    timezone: profile.timezone || 'UTC',
    email: profile.email || null,
    status: profile.status || 'active',
    subscriptionId: profile.subscriptionId || null,
    createdAt: profile.createdAt || new Date().toISOString()
  };
  standaloneOrganisations.set(organisationId, record);
  return record;
}

function normalizeOrganizationDto(org, fallbackId = null) {
  if (!org) return null;
  const id = org.id || org.organisationId || org.organizationId || fallbackId;
  return {
    organisationId: id,
    id,
    name: org.name,
    code: org.code || null,
    domain: org.code || org.domain || null,
    email: org.email || null,
    phone: org.phone || null,
    address: org.address || null,
    city: org.city || null,
    state: org.state || null,
    country: org.country || 'United States',
    timezone: org.timezone || 'UTC',
    industry: org.industry || 'Enterprise SaaS',
    companySize: org.companySize || 'Enterprise',
    status: org.status || 'active',
    createdAt: org.createdAt || org.created_at || null,
    updatedAt: org.updatedAt || org.updated_at || null
  };
}

async function getOrganisation(organisationId, { actor = {}, requestId = null } = {}) {
  if (!organisationId) {
    throw new NotFoundError('Organisation identifier is required');
  }

  if (env.integrationMode === 'live') {
    const res = await requestJson({
      serviceName: 'Organization Service',
      baseUrl: env.services.organisationUrl,
      method: 'GET',
      path: `/api/v1/organizations/${encodeURIComponent(organisationId)}`,
      organisationId,
      actor: {
        userId: actor.userId || 'svc-recruitment',
        role: actor.sharedRole || 'super_admin',
        email: actor.email || 'recruitment@nexnuv.internal'
      },
      requestId
    });
    const orgData = res.data?.data || res.data;
    if (!orgData) {
      throw new NotFoundError('Organisation not found in Organization Service');
    }
    return normalizeOrganizationDto(orgData, organisationId);
  }

  return (
    standaloneOrganisations.get(organisationId) || {
      organisationId,
      id: organisationId,
      name: 'NEXNUV Tenant Organisation',
      domain: 'nexnuv-tenant.local',
      code: 'NEXNUV-DEV',
      industry: 'Technology',
      companySize: '50-200',
      country: 'United States',
      timezone: 'UTC',
      status: 'active'
    }
  );
}

async function validateActiveOrganisation(organisationId, options = {}) {
  const org = await getOrganisation(organisationId, options);
  const status = String(org?.status || '').toLowerCase();
  if (!['active', 'provisioned'].includes(status)) {
    throw new ForbiddenError(
      `Organisation is currently '${org.status}'. An active organisation is required.`,
      'ORGANISATION_INACTIVE'
    );
  }
  return org;
}

async function createOrganisation({
  name,
  domain,
  email,
  phone,
  country,
  timezone,
  status = 'active',
  subscriptionId = null,
  requestId = null
}) {
  const deterministicCode = subscriptionId
    ? deriveDeterministicOrgCode(subscriptionId)
    : null;

  if (env.integrationMode === 'live') {
    let code = deterministicCode;
    if (!code) {
      const slugBase = String(domain || name || 'ORG')
        .replace(/[^a-zA-Z0-9]+/g, '')
        .toUpperCase()
        .slice(0, 12);
      code = `${slugBase || 'ORG'}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    }

    try {
      const res = await requestJson({
        serviceName: 'Organization Service',
        baseUrl: env.services.organisationUrl,
        method: 'POST',
        path: '/api/v1/organizations',
        actor: { userId: 'svc-recruitment', role: 'super_admin', email: 'platform@nexnuv.internal' },
        requestId,
        body: {
          name: name.trim(),
          code,
          email: email || undefined,
          phone: phone || undefined,
          country: country || undefined,
          timezone: timezone || undefined,
          status
        }
      });

      return normalizeOrganizationDto(res.data?.data || res.data);
    } catch (err) {
      // Reconcile on 409 Conflict if code already exists
      const isConflict =
        err.statusCode === 409 ||
        String(err.message || '').includes('already exists') ||
        String(err.code || '') === 'CONFLICT';

      if (isConflict && code) {
        try {
          const listRes = await requestJson({
            serviceName: 'Organization Service',
            baseUrl: env.services.organisationUrl,
            method: 'GET',
            path: `/api/v1/organizations?search=${encodeURIComponent(code)}`,
            actor: { userId: 'svc-recruitment', role: 'super_admin', email: 'platform@nexnuv.internal' },
            requestId
          });

          const rows = listRes.data?.data || listRes.data?.rows || listRes.data || [];
          const existingOrg = Array.isArray(rows)
            ? rows.find((r) => r.code === code)
            : null;

          if (existingOrg) {
            return normalizeOrganizationDto(existingOrg);
          }
        } catch (_reconcileErr) {
          // Fall through to throw original error
        }
      }
      throw err;
    }
  }

  // Standalone mode: Idempotent lookup by subscriptionId or code
  if (subscriptionId || deterministicCode) {
    for (const [_id, org] of standaloneOrganisations.entries()) {
      if (
        (subscriptionId && org.subscriptionId === subscriptionId) ||
        (deterministicCode && org.code === deterministicCode)
      ) {
        return org;
      }
    }
  }

  const organisationId = crypto.randomUUID();
  return seedOrganisationProfile(organisationId, {
    name,
    domain,
    code: deterministicCode || undefined,
    email,
    status,
    subscriptionId
  });
}

async function updateOrganisationStatus(organisationId, status, { requestId = null } = {}) {
  const normalized = String(status || '').toLowerCase() === 'active' ? 'active' : 'inactive';
  if (env.integrationMode === 'live') {
    const res = await requestJson({
      serviceName: 'Organization Service',
      baseUrl: env.services.organisationUrl,
      method: 'PATCH',
      path: `/api/v1/organizations/${encodeURIComponent(organisationId)}/status`,
      organisationId,
      actor: { userId: 'svc-recruitment', role: 'super_admin' },
      requestId,
      body: { status: normalized }
    });
    return normalizeOrganizationDto(res.data?.data || res.data, organisationId);
  }

  const existing = standaloneOrganisations.get(organisationId);
  if (existing) {
    existing.status = status;
  }
  return existing || null;
}

async function listDepartments(organisationId, { requestId = null } = {}) {
  if (env.integrationMode === 'live') {
    const res = await requestJson({
      serviceName: 'Organization Service',
      baseUrl: env.services.organisationUrl,
      method: 'GET',
      path: `/api/v1/organizations/${encodeURIComponent(organisationId)}/departments`,
      headers: buildServiceIdentityHeaders(organisationId),
      requestId
    });
    return res.data?.data || [];
  }
  return [];
}

function clearStandaloneOrganisations() {
  standaloneOrganisations.clear();
}

module.exports = {
  deriveDeterministicOrgCode,
  seedOrganisationProfile,
  normalizeOrganizationDto,
  getOrganisation,
  validateActiveOrganisation,
  createOrganisation,
  updateOrganisationStatus,
  listDepartments,
  clearStandaloneOrganisations
};

