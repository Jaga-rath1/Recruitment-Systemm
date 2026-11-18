const env = require('../../config/env');
const { requestJson } = require('../common/httpClient');
const { ServiceUnavailableError } = require('../../utils/AppError');

// Development fixture requisitions used ONLY in INTEGRATION_MODE=standalone
const DEV_FIXTURE_HRMS_JOBS = [
  {
    hrmsJobId: 'HRMS-REQ-2026-101',
    title: 'Senior Full Stack Engineer (Node.js & React)',
    description:
      'Design and scale multi-tenant enterprise HRMS & recruitment modules using Node.js, PostgreSQL, and React. Own end-to-end architecture, API performance, and security.',
    department: 'Platform Engineering',
    skills: ['Node.js', 'React', 'PostgreSQL', 'REST APIs', 'System Design'],
    experience: '5-8 years',
    salary: '135000-165000 USD',
    location: 'Bengaluru / Hybrid',
    employmentType: 'FULL_TIME',
    totalHeadcount: 2,
    jobStatus: 'APPROVED'
  },
  {
    hrmsJobId: 'HRMS-REQ-2026-102',
    title: 'Lead PostgreSQL Database Architect',
    description:
      'Architect multi-tenant PostgreSQL schemas, high-availability clusters, partitioning strategies, and query performance governance across enterprise SaaS microservices.',
    department: 'Data & Infrastructure',
    skills: ['PostgreSQL', 'SQL Tuning', 'High Availability', 'Sequelize', 'Backup & PITR'],
    experience: '7-10 years',
    salary: '150000-185000 USD',
    location: 'Remote',
    employmentType: 'FULL_TIME',
    totalHeadcount: 1,
    jobStatus: 'APPROVED'
  },
  {
    hrmsJobId: 'HRMS-REQ-2026-103',
    title: 'Product Designer — Enterprise SaaS',
    description:
      'Craft crisp, minimalist, accessible B2B SaaS workflows and design systems for talent acquisition and workforce intelligence products.',
    department: 'Product Design',
    skills: ['Design Systems', 'Figma', 'UX Research', 'Accessibility', 'Prototyping'],
    experience: '4-6 years',
    salary: '110000-135000 USD',
    location: 'San Francisco / Hybrid',
    employmentType: 'FULL_TIME',
    totalHeadcount: 1,
    jobStatus: 'APPROVED'
  }
];

const customOrgHrmsFixtures = new Map();

function setStandaloneHrmsJobs(organisationId, jobs) {
  customOrgHrmsFixtures.set(organisationId, jobs);
}

function clearStandaloneHrmsJobs() {
  customOrgHrmsFixtures.clear();
}

async function fetchJobs(organisationId, context = {}) {
  if (env.integrationMode === 'live') {
    if (!env.services.hrmsUrl) {
      throw new ServiceUnavailableError(
        'External HRMS Job Sync API is not configured (HRMS_SERVICE_URL is unset). Use manual job creation or configure HRMS_SERVICE_URL.',
        'HRMS_SERVICE_NOT_CONFIGURED'
      );
    }

    const res = await requestJson({
      serviceName: 'HRMS Requisition Service',
      baseUrl: env.services.hrmsUrl,
      method: 'GET',
      path: `/api/v1/internal/organisations/${encodeURIComponent(organisationId)}/jobs`,
      organisationId,
      actor: { userId: context.actorUserId || 'svc-recruitment', role: 'super_admin' },
      requestId: context.requestId
    });

    const body = res.data;
    return Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
  }

  return customOrgHrmsFixtures.get(organisationId) || DEV_FIXTURE_HRMS_JOBS;
}

async function fetchJobById(organisationId, hrmsJobId, context = {}) {
  const jobs = await fetchJobs(organisationId, context);
  return jobs.find((j) => j.hrmsJobId === hrmsJobId) || null;
}

module.exports = {
  DEV_FIXTURE_HRMS_JOBS,
  fetchJobs,
  fetchJobById,
  setStandaloneHrmsJobs,
  clearStandaloneHrmsJobs
};
