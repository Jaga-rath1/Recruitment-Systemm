param(
  [Parameter(Mandatory=$true)][string]$BackupFile,
  [Parameter(Mandatory=$true)][string]$TargetDatabaseUrl
)

if (-not (Test-Path $BackupFile)) {
  Write-Error "Backup file not found: $BackupFile"
  exit 1
}

Write-Host "Restoring $BackupFile into target PostgreSQL database..." -ForegroundColor Yellow
pg_restore --clean --if-exists --no-owner --no-acl --dbname="$TargetDatabaseUrl" "$BackupFile"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "Restore completed successfully." -ForegroundColor Green

