param(
  [string]$DatabaseUrl = $env:DATABASE_URL,
  [string]$OutputDir = "./backups"
)

if (-not $DatabaseUrl) {
  Write-Error "DATABASE_URL is required."
  exit 1
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupFile = Join-Path $OutputDir "nexnuv_recruitment_$timestamp.dump"

Write-Host "Backing up database to $backupFile ..." -ForegroundColor Cyan
pg_dump --format=custom --no-owner --no-acl --dbname="$DatabaseUrl" --file="$backupFile"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "Backup created successfully: $backupFile" -ForegroundColor Green

