# NEXNUV Recruitment — Phase 4.1 Dependency Security & Vulnerability Remediation Report

**Audit & Remediation Date**: 2026-11-11  
**Target Workspaces**: [recruitment-service](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/package.json) (`Node >=20.0.0`, tested on `Node v24.20.0`) and [client](file:///c:/Users/rathj/NEXNUV-Recruitment/client/package.json) (`Vite 6.4.6`, `React 19.3.1`)  
**Phase 4.1 Classification**: **B. CONDITIONALLY PASSED**  
*(Zero `CRITICAL`, zero `HIGH`, and zero `devDependency` vulnerabilities remain across both `recruitment-service/` and `client/`. `client/` reports **0 vulnerabilities** (`prod` & `dev`). `recruitment-service/` retains 5 upstream `MODERATE` advisories in the non-runtime CLI chain of `sequelize-cli@6.6.5 -> js-beautify@1.15.4` because no safe upstream patch exists without breaking container migration execution or applying unvalidated cross-major overrides.)*

---

## 1. Boundary & Constraint Compliance
- **Six Shared Microservices Strictly Untouched**: `api-gateway/`, `auth-service/`, `platform-service/`, `organization-service/`, `employee-service/`, and `notification-service/` were verified read-only (`LastWriteTime` unchanged since `10-11-2026 17:02–17:11`).
- **Architecture & Contracts Preserved**: Kept Express.js, Sequelize ORM, PostgreSQL / Neon, brokerless REST integrations, existing API contracts, authentication, tenant isolation, and RBAC intact. Zero message brokers introduced.

---

## 2. Before vs After Vulnerability Summary

| Scope | Command | Before Remediation | After Remediation | Net Reduction |
|---|---|---|---|---|
| **Client** (`client/`) | `npm audit --omit=dev` | **0** (`0 crit, 0 high, 0 mod, 0 low`) | **0** (`0 crit, 0 high, 0 mod, 0 low`) | Clean (`0` prod) |
| **Client** (`client/`) | `npm audit` (full) | **3** (`2 critical, 0 high, 1 moderate`) | **0** (`0 crit, 0 high, 0 mod, 0 low`) | **-3 (-100%)** |
| **Backend** (`recruitment-service/`) | `npm audit --omit=dev` | **8** (`0 critical, 1 high, 7 moderate`) | **5** (`0 critical, 0 high, 5 moderate, 0 low`) | **-3** (`HIGH` & `uuid`/`sequelize` eliminated) |
| **Backend** (`recruitment-service/`) | `npm audit` (full) | **12** (`2 critical, 1 high, 9 moderate`) | **5** (`0 critical, 0 high, 5 moderate, 0 low`) | **-7 (-58.3%, 100% critical/high/dev fixed)** |

---

## 3. Initial Audit Baseline (`Before Fixes`)

1. **`recruitment-service/` (`npm audit --omit=dev`) — 8 advisories (`228 prod / 157 dev / 55 optional / 386 total`)**:
   - **`zod <4.6.6` (HIGH, Direct)** — `zod@3.25.76` (`GHSA-mrhx-c7xc-m3w5`, CWE-770, CVSS `7.5`): memory exhaustion while validating oversized constrained collections; fix requires major upgrade `zod@^4.6.7`.
   - **`uuid <11.1.1` & `sequelize >=3.30.1` (MODERATE, Nested Transitive -> Direct Effect)** — `node_modules/sequelize/node_modules/uuid@8.3.2` (`GHSA-w5hq-g745-h8pq`, CWE-787/CWE-1285, CVSS `7.5`): missing buffer bounds check in `v3`/`v5`/`v6` when `buf` is supplied. Top-level already used `uuid@11.1.1`, while `sequelize@6.37.8` pinned `"uuid": "^8.3.2"`. `npm audit fix --force` proposed breaking downgrade to `sequelize@3.30.0`.
   - **`sequelize-cli >=6.6.3` -> `js-beautify >=1.14.9` -> `glob 9.0.0–14.0.1` & `editorconfig 1.0.3–3.0.2` -> `minimatch 7.0.0–11.0.0` (5 MODERATE)**: `GHSA-3g3m-2fjr-6pw4` (`glob` AbortSignal traversal bypass) and `GHSA-g3hv-75wg-m249` (`minimatch` globparts DoS). `npm audit fix --force` proposed breaking downgrade to `sequelize-cli@6.6.2`.
2. **`recruitment-service/` (`npm audit` full) — adds 4 Dev-Only advisories (`12 total: 2 critical, 1 high, 9 moderate`)**:
   - **`vitest 0.0.95–4.1.10` -> `tinypool <=2.1.1` (2 CRITICAL)** (`GHSA-5gmw-xhrv-c9v3`, `GHSA-85c8-ppgw-ccpr`, CWE-1321/CWE-94 prototype pollution to RCE) and **`@vitest/mocker <=4.1.11` (MODERATE)** (`GHSA-82fw-gwwq-j7x9` traversal, `GHSA-qxg6-89mg-rqv8` injection). Installed version was `vitest@3.2.7`.
   - **`nodemon >=3.1.12` -> `minimatch@10.2.6` (MODERATE)** (`GHSA-g3hv-75wg-m249`). Installed version was `nodemon@3.1.14`.
3. **`client/` (`npm audit` full) — 3 Dev-Only advisories (`2 critical, 1 moderate`, `0 prod`)**:
   - Same `vitest@3.2.7` -> `tinypool` (2 CRITICAL) & `@vitest/mocker` (MODERATE) chain.

---

## 4. Remediations Implemented & Verified

### 4.1 `zod` Upgraded `^3.24.2` -> `^4.6.7` (Eliminates `HIGH` Advisory)
- **Package Change**: Updated [recruitment-service/package.json](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/package.json) and `package-lock.json` to `"zod": "^4.6.7"` (resolved `zod@4.6.7`). Verified single installed version via `npm --prefix recruitment-service ls zod`.
- **Schema Audit Across All 12 Backend Files**:
  - Updated [job.routes.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/job/job.routes.js#L30-L33) (`createJobSchema.body.recruitmentConfig`) from single-arg `z.record(z.any())` to Zod v4 explicit key+value `z.record(z.string(), z.unknown())` while keeping `.refine((cfg) => !containsUnsafeKeys(cfg))` and centralized pre-parse `containsUnsafeKeys(req.body)` in [validate.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/middleware/validate.js#L9-L15).
  - Audited and runtime-tested remaining 10 schema/helper files (`application.routes.js`, `auth.routes.js`, `candidate.routes.js`, `interview.routes.js`, `joining.routes.js`, `offer.routes.js`, `organisation.routes.js`, `role.routes.js`, `subscription.routes.js`, `tracking.routes.js`, and [validationHelpers.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/utils/validationHelpers.js)):
    - Verified `parsed.error.issues` mapping in [validate.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/middleware/validate.js) matches Zod v4 error output.
    - Verified `z.string().uuid()` in `zod@4.6.7` accepts RFC 4122/9562 v1–v8, nil (`0000...`), and max (`ffff...`) UUIDs while rejecting invalid/non-UUID strings (`422`), and verified all hardcoded test/seed UUIDs use valid v4 (`-4xxx-8xxx-`) or nil values.
    - Verified `.datetime()`, `.email()`, `.coerce.number()`, `z.union(...)`, `.default(...)`, and `.partial()` on `updateJobSchema` operate consistently.
    - Verified `recruitmentConfig` creation/readback (`fullRecruitmentLifecycle.test.js`), `javascript:` URI blocking (`422`), and `{"__proto__":{"admin":true}}` rejection (`422` in `securityRegressionAudit.test.js`).

### 4.2 `sequelize` / `uuid` Deduplication via Targeted Override (Eliminates 2 `MODERATE` Production Advisories)
- **Root-Cause Check**: Inspected `recruitment-service/node_modules/sequelize/lib/utils.js` (lines 22–23, 216–220) and `uuid@11.1.1/dist/cjs/index.js`. Confirmed Sequelize v6 imports only `require("uuid").v1` and `require("uuid").v4` with zero arguments (`uuidv1()`, `uuidv4()`), and `uuid@11.1.1` exports both synchronously via CommonJS.
- **Package Change**: Added targeted `"overrides": { "sequelize": { "uuid": "^11.1.1" } }` in [recruitment-service/package.json](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/package.json#L44-L48), removing nested `node_modules/sequelize/node_modules/uuid@8.3.2` and deduplicating to top-level `uuid@11.1.1`.
- **Safety Verification**: Preserved `sequelize@6.37.8` (avoided unsafe `3.30.0` downgrade), verified `toDefaultValue(new DataTypes.UUIDV4())` & `UUIDV1()`, verified Neon migrations via `sequelize-cli db:migrate:status`, and passed all 26 PGlite/Sequelize integration tests.

### 4.3 `vitest` Upgraded `^3.1.2` -> `^4.1.12` in Backend & Client (Eliminates 4 `CRITICAL` + 2 `MODERATE` Dev Advisories)
- **Package Change**: Updated `"vitest": "^4.1.12"` in both [recruitment-service/package.json](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/package.json#L39) and [client/package.json](file:///c:/Users/rathj/NEXNUV-Recruitment/client/package.json#L30) (with patched `@vitest/mocker@4.1.12` and removal of vulnerable `tinypool <=2.1.1`).
- **Compatibility**: Preserves `recruitment-service` `"engines": { "node": ">=20.0.0" }` and `client` `vite@^6.4.6` + `@vitejs/plugin-react@4.7.0` peer dependencies without requiring Vite 7 or Node 22.12+ breaking bumps.

### 4.4 `nodemon` Resolved Cleanly Within `^3.1.9` (`3.1.14` -> `3.1.11`) (Eliminates Dev `minimatch` `MODERATE` Advisory)
- **Package Change**: Executed non-breaking `npm --prefix recruitment-service audit fix` (without `--force`), resolving `nodemon` within existing `"nodemon": "^3.1.9"` to `3.1.11` with `minimatch@3.1.5` (outside `GHSA-g3hv-75wg-m249` affected range `>=7.0.0 <11.0.1`). Verified `nodemon --version` outputs `3.1.11`.

---

## 5. Remaining Upstream Advisories & Rejected Unsafe Fixes

The **only** remaining advisories across the entire Recruitment project are **5 `MODERATE` advisories** chained under `sequelize-cli@6.6.5` in `recruitment-service`:

```text
sequelize-cli@6.6.5 (direct dependency — latest 6.x release)
 └── js-beautify@1.15.4
      ├── editorconfig@1.0.7 -> minimatch@9.0.9  (GHSA-g3hv-75wg-m249: DoS >=7.0.0 <11.0.1)
      └── glob@10.5.0        -> minimatch@9.0.9  (GHSA-3g3m-2fjr-6pw4 & GHSA-g3hv-75wg-m249)
```

1. **Why `sequelize-cli` Is Kept in `dependencies` (and Not Moved to `devDependencies`)**:  
   [recruitment-service.Dockerfile](file:///c:/Users/rathj/NEXNUV-Recruitment/infrastructure/recruitment-service.Dockerfile#L5-L14) installs production packages with `npm ci --omit=dev` and runs `npx sequelize-cli db:migrate && node src/db/seed.js && node src/server.js` at container startup. Moving `sequelize-cli` to `devDependencies` without redesigning container migration execution would break production Docker startup.
2. **Runtime Reachability Risk Assessment**:  
   Runtime HTTP server execution (`src/server.js` / `src/app.js`) never imports `sequelize-cli` or `js-beautify`. Inside `sequelize-cli`, only `lib/helpers/template-helper.js` requires `js-beautify` (used only by code generators like `migration:generate`), and `js-beautify`'s `glob`/`editorconfig`/`minimatch` calls live exclusively in its standalone CLI file (`js-beautify/js/lib/cli.js`), not in Sequelize migration execution (`db:migrate`).
3. **Why `npm audit fix --force` / Blind Overrides Were Rejected**:
   - `npm audit fix --force` attempts to downgrade `sequelize-cli` to `6.6.2` and previously tried downgrading `sequelize` to `3.30.0` (severely breaking ORM functionality and exposing legacy code).
   - Registry `js-beautify@2.0.3` depends on `glob@^13.0.6` (`<=14.0.1`) and `editorconfig@^3.0.2`, which still sit inside the `GHSA-g3hv-75wg-m249` range unless `glob@14` / `editorconfig@4` / `minimatch@11` (ESM-first `minimatch`) cross-major overrides are forced without upstream `sequelize-cli` / `js-beautify` support.

---

## 6. Dependency Health Audit

- **Unused Dependencies Removed**:
  - Removed unused `@testing-library/user-event` (`^14.6.1`) from [client/package.json](file:///c:/Users/rathj/NEXNUV-Recruitment/client/package.json) `devDependencies` (zero imports found anywhere in `client/`). All remaining production and dev dependencies in both `recruitment-service/` and `client/` were verified in active use.
- **Duplicate Dependency Versions**:
  - Eliminated duplicate `uuid` (`8.3.2` nested + `11.1.1` root -> single `11.1.1`).
  - Remaining transitive multi-version packages are benign non-vulnerable upstream version splits (e.g., `recruitment-service`: `debug 2.6.9/4.4.3`, `minimatch 3.1.5` [nodemon] / `9.0.9` [sequelize-cli], `picomatch 2.3.2/4.0.7`, `qs 6.16.2/6.17.1`, `mime 1.6.0/2.6.0`; `client`: `lru-cache`, `agent-base`, `https-proxy-agent`, `glob-parent`, `picomatch` in `vitest`/`jsdom`/`postcss` trees).
- **Lockfile Consistency**:
  - Verified clean lockfile reproducibility in both workspaces via `npm ci --dry-run --ignore-scripts` (`exit code 0`, `up to date`).

---

## 7. Post-Remediation Verification Results

| Check | Command | Outcome | Notes |
|---|---|---|---|
| **Backend Syntax** | `node --check` on all `recruitment-service/src/**/*.js` | **PASSED** | Zero syntax errors after [job.routes.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/job/job.routes.js) update |
| **Backend Zod / Sequelize Suite** | `npm --prefix recruitment-service test` | **PASSED (`26/26`, 7 files)** | Vitest `4.1.12` + PGlite + `zod@4.6.7` + deduped `uuid@11.1.1`; covers auth, tenant, RBAC, upload magic-bytes, `__proto__` `422`, `javascript:` URI `422`, `recruitmentConfig` roundtrip, transaction rollback |
| **Frontend Suite** | `npm --prefix client test` | **PASSED (`12/12`, 1 file)** | Vitest `4.1.12` + `@testing-library/react@16.3.3` |
| **Frontend Build** | `npm --prefix client run build` | **PASSED** | Vite `6.4.6` transformed `2154 modules` cleanly |
| **Neon DB Migrations** | `cd recruitment-service && npx sequelize-cli db:migrate:status` | **PASSED** | Sequelize CLI `6.6.5` / ORM `6.37.8`; `20261110000001` & `20261111000001` both `up` |
| **Client Audits** | `npm --prefix client audit --omit=dev` & `npm --prefix client audit` | **PASSED (`0` vulnerabilities)** | `40 prod / 256 dev / 295 total` |
| **Backend Prod Audit** | `npm --prefix recruitment-service audit --omit=dev` | **5 `moderate`, `0` high, `0` critical** | `224 prod / 129 dev / 354 total`; only `sequelize-cli -> js-beautify` upstream chain |
| **Backend Full Audit** | `npm --prefix recruitment-service audit` | **5 `moderate`, `0` high, `0` critical** | `0` dev vulnerabilities (`vitest@4.1.12`, `nodemon@3.1.11`) |
| **Lockfile Sync** | `npm ci --dry-run --ignore-scripts` (both workspaces) | **PASSED** | Zero `package.json` / `package-lock.json` drift |

