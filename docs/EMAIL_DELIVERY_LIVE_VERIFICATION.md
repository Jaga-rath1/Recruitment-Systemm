# Transactional Email Live Verification — NEXNUV Recruitment Microservice

**Verification Date:** 2026-11-12  
**Verification Status:** **BLOCKED** *(Live `RESEND`, `BREVO`, or TLS `SMTP` credentials are unprovisioned in `recruitment-service/.env`, which currently runs with `EMAIL_PROVIDER=DISABLED`.)*

---

## 1. Safe Environment Check & Architectural Isolation

- Checked `recruitment-service/.env` safely: `EMAIL_PROVIDER` is not set (defaults to `DISABLED`), and `RESEND_API_KEY`, `BREVO_API_KEY`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, and `CANDIDATE_TOKEN_HASH_SECRET` are unset in dev `.env`.
- Direct inspection of [email.adapter.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/integrations/email/email.adapter.js) confirms **zero dependency on shared `notification-service` (`4006`)** for tenantless candidate identity emails (`sendVerificationOtpEmail`, `sendPasswordResetEmail`), avoiding cross-service DB secret logging or tenant header failures.

---

## 2. Inspected Adapter & Security Controls (`PASS` Code & Fail-Fast Probes)

- **Supported Providers**: `RESEND` (`POST ${baseUrl}/emails`), `BREVO` (`POST ${baseUrl}/v3/smtp/email`), and `SMTP` (`nodemailer@^10.5.0` with `minVersion: 'TLSv1.2'` and `requireTLS: !secure && requireTls`).
- **Timeouts & Error Handling**: HTTP fetch uses `AbortSignal.timeout(emailCfg.timeoutMs)` (`10000ms` default) and SMTP enforces `connectionTimeout`, `greetingTimeout`, and `socketTimeout`. Upstream errors throw `503 EMAIL_DELIVERY_UNAVAILABLE` without falling back to an ethereal/test transport outside `NODE_ENV=test`.
- **OTP & Reset Token Confidentiality**:
  - OTPs and reset tokens are hashed via HMAC-SHA256 using `CANDIDATE_TOKEN_HASH_SECRET` ([candidateSecurity.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/utils/candidateSecurity.js)) before DB storage (`candidate_accounts`).
  - Logs emit only recipient domain (`getSafeRecipientDomain(to)`), never raw email bodies, OTPs, or reset tokens.
- **Production Fail-Fast Verified (`PASS`)**: Direct subprocess tests confirmed `NODE_ENV=production` refuses startup when:
  - `EMAIL_PROVIDER=DISABLED` without `ALLOW_UNCONFIGURED_EMAIL_IN_PRODUCTION=true` (`email_disabled_in_prod: BLOCKED_OK`)
  - `EMAIL_PROVIDER=SMTP` with `SMTP_REQUIRE_TLS=false` (`smtp_insecure_tls_in_prod: BLOCKED_OK`)
  - `CANDIDATE_TOKEN_HASH_SECRET` missing (`missing_hash_secret: BLOCKED_OK`)

---

## 3. Required Live Acceptance Procedure (Once Credentials Are Provisioned)

1. Provision `EMAIL_PROVIDER=RESEND|BREVO|SMTP`, verified `EMAIL_FROM`, `CANDIDATE_TOKEN_HASH_SECRET`, and provider key in staging.
2. Register a controlled inbox via `POST /api/v1/auth/candidate/register`.
3. Confirm physical inbox receipt of the 6-digit OTP; confirm logs omit plaintext OTP.
4. Verify OTP (`POST /verify-email`), sign in (`POST /login`), verify OTP replay rejection (`400`), test resend cooldown (`429`), and exercise `forgot-password` -> `reset-password` -> old JWT rejection (`401`).

