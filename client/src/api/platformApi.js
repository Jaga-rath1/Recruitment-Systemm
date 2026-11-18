import axios from 'axios';

// Platform Service runs on port 4002.
// In the NEXNUV microservice architecture, browser clients route authenticated requests
// through the API Gateway (port 4000) at /api/v1/platform, which validates JWTs, sets
// x-user-id, x-user-role ('super_admin'), and attaches the internal service token.
// When Vite proxy is active or in local dev, requests can also be routed via /api/v1/platform.
const GATEWAY_URL = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:4000/api/v1';
const DEFAULT_PLATFORM_URL = GATEWAY_URL.endsWith('/api/v1')
  ? `${GATEWAY_URL}/platform`
  : `${GATEWAY_URL}/api/v1/platform`;

const BASE_URL = import.meta.env.VITE_PLATFORM_API_URL || DEFAULT_PLATFORM_URL;

export const platformHttpClient = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json'
  }
});

platformHttpClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('nexnuv_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

platformHttpClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const serverErr = error.response?.data?.error || error.response?.data;
    const isNetworkOrTimeout = !error.response && (error.code === 'ECONNABORTED' || error.code === 'ERR_NETWORK');
    const status = error.response?.status || (isNetworkOrTimeout ? 503 : 500);
    const fallbackMsg = isNetworkOrTimeout
      ? 'Platform Service or API Gateway is unreachable. Please verify services on port 4000/4002.'
      : error.message || 'Request failed';

    const message =
      serverErr?.message ||
      (typeof serverErr === 'string' ? serverErr : null) ||
      error.response?.data?.message ||
      fallbackMsg;

    const err = new Error(message);
    err.status = status;
    err.code = serverErr?.code || (status === 503 ? 'SERVICE_UNAVAILABLE' : 'REQUEST_ERROR');
    err.details = serverErr?.details || null;

    // Do NOT dispatch global nexnuv:unauthorized here:
    // If Platform Service or API Gateway has an isolated authorization mismatch,
    // it must not nuke the user's authenticated session in AuthContext or kick them out to /login.
    return Promise.reject(err);
  }
);

export const platformApi = {
  // -------------------------------------------------------------
  // Health & Service Status
  // -------------------------------------------------------------
  getHealth: () => {
    // Platform health is mounted at /health on port 4002
    const directHealthUrl = import.meta.env.VITE_PLATFORM_DIRECT_HEALTH_URL || 'http://localhost:4002/health';
    return axios.get(directHealthUrl, { timeout: 5000 }).then((r) => r.data).catch(() => ({
      success: false,
      service: 'platform-service',
      status: 'offline'
    }));
  },

  // -------------------------------------------------------------
  // 1. Modules Catalog (/api/v1/platform/modules)
  // -------------------------------------------------------------
  listModules: () => platformHttpClient.get('/modules'),
  getModule: (id) => platformHttpClient.get(`/modules/${id}`),
  createModule: (payload) => platformHttpClient.post('/modules', payload),
  updateModule: (id, payload) => platformHttpClient.patch(`/modules/${id}`, payload),
  updateModuleStatus: (id, status) => platformHttpClient.patch(`/modules/${id}/status`, { status }),

  // -------------------------------------------------------------
  // 2. Submodules Catalog (/api/v1/platform/submodules)
  // -------------------------------------------------------------
  listSubmodules: (params) => platformHttpClient.get('/submodules', { params }),
  getSubmodule: (id) => platformHttpClient.get(`/submodules/${id}`),
  createSubmodule: (payload) => platformHttpClient.post('/submodules', payload),
  updateSubmodule: (id, payload) => platformHttpClient.patch(`/submodules/${id}`, payload),
  updateSubmoduleStatus: (id, status) => platformHttpClient.patch(`/submodules/${id}/status`, { status }),

  // -------------------------------------------------------------
  // 3. Plans Management (/api/v1/platform/plans)
  // -------------------------------------------------------------
  listPlans: () => platformHttpClient.get('/plans'),
  getPlan: (id) => platformHttpClient.get(`/plans/${id}`),
  createPlan: (payload) => platformHttpClient.post('/plans', payload),
  updatePlan: (id, payload) => platformHttpClient.patch(`/plans/${id}`, payload),
  updatePlanStatus: (id, status) => platformHttpClient.patch(`/plans/${id}/status`, { status }),

  // Plan Modules Association (/api/v1/platform/plans/:planId/modules)
  listPlanModules: (planId) => platformHttpClient.get(`/plans/${planId}/modules`),
  addPlanModule: (planId, moduleId) => platformHttpClient.post(`/plans/${planId}/modules`, { moduleId }),
  removePlanModule: (planId, moduleId) => platformHttpClient.delete(`/plans/${planId}/modules/${moduleId}`),

  // Plan Submodules Association (/api/v1/platform/plans/:planId/submodules)
  listPlanSubmodules: (planId) => platformHttpClient.get(`/plans/${planId}/submodules`),
  addPlanSubmodule: (planId, submoduleId) => platformHttpClient.post(`/plans/${planId}/submodules`, { submoduleId }),
  removePlanSubmodule: (planId, submoduleId) => platformHttpClient.delete(`/plans/${planId}/submodules/${submoduleId}`),

  // -------------------------------------------------------------
  // 4. Subscriptions (/api/v1/platform/subscriptions)
  // -------------------------------------------------------------
  listSubscriptions: (params) => platformHttpClient.get('/subscriptions', { params }),
  getSubscription: (id) => platformHttpClient.get(`/subscriptions/${id}`),
  createSubscription: (payload) => platformHttpClient.post('/subscriptions', payload),
  updateSubscription: (id, payload) => platformHttpClient.patch(`/subscriptions/${id}`, payload),

  // -------------------------------------------------------------
  // 5. Trials Lifecycle (/api/v1/platform/trials)
  // -------------------------------------------------------------
  updateTrialStatus: (id, outcome) => platformHttpClient.patch(`/trials/${id}`, { status: outcome }),

  // -------------------------------------------------------------
  // 6. Organization-Scoped Platform Operations (/api/v1/platform/organizations)
  // -------------------------------------------------------------
  getOrgSubscription: (organizationId) => platformHttpClient.get(`/organizations/${organizationId}/subscription`),
  getOrgTrial: (organizationId) => platformHttpClient.get(`/organizations/${organizationId}/trial`),
  createOrgTrial: (organizationId, payload) => platformHttpClient.post(`/organizations/${organizationId}/trial`, payload),

  // -------------------------------------------------------------
  // 7. Entitlements Resolution (/api/v1/platform/entitlements)
  // -------------------------------------------------------------
  getOrgEntitlements: (organizationId) => platformHttpClient.get(`/entitlements/organizations/${organizationId}`),
  getMyEntitlements: () => platformHttpClient.get('/entitlements/me')
};

export default platformApi;

