param(
  [string]$StorageRoot = "./recruitment-service/storage",
  [string]$OutputDir = "./backups/storage"
)

if (-not (Test-Path $StorageRoot)) {
  Write-Error "Storage directory not found: $StorageRoot"
  exit 1
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$archiveFile = Join-Path $OutputDir "nexnuv_storage_$timestamp.zip"
$manifestFile = "$archiveFile.sha256"

Write-Host "Archiving document storage from $StorageRoot to $archiveFile ..." -ForegroundColor Cyan
Compress-Archive -Path (Join-Path $StorageRoot "*") -DestinationPath $archiveFile -Force
$hash = (Get-FileHash -Path $archiveFile -Algorithm SHA256).Hash.ToLowerInvariant()
"$hash  $(Split-Path -Leaf $archiveFile)" | Out-File -FilePath $manifestFile -Encoding ascii

Write-Host "Storage backup created cleanly: $archiveFile" -ForegroundColor Green
Write-Host "SHA-256 manifest: $manifestFile ($hash)" -ForegroundColor Green

