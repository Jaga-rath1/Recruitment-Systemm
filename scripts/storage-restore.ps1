param(
  [Parameter(Mandatory=$true)][string]$ArchiveFile,
  [Parameter(Mandatory=$true)][string]$TargetStorageRoot,
  [string]$ExpectedSha256 = ""
)

if (-not (Test-Path $ArchiveFile)) {
  Write-Error "Backup archive not found: $ArchiveFile"
  exit 1
}

$manifestFile = "$ArchiveFile.sha256"
if (-not $ExpectedSha256 -and (Test-Path $manifestFile)) {
  $line = (Get-Content $manifestFile -First 1).Trim()
  $ExpectedSha256 = ($line -split '\s+')[0]
}

if ($ExpectedSha256) {
  $actualHash = (Get-FileHash -Path $ArchiveFile -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualHash -ne $ExpectedSha256.ToLowerInvariant()) {
    Write-Error "Checksum verification failed! Expected $ExpectedSha256, got $actualHash"
    exit 1
  }
  Write-Host "Backup SHA-256 checksum verified: $actualHash" -ForegroundColor Green
}

New-Item -ItemType Directory -Force -Path $TargetStorageRoot | Out-Null
Write-Host "Restoring archive $ArchiveFile into $TargetStorageRoot ..." -ForegroundColor Yellow
Expand-Archive -Path $ArchiveFile -DestinationPath $TargetStorageRoot -Force
Write-Host "Storage restore completed cleanly." -ForegroundColor Green

