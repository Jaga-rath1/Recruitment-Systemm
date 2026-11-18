# NEXNUV Recruitment — Storage Backup, Integrity Verification & Disaster Recovery

This document defines backup, integrity verification, orphan reconciliation, and recovery procedures spanning Neon PostgreSQL document metadata and private document storage (`LOCAL_SECURE` and approved production provider `CLOUDINARY`).

---

## 1. Metadata-to-Storage Data Model

Every stored file in `recruitment-service` has both a stored asset (`<storage_key>` / Cloudinary `public_id`) and a durable PostgreSQL metadata record containing its SHA-256 checksum, malware scan state, and Cloudinary asset descriptors ([20261111000002](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/db/migrations/20261111000002-add-document-security-metadata.js), [20261111000003](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/db/migrations/20261111000003-add-cloudinary-document-metadata.js)):

1. **`application_documents`**: `storage_key`, `storage_provider`, `cloudinary_public_id`, `cloudinary_resource_type`, `cloudinary_format`, `cloudinary_version`, `storage_visibility`, `checksum_sha256`, `scan_status`, `scan_checked_at`, `scan_engine`
2. **`offer_documents`**: `storage_key`, `storage_provider`, `cloudinary_public_id`, `cloudinary_resource_type`, `cloudinary_format`, `cloudinary_version`, `storage_visibility`, `checksum_sha256`, `scan_status`, `scan_checked_at`, `scan_engine`
3. **`joining_records`**: `joining_letter_storage_key`, `joining_letter_storage_provider`, `joining_letter_file_size_bytes`, `joining_letter_cloudinary_public_id`, `joining_letter_cloudinary_resource_type`, `joining_letter_cloudinary_format`, `joining_letter_cloudinary_version`, `joining_letter_visibility`, `joining_letter_checksum_sha256`, `joining_letter_scan_status`, `joining_letter_scan_checked_at`
4. **`subscription_payments`**: `proof_file_key`, `proof_storage_provider`, `proof_file_size_bytes`, `proof_cloudinary_public_id`, `proof_cloudinary_resource_type`, `proof_cloudinary_format`, `proof_cloudinary_version`, `proof_visibility`, `proof_checksum_sha256`, `proof_scan_status`, `proof_scan_checked_at`

Download authorization in [storage.routes.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/modules/storage/storage.routes.js) requires **both** a valid short-lived HMAC download token AND the matching non-quarantined PostgreSQL metadata row. Deleting or invalidating a DB row immediately denies download access even if an asset remains in Cloudinary backups.

---

## 2. Backup Procedures

