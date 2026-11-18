# Database Backup & Recovery Strategy

## 1. Dedicated Database Isolation
NEXNUV Recruitment owns a dedicated PostgreSQL database (`nexnuv_recruitment`). Shared Employee, Auth, and Platform Admin databases are never queried directly or backed up inside this pipeline.

## 2. Backup Cadence
- **Continuous WAL Archiving (PITR)**: Enable PostgreSQL `archive_mode = on` (Neon automated PITR / encrypted WAL archive storage) for point-in-time recovery (RPO <= 5 minutes).
- **Daily Logical Backups**: Automated `pg_dump --format=custom --no-owner --no-acl` snapshots via `scripts/db-backup.ps1` (retained 30 days daily, 12 months monthly).
- **Pre-Migration Snapshots**: Mandatory automated snapshot before any `npm run db:migrate` execution in production.

## 3. Recovery Verification
- Monthly automated restore drill to an isolated verification database using `scripts/db-restore.ps1`.
- Verify row counts across `subscriptions`, `applications`, `offers`, `joining_records`, and `recruitment_audit_logs`.
- Ensure Cloudinary media backups and Neon PITR database snapshots stay metadata-synchronized (`cloudinary_public_id`, `cloudinary_resource_type`, `cloudinary_format`, `cloudinary_version`, `checksum_sha256`).

