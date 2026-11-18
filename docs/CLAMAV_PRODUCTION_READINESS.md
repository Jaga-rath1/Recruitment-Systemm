# ClamAV Production Readiness & Live Probe — NEXNUV Recruitment

**Verification Date:** 2026-11-12  
**Live Daemon Status (`127.0.0.1:3310`):** **CLOSED_ECONNREFUSED** (`BLOCKED` when `MALWARE_SCAN_REQUIRED=true`)  
**Fail-Closed Guard Status:** **PASS**

---

## 1. Live Socket & Fail-Closed Probe Results

1. **TCP Port Probe (`127.0.0.1:3310`)**: Returned `CLOSED_ECONNREFUSED` (no local `clamd` daemon running).
2. **Real `malwareScanner.js` Fail-Closed Test**: Executed `scanDocumentBuffer` directly with `MALWARE_SCANNER_MODE=CLAMAV`, `MALWARE_SCAN_REQUIRED=true`, `CLAMAV_HOST=127.0.0.1`, `CLAMAV_PORT=3310`:
   - Observed result: `CLAMAV_FAIL_CLOSED: 503 MALWARE_SCANNER_UNAVAILABLE SCAN_FAILED ECONNREFUSED`.
   - Upload was blocked cleanly by fail-closed policy when `clamd` was offline.

---

## 2. Implementation Verification (`malwareScanner.js` & `storage.routes.js`)

- [malwareScanner.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/integrations/storage/malwareScanner.js):
  - Streams upload buffer over TCP `zINSTREAM` protocol in 64 KB length-prefixed chunks (`writeUInt32BE`), bounded by `MALWARE_SCAN_TIMEOUT_MS` (`5000ms`) and `MALWARE_SCAN_MAX_BYTES` (`15 MiB`).
  - Parses `stream: OK` (`CLEAN`), `stream: <threat> FOUND` (`INFECTED` / quarantined as `*.quarantine` + `*.meta.json` when `QUARANTINE_INFECTED_FILES=true` -> `422 MALWARE_DETECTED`), and disconnects/timeouts (`503 MALWARE_SCANNER_UNAVAILABLE`).
- [storage.routes.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/storage/storage.routes.js#L11):
  - Enforces `BLOCKED_SCAN_STATUSES = new Set(['INFECTED', 'QUARANTINED', 'SCAN_FAILED'])`, returning `403 DOCUMENT_QUARANTINED` on any download attempt for blocked documents.
- [storageAndDocumentSecurity.test.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/tests/integration/storageAndDocumentSecurity.test.js): Verifies EICAR quarantine and blocked download using local TCP mock server within the `40/40` backend test suite.

---

## 3. Production Policy Decision Required

- If enterprise security policy mandates malware scanning on candidate resumes, offer letters, joining letters, and payment proofs: deploy a `clamd` sidecar/container (`MALWARE_SCANNER_MODE=CLAMAV`, `MALWARE_SCAN_REQUIRED=true`, `CLAMAV_HOST`, `CLAMAV_PORT=3310`) before launch (**currently BLOCKED** until daemon is live).
- If launching initially with magic-byte + extension validation only (`MALWARE_SCANNER_MODE=DISABLED`, `MALWARE_SCAN_REQUIRED=false`), explicit Release/Security sign-off accepting `REC-RSK-001` is required.

