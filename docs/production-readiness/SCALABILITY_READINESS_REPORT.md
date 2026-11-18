# NEXNUV Recruitment — Single-Instance vs. Multi-Instance Scalability Readiness Report

**Audit Date:** November 18, 2026  
**Architecture Constraint:** Strictly PostgreSQL + Sequelize + Synchronous REST adapters + Cloudinary (No Redis, RabbitMQ, BullMQ, or Kafka; shared services `:4000–:4006` are read-only).

---

## 1. Readiness Verdict

| Deployment Topology | Status | Summary |
| :--- | :---: | :--- |
| **Single-Instance Deployment** (1 Node.js process + Managed PostgreSQL + Cloudinary) | **READY (after external env prerequisites)** | All process-local concurrency locks, rate limiters, and idempotency guards operate consistently within a single V8 heap; verified up to 50–150 concurrent virtual users with 0% errors. |
| **Multi-Instance Horizontal Scaling** (2+ replicas behind Load Balancer / Kubernetes HPA) | **BLOCKED (Not Safe Yet)** | Process-local in-memory state + read-only downstream Employee Service lacking email uniqueness or Idempotency-Key create duplicate-provisioning race conditions across pods. |

---

## 2. Complete Inventory of Process-Local In-Memory State

Every stateful `Map` / `Set` in `recruitment-service/src` was audited for multi-instance impact:

| # | Location | Data Structure | Purpose | Single-Instance Behavior | Multi-Instance Impact | Severity |
| :-: | :--- | :--- | :--- | :--- | :--- | :---: |
| **1** | [joining.service.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/joining/joining.service.js#L417) | `inFlightRetries` (`Map`) | Collapses concurrent `POST /joining/:id/retry-employee-sync` requests | Prevents duplicate calls to Employee Service | **BLOCKER:** Pod A and Pod B have separate Maps; simultaneous retries both call `POST /api/v1/employees` on Employee Service (`:4004`), which lacks a `(organization_id, LOWER(email))` unique index or `Idempotency-Key` support, creating duplicate employee records. | **HIGH (Blocker)** |
| **2** | [storage.adapter.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/integrations/storage/storage.adapter.js) | Local disk `./storage/` (`STORAGE_DRIVER=LOCAL_SECURE`) | Stores uploaded resumes, offers, joining letters, payment proofs | Works cleanly on 1 node | **BLOCKER if `LOCAL_SECURE`:** Files written on Pod A return `404` when downloaded from Pod B. **Resolved by switching to `STORAGE_DRIVER=CLOUDINARY`.** | **HIGH (Config-Resolvable)** |
| **3** | [subscription.service.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/subscription/subscription.service.js#L38) | `verificationInFlight` (`Set`) | In-process guard for payment verification | Prevents concurrent double-approval | **Mitigated at DB layer** via Sequelize `LOCK.UPDATE` row lock on `subscriptions`, though external provisioning calls prior to commit still benefit from PostgreSQL advisory locking. | **LOW (DB-Mitigated)** |
| **4** | [activation.service.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/subscription/activation.service.js#L20) | `activationInFlight` (`Set`) | In-process guard for org admin activation | Prevents concurrent token redemption | **Mitigated at DB layer** via atomic conditional `UPDATE ... WHERE status = 'APPROVED' AND activation_token_hash = :hash` (`affected !== 1` throws 409). | **LOW (DB-Mitigated)** |
| **5** | [webhookAuth.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/middleware/webhookAuth.js#L8) | `processedEventCache` (`Map`) | Replay protection for email delivery webhooks | Blocks duplicate webhook IDs on 1 node | Replayed webhook routed to Pod B is not seen in Pod A's Map (replay check becomes best-effort). | **MEDIUM** |
| **6** | [rateLimiter.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/middleware/rateLimiter.js) | Default `MemoryStore` | Per-IP rate limiting (API, auth, OTP, recovery) | Enforces exact limits | Effective rate limit scales by `N` replicas (e.g., 3 pods = 3× allowance) unless enforced at API Gateway (`:4000`) / WAF / Ingress. | **MEDIUM** |
| **7** | [candidateIdentity.service.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/candidate/candidateIdentity.service.js#L28-L29) | `resendCooldownByEmail`, `resetCooldownByEmail` (`Map`) | Fast-path OTP & reset cooldowns | Enforces cooldown | **Mitigated at DB layer:** Service also persists and checks `verificationSentAt` and `resetSentAt` in `candidate_accounts`. | **LOW (DB-Mitigated)** |
| **8** | [notification.adapter.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/integrations/notification/notification.adapter.js#L29) | `deliveryLedger` (`Map`) | In-memory lookup for webhook delivery confirmation | Matches sent notifications | **Limitation:** `recordDeliveryConfirmation` checks in-memory `deliveryLedger` before updating `recruitment_notification_history`. On Pod B, webhook confirmations for emails dispatched by Pod A will be ignored unless DB lookup fallback is added. | **MEDIUM** |
| **9** | [auth.adapter.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/integrations/auth/auth.adapter.js#L31-L32) | `standaloneUsersByEmail`, `standaloneUsersById` (`Map` + local JSON file) | Standalone dev/pilot user store | Persists across restarts on 1 node | **N/A in Production:** `env.js` strictly enforces `INTEGRATION_MODE=live` in `NODE_ENV=production`, delegating all staff auth to Auth Service (`:4001`). | **NONE (Dev-Only)** |

---

## 3. Required Compatible Changes Before Multi-Instance Rollout

Without introducing Redis/RabbitMQ/BullMQ:
1. **Shared Employee Service (`:4004` — requires shared-service team approval):**
   - Add unique index `CREATE UNIQUE INDEX employees_org_email_unique ON employees (organization_id, LOWER(email));` **and/or** implement RFC `Idempotency-Key` support on `POST /api/v1/employees`.
2. **Recruitment Service (PostgreSQL-native improvements):**
   - Switch `STORAGE_DRIVER=CLOUDINARY` in all multi-replica environments.
   - Persist webhook replay event IDs in a PostgreSQL `processed_webhook_events` table (with TTL cleanup) instead of `processedEventCache` Map.
   - Update `notification.adapter.js` `recordDeliveryConfirmation()` to fall back to querying `recruitment_notification_history` by `notificationId` / `providerMessageId` when `deliveryLedger` misses.
   - Enforce global rate limiting at API Gateway (`:4000`) / cloud WAF ingress in addition to per-pod Express limits.
   - Consider PostgreSQL session-level `pg_try_advisory_lock(hashtext(lockKey))` around `retryEmployeeSync` once Employee Service adds idempotency protection.