### A. Database + Storage Snapshot Alignment
To guarantee point-in-time consistency between metadata and file assets:
1. **Cloudinary Production (`STORAGE_DRIVER=CLOUDINARY`)**:
   - Enable Cloudinary **Media Library Auto-Backup** (account-level revision & soft-delete recovery) for authenticated assets stored under `CLOUDINARY_FOLDER_PREFIX`.
   - Because `uploadAuthenticatedBuffer` runs inside upload requests BEFORE PostgreSQL commits (with rollback `destroyAuthenticatedAsset` cleanup via `deleteFile` on transaction failure), enabling Cloudinary Auto-Backup guarantees that assets uploaded immediately around a Neon PITR snapshot boundary are recoverable by `cloudinary_public_id`, `cloudinary_resource_type`, `cloudinary_format`, and `cloudinary_version`.
   - Run Neon / PostgreSQL logical snapshots via [scripts/db-backup.ps1](file:///c:/Users/rathj/NEXNUV-Recruitment/scripts/db-backup.ps1):
     ```powershell
     ./scripts/db-backup.ps1 -DatabaseUrl $env:DATABASE_URL -OutputDir "./backups/db"
     ```
2. **Local Secure Storage (`STORAGE_DRIVER=LOCAL_SECURE`, single-volume dev/docker)**:
   - Run [scripts/storage-backup.ps1](file:///c:/Users/rathj/NEXNUV-Recruitment/scripts/storage-backup.ps1) followed immediately by [scripts/db-backup.ps1](file:///c:/Users/rathj/NEXNUV-Recruitment/scripts/db-backup.ps1):
     ```powershell
     ./scripts/storage-backup.ps1 -StorageRoot "./recruitment-service/storage" -OutputDir "./backups/storage"
     ./scripts/db-backup.ps1 -DatabaseUrl $env:DATABASE_URL -OutputDir "./backups/db"
     ```
   - [storage-backup.ps1](file:///c:/Users/rathj/NEXNUV-Recruitment/scripts/storage-backup.ps1) writes a companion `.sha256` manifest alongside every archive so backup corruption or tampering is caught before restore.

### B. Cloudinary Authenticated Delivery & Quarantine Isolation
- All confidential Recruitment documents are uploaded with `type: 'authenticated'` and `access_mode: 'authenticated'` ([cloudinaryClient.js](file:///c:/Users/rathj/NEXNUV-Recruitment/recruitment-service/src/integrations/storage/cloudinaryClient.js)).
- Public unauthenticated Cloudinary URLs are never persisted or exposed to the frontend; downloads are served solely through `GET /api/v1/files/download` after DB ownership + `scan_status` verification.
- Malware quarantine (`_quarantine`) occurs synchronously **before** any Cloudinary upload when `MALWARE_SCANNER_MODE=CLAMAV`, keeping infected payloads out of Cloudinary entirely.

---

## 3. Recovery & Verification Workflow

### A. Isolated Restoration Steps
1. **Restore Storage Assets First**:
   - **Cloudinary (`CLOUDINARY`)**: Restore missing or deleted authenticated assets for the target PITR window from Cloudinary Auto-Backup / revision history preserving the recorded `cloudinary_public_id` and `cloudinary_resource_type` (`raw` for documents, `image` when applicable).
   - **Local Volume (`LOCAL_SECURE`)**: Verify SHA-256 manifest automatically via [scripts/storage-restore.ps1](file:///c:/Users/rathj/NEXNUV-Recruitment/scripts/storage-restore.ps1):
     ```powershell
     ./scripts/storage-restore.ps1 -ArchiveFile "./backups/storage/nexnuv_storage_YYYYMMDD-HHMMSS.zip" -TargetStorageRoot "./recruitment-service/storage-restored"
     ```
2. **Restore Dedicated Neon PostgreSQL Database**:
   ```powershell
   ./scripts/db-restore.ps1 -BackupFile "./backups/db/nexnuv_recruitment_YYYYMMDD-HHMMSS.dump" -TargetDatabaseUrl $TARGET_DATABASE_URL
   ```
3. **Run Schema Migration Parity Check**:
   ```bash
   cd recruitment-service && npx sequelize-cli db:migrate:status
   ```

### B. Post-Restore Checksum & Orphan Verification
1. Verify all four metadata tables have zero `INFECTED` rows leaked into active access and check missing Cloudinary/checksum metadata counts:
   ```sql
   SELECT COUNT(*) AS missing_app_docs FROM application_documents WHERE storage_key IS NULL OR checksum_sha256 IS NULL;
   SELECT COUNT(*) AS quarantined_docs FROM application_documents WHERE scan_status IN ('INFECTED', 'QUARANTINED', 'SCAN_FAILED');
   SELECT COUNT(*) AS missing_cloudinary_id FROM application_documents WHERE storage_provider = 'CLOUDINARY' AND cloudinary_public_id IS NULL;
   ```
2. Verify sample downloaded files match stored `checksum_sha256` digests (`sha256sum` / PowerShell `Get-FileHash -Algorithm SHA256`).
3. **Orphan Asset Reconciliation**:
   Any asset under `CLOUDINARY_FOLDER_PREFIX` in Cloudinary (or under `STORAGE_LOCAL_ROOT` outside `_quarantine`) whose `public_id` / `storage_key` does not appear in any of `application_documents`, `offer_documents`, `joining_records`, or `subscription_payments` older than the active upload timeout window (> 1 hour) may be safely swept by an external operational cron after double-checking DB read replica state.

> **Verification Status Note**: [storage-backup.ps1](file:///c:/Users/rathj/NEXNUV-Recruitment/scripts/storage-backup.ps1) and [storage-restore.ps1](file:///c:/Users/rathj/NEXNUV-Recruitment/scripts/storage-restore.ps1) are implemented PowerShell operational scripts; live Cloudinary Media Library backup/restore execution has not yet been run because live Cloudinary account credentials are not configured in this environment (**Classification B**).
