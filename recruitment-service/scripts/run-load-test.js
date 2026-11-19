'use strict';

// Isolate load benchmark in test mode (uses PGlite & skips single-IP dev rate limiter)
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

/**
 * Isolated Staged Load & Stress Testing Harness (Phase 5)
 *
 * Runs strictly against an isolated in-process PGlite PostgreSQL database and ephemeral Express HTTP server.
 * NEVER touches live Neon PostgreSQL, Gmail SMTP, Cloudinary, or shared microservices (:4000-:4006).
 *
 * Stages:
 * 1. Baseline (1 virtual user)
 * 2. 10 concurrent users
 * 3. 25 concurrent users
 * 4. 50 concurrent users
 * 5. 100 concurrent users
 * 6. Controlled stress burst (150 concurrent users)
 * 7. Recovery check (10 concurrent users post-stress)
 */

const { performance } = require('perf_hooks');
const { v4: uuidv4 } = require('uuid');
const { startTestDatabase, stopTestDatabase } = require('../tests/helpers/testDb');
const { createApp } = require('../src/app');
const authAdapter = require('../src/integrations/auth/auth.adapter');

function percentile(sortedValues, p) {
  if (!sortedValues.length) return 0;
  const idx = Math.min(sortedValues.length - 1, Math.ceil((p / 100) * sortedValues.length) - 1);
  return Math.round(sortedValues[idx] * 100) / 100;
}

async function seedLoadTestEnvironment(baseUrl) {
  const platformToken = authAdapter.signAccessToken({
    sub: uuidv4(),
    email: 'loadadmin@nexnuv.com',
    name: 'Load Test Platform Admin',
    userType: 'PLATFORM_ADMIN',
    roles: ['PLATFORM_ADMIN']
  });

  const trialRes = await fetch(`${baseUrl}/api/v1/subscriptions/trial`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      organisationName: 'LoadTest Benchmark Corp',
      organisationDomain: 'loadtest.local',
      industry: 'Technology',
      companySize: '51-200',
      adminName: 'Load Admin',
      adminEmail: 'admin@loadtest.local',
      password: 'LoadPassword!2026'
    })
  });
  const trialBody = await trialRes.json();
  const orgToken = trialBody.data.token;

  // Seed 8 published jobs for realistic search & careers feed load
  const jobIds = [];
  for (let i = 1; i <= 8; i++) {
    const res = await fetch(`${baseUrl}/api/v1/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${orgToken}`
      },
      body: JSON.stringify({
        title: `Benchmark Systems Engineer Tier ${i}`,
        description:
          'Design resilient, high-throughput multi-tenant cloud APIs with Node.js and PostgreSQL.',
        department: i % 2 === 0 ? 'Platform Engineering' : 'Product Engineering',
        skills: ['Node.js', 'PostgreSQL', 'Distributed Systems'],
        experienceMinYears: 3,
        experienceMaxYears: 7,
        salaryMin: 100000,
        salaryMax: 160000,
        location: i % 2 === 0 ? 'Bengaluru' : 'Remote',
        employmentType: 'FULL_TIME',
        headcount: 2,
        publishImmediately: true
      })
    });
    const jBody = await res.json();
    jobIds.push(jBody.data.id);
  }

  return { platformToken, orgToken, jobIds };
}

