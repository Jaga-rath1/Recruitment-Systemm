# NEXNUV Recruitment — Performance & Staged Load Test Report

**Test Date:** November 18, 2026  
**Load Harness:** [run-load-test.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/scripts/run-load-test.js)  
**Environment:** Node.js `v24.20.0`, Windows 11, Isolated Express (:ephemeral) + Isolated In-Process PGlite PostgreSQL (`pool.max = 1`), External dependencies isolated/mocked (zero traffic to Neon, Gmail, Cloudinary, or shared services).

---

## 1. Frontend Bundle & Rendering Optimization (Measured Before vs. After)

During Phase 5 audit, `client/src/App.jsx` was found to eagerly import all 38 pages into a single entry chunk, exceeding Vite's 500 kB chunk warning threshold. Route-level code splitting via `React.lazy` + `<Suspense>` was implemented for 33 secondary/workspace pages while preserving eager loading for initial entry & login pages.

| Metric | Before Hardening | After Code Splitting | Improvement |
| :--- | :---: | :---: | :---: |
| **Main App Entry Chunk (`index-*.js`)** | `666.07 kB` (gzip `160.71 kB`) | **`295.27 kB`** (gzip **`85.89 kB`**) | **-55.7% raw / -46.6% gzip** |
| **Vite >500 kB Chunk Warnings** | 1 warning | **0 warnings** | Resolved |
| **Lazy Route Chunks Generated** | 0 | **48 granular chunks** (0.86–56.7 kB) | On-demand loading |
| **Build Time (`vite build`)** | 10.94 s | 10.83 s | Neutral |
| **Frontend Test Suite** | 53/53 passing | **53/53 passing** | 0 regressions |

---

## 2. Backend Staged Load & Stress Test Measurements

### Workload Mix (Realistic Read + Business Operations)
Each virtual user executed a balanced mix across 7 endpoints:
- **Ordinary Reads:** `GET /health`, `GET /api/v1/jobs/public/careers?page=1&limit=10`, `GET /api/v1/jobs/public/careers?search=Benchmark`, `GET /api/v1/jobs/public/careers/:id`
- **Authenticated Business Operations:** `GET /api/v1/jobs`, `GET /api/v1/reports/summary`, `GET /api/v1/jobs/platform-admin/jobs`

### Measured Stage-by-Stage Results (1,404 Total Requests)

| Stage | Concurrency (VUs) | Total Reqs | Duration (s) | Throughput (RPS) | Error Rate | Timeouts | p50 (ms) | Read p95 (ms) | Business p95 (ms) | Overall p95 (ms) | p99 (ms) | Heap End (MB) | RSS End (MB) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **1. Baseline** | 1 | 14 | 0.27 | 51.40 | **0.00%** | 0 | 17.18 | **21.62** | **32.58** | 32.58 | 32.58 | 66.55 | 398.87 |
| **2. Normal Load** | 10 | 70 | 0.63 | 111.34 | **0.00%** | 0 | 78.22 | **97.36** | **185.34** | 168.28 | 211.92 | 67.39 | 416.65 |
| **3. Moderate Load** | 25 | 150 | 1.28 | 117.17 | **0.00%** | 0 | 190.01 | **235.25** | **424.06** | 394.77 | 433.77 | 71.95 | 459.48 |
| **4. High Load** | 50 | 250 | 1.99 | 125.78 | **0.00%** | 0 | 296.16 | **419.93** | **779.14** | 758.93 | 793.05 | 85.04 | 571.01 |
| **5. Peak Concurrency** | 100 | 400 | 3.18 | 125.87 | **0.00%** | 0 | 583.32 | 961.99 | 1,594.01 | 1,474.49 | 1,665.16 | 47.90 | 674.70 |
| **6. Stress Burst** | 150 | 450 | 3.28 | 137.30 | **0.00%** | 0 | 660.82 | 1,173.40 | 1,959.57 | 1,753.94 | 2,034.00 | 68.80 | 794.83 |
| **7. Post-Stress Recovery** | 10 | 70 | 0.54 | 129.06 | **0.00%** | 0 | 74.32 | **86.64** | **158.62** | 152.10 | 185.03 | 81.09 | 815.48 |

---

## 3. Target Evaluation & Bottleneck Analysis

| Engineering Target | Measured Outcome | Verdict |
| :--- | :--- | :---: |
| Ordinary Read p95 < 500 ms (normal load, up to 50 VUs) | **21.62 ms** (1 VU), **97.36 ms** (10 VU), **235.25 ms** (25 VU), **419.93 ms** (50 VU) | **MET (up to 50 VUs)** |
| Business Operation p95 < 1,000 ms (normal load, up to 50 VUs) | **32.58 ms** (1 VU), **185.34 ms** (10 VU), **424.06 ms** (25 VU), **779.14 ms** (50 VU) | **MET (up to 50 VUs)** |
| Error Rate < 1% | **0.00%** across all 1,404 requests including 150 VU stress burst | **MET** |
| Zero timeouts / Zero event-loop crashes | **0 timeouts** across all stages | **MET** |
| Post-stress recovery | Recovered immediately to **74.32 ms p50 / 86.64 ms read p95** within 0.54 s | **MET** |
| Heap Memory Stability | Heap fluctuated cleanly between **47.9–85.0 MB** (GC reclaimed memory normally after 100 VU) | **MET** |
| 100–150 VU latency ceiling | Read p95 rose to **962–1,173 ms** due to PGlite's single serialized socket connection (`pool.max = 1` in `testDb.js`) | **EXPECTED TEST-DB LIMIT (Re-benchmark required on real staging PostgreSQL with `PG_POOL_MAX=20`)** |

### Real Production Bottleneck Caught During Load Testing
- **Discovery:** On the initial load test run, `apiRateLimiter` (`max: 300 / 15 min` per IP) triggered HTTP `429` on `/health` and `/ready` once traffic exceeded 300 requests from localhost.
- **Fix Applied:** Exempted `/health`, `/healthy`, and `/ready` in [rateLimiter.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/middleware/rateLimiter.js#L4-L10) so load-balancer and orchestrator probes are never throttled.
- **Database Pool Readiness:** Production Sequelize pool in [database.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/config/database.js#L16-L22) is configured with `max: 20` (`PG_POOL_MAX`), `acquire: 30000`, `idle: 30000`, `evict: 10000`, and live Neon connectivity verified (`dbPingMs: 501` over WAN, `using: 0`, `waiting: 0`).
