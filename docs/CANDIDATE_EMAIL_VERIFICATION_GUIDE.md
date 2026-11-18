# NEXNUV Recruitment — Candidate Email Verification Guide (Phase 4.4)

## 1. Security Principle & Unverified Isolation
Every external candidate registering at `POST /api/v1/auth/candidate/register` must prove control of the email address before receiving any Candidate Portal JWT session or accessing `/api/v1/portal/*`:

1. **Email Normalization**: All registration, login, verification, resend, and apply requests normalize email using `trim().toLowerCase()`.
2. **Duplicate Prevention**: Case-insensitive lookup (`LOWER(email)`) plus PostgreSQL `UNIQUE` index on `candidate_accounts(email)` prevents concurrent duplicate accounts (`409 EMAIL_ALREADY_REGISTERED`).
3. **Zero Pre-Verification Session**: `POST /api/v1/auth/candidate/register` returns HTTP `201` with `requiresEmailVerification: true`, `emailVerified: false`, and **no JWT**. Forged JWTs minted manually with unverified accounts are rejected on every portal call (`401 EMAIL_NOT_VERIFIED`).
4. **Password Policy**: Registration enforces minimum length `8`–`128`, upper + lower + number + symbol (`strongPasswordSchema`).

## 2. Cryptographic OTP Lifecycle & Anti-Abuse Controls

| Control | Implementation | Location |
|---|---|---|
| **CSPRNG Code Generation** | `crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')` | [candidateSecurity.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/utils/candidateSecurity.js) |
| **Hashed Storage** | Keyed HMAC-SHA256 using `CANDIDATE_TOKEN_HASH_SECRET` with purpose tag (`EMAIL_VERIFY:<otp>`) verified via `crypto.timingSafeEqual` | [candidateSecurity.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/utils/candidateSecurity.js) |
| **Expiry Window** | `CANDIDATE_OTP_TTL_MINUTES` (default `10` min) | [env.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/config/env.js) |
| **Attempt Lockout** | Invalid OTPs increment `verification_attempts`; at `CANDIDATE_OTP_MAX_ATTEMPTS` (default `5`), OTP hash is invalidated and `verification_locked_until` is set for `CANDIDATE_OTP_LOCK_MINUTES` (default `15` min) returning `429 VERIFICATION_LOCKED` | [candidateIdentity.service.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/candidate/candidateIdentity.service.js) |
| **Atomic Single-Use** | Conditional SQL `CandidateAccount.update` checks `emailVerified: false`, matching `verificationTokenHash`, and `verificationExpiresAt > now`, then clears OTP fields | [candidateIdentity.service.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/candidate/candidateIdentity.service.js) |
| **Resend Cooldown** | Enforces `CANDIDATE_VERIFICATION_RESEND_COOLDOWN_SECONDS` (default `60`s) in both DB (`verification_sent_at`) and bounded in-memory anti-enumeration cache; invalidates prior OTP by overwriting `verification_token_hash` | [candidateIdentity.service.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/candidate/candidateIdentity.service.js) |
| **Rate Limiting** | `candidateVerificationLimiter` on `/verify-email` and `/resend-verification` + `authRateLimiter` on `/register` | [rateLimiter.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/middleware/rateLimiter.js) |

## 3. Fail-Closed Transactional Email Architecture (`EMAIL_PROVIDER`)

### Why Notification Service (`4006`) Cannot Send Candidate OTP / Reset Tokens
Inspection of shared read-only `notification-service` (`PORT 4006`, left untouched) confirms two hard architectural blockers for secret auth tokens:
1. `POST /api/v1/notifications` enforces `[requireAuth, requireOrgContext, requireNotifier]`, returning `403` without tenant `x-organization-id`, whereas external Candidate Portal users are tenantless (`organisationId: null`).
2. `notification-service` persists notification bodies & metadata in PostgreSQL and silently falls back to `ethereal`/`jsonTransport` returning `sent: true`, violating confidential secret handling and fail-closed delivery requirements.

### Recruitment-Owned Email Adapter (`email.adapter.js`)
Candidate security emails (verification OTP and password reset) are dispatched directly by [email.adapter.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/integrations/email/email.adapter.js) inside Recruitment without message brokers:
- Supported providers: `RESEND` (`POST https://api.resend.com/emails`), `BREVO` (`POST https://api.brevo.com/v3/smtp/email`), `SMTP` (`nodemailer` enforcing TLS `>=1.2`), and fail-closed `DISABLED`.
- In `NODE_ENV=production`, `env.validateEmailConfiguration` aborts startup fatally if `EMAIL_PROVIDER=DISABLED` (unless explicit `ALLOW_UNCONFIGURED_EMAIL_IN_PRODUCTION=true` dev override is set) or if active provider credentials / SMTP TLS requirements are missing.
- Signup wraps `CandidateAccount.create` and OTP dispatch in a Sequelize transaction: if delivery fails (`503 EMAIL_DELIVERY_UNAVAILABLE`), the candidate account transaction rolls back cleanly.
- `setTestEmailTransport` throws immediately unless `process.env.NODE_ENV === 'test'`.
- Structured audit logs record security events while Pino redacts `otp`, `verificationCode`, `verificationToken`, `apiKey`, `pass`, and `tokenHashSecret` ([logger.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/config/logger.js)).

## 4. API & Frontend Flow
- `POST /api/v1/auth/candidate/register` -> creates unverified account, emails 6-digit OTP -> navigates UI to OTP confirmation / `/verify-email`.
- `POST /api/v1/auth/candidate/verify-email` -> validates OTP atomically (`emailVerified = true`) -> redirects to Sign In (user signs in cleanly at `POST /api/v1/auth/candidate/login`).
- `POST /api/v1/auth/candidate/resend-verification` -> returns generic `200` with `60s` cooldown enforcement (`429 VERIFICATION_RESEND_COOLDOWN`).
- Unverified login attempts return `403 EMAIL_NOT_VERIFIED` and link directly to [CandidateVerifyEmailPage.jsx](file:///c:/Users/rathj/NEXNUV-Recruitment/client/src/modules/marketing/CandidateVerifyEmailPage.jsx).