async function runStage({ name, concurrency, iterationsPerUser, baseUrl, ctx }) {
  const latencies = [];
  const readLatencies = [];
  const businessLatencies = [];
  let totalRequests = 0;
  let errorCount = 0;
  let timeoutCount = 0;

  const memStart = process.memoryUsage();
  const cpuStart = process.cpuUsage();
  const stageStart = performance.now();

  const endpoints = [
    { kind: 'read', url: `${baseUrl}/health`, headers: {} },
    { kind: 'read', url: `${baseUrl}/api/v1/jobs/public/careers?page=1&limit=10`, headers: {} },
    { kind: 'read', url: `${baseUrl}/api/v1/jobs/public/careers?search=Benchmark`, headers: {} },
    { kind: 'read', url: `${baseUrl}/api/v1/jobs/public/careers/${ctx.jobIds[0]}`, headers: {} },
    {
      kind: 'business',
      url: `${baseUrl}/api/v1/jobs?page=1&limit=10`,
      headers: { Authorization: `Bearer ${ctx.orgToken}` }
    },
    {
      kind: 'business',
      url: `${baseUrl}/api/v1/reports/summary`,
      headers: { Authorization: `Bearer ${ctx.orgToken}` }
    },
    {
      kind: 'business',
      url: `${baseUrl}/api/v1/subscriptions/platform-admin/organisations?page=1&limit=10`,
      headers: { Authorization: `Bearer ${ctx.platformToken}` }
    }
  ];

  async function runVirtualUser(userIndex) {
    for (let iter = 0; iter < iterationsPerUser; iter++) {
      const target = endpoints[(userIndex + iter) % endpoints.length];
      const reqStart = performance.now();
      totalRequests += 1;
      try {
        const res = await fetch(target.url, {
          method: 'GET',
          headers: target.headers,
          signal: AbortSignal.timeout(5000)
        });
        await res.text();
        const dur = performance.now() - reqStart;
        latencies.push(dur);
        if (target.kind === 'read') readLatencies.push(dur);
        else businessLatencies.push(dur);

        if (!res.ok) {
          errorCount += 1;
        }
      } catch (err) {
        const dur = performance.now() - reqStart;
        latencies.push(dur);
        errorCount += 1;
        if (err.name === 'TimeoutError' || err.name === 'AbortError') {
          timeoutCount += 1;
        }
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, (_, i) => runVirtualUser(i)));

  const durationSec = Math.max(0.001, (performance.now() - stageStart) / 1000);
  const memEnd = process.memoryUsage();
  const cpuDiff = process.cpuUsage(cpuStart);
  latencies.sort((a, b) => a - b);
  readLatencies.sort((a, b) => a - b);
  businessLatencies.sort((a, b) => a - b);

  return {
    stage: name,
    concurrency,
    totalRequests,
    durationSec: Math.round(durationSec * 100) / 100,
    rps: Math.round((totalRequests / durationSec) * 100) / 100,
    errorCount,
    errorRatePct: Math.round((errorCount / totalRequests) * 10000) / 100,
    timeoutCount,
    p50Ms: percentile(latencies, 50),
    p95Ms: percentile(latencies, 95),
    p99Ms: percentile(latencies, 99),
    maxLatencyMs: Math.round((latencies[latencies.length - 1] || 0) * 100) / 100,
    readP95Ms: percentile(readLatencies, 95),
    businessP95Ms: percentile(businessLatencies, 95),
    cpuUserMs: Math.round(cpuDiff.user / 1000),
    cpuSystemMs: Math.round(cpuDiff.system / 1000),
    heapUsedStartMb: Math.round((memStart.heapUsed / 1048576) * 100) / 100,
    heapUsedEndMb: Math.round((memEnd.heapUsed / 1048576) * 100) / 100,
    rssEndMb: Math.round((memEnd.rss / 1048576) * 100) / 100
  };
}

async function main() {
  await startTestDatabase();
  const app = createApp();
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const ctx = await seedLoadTestEnvironment(baseUrl);

    const stages = [
      { name: '1. Baseline (1 VU)', concurrency: 1, iterationsPerUser: 14 },
      { name: '2. 10 Concurrent Users', concurrency: 10, iterationsPerUser: 7 },
      { name: '3. 25 Concurrent Users', concurrency: 25, iterationsPerUser: 6 },
      { name: '4. 50 Concurrent Users', concurrency: 50, iterationsPerUser: 5 },
      { name: '5. 100 Concurrent Users', concurrency: 100, iterationsPerUser: 4 },
      { name: '6. Controlled Stress Burst (150 VU)', concurrency: 150, iterationsPerUser: 3 },
      { name: '7. Post-Stress Recovery (10 VU)', concurrency: 10, iterationsPerUser: 7 }
    ];

    const results = [];
    for (const s of stages) {
      const metrics = await runStage({ ...s, baseUrl, ctx });
      results.push(metrics);
    }

    console.log('=== STAGED LOAD TEST RESULTS (ISOLATED PGLITE + LOCAL EXPRESS) ===');
    console.log(JSON.stringify(results, null, 2));
  } finally {
    server.close();
    await stopTestDatabase();
  }
}

main().catch((err) => {
  console.error('[LOAD TEST FAILED]', err);
  process.exit(1);
});
