Write-Host "Setting up NEXNUV Recruitment..." -ForegroundColor Cyan

if (-not (Test-Path "recruitment-service/.env")) {
  Copy-Item "recruitment-service/.env.example" "recruitment-service/.env"
  Write-Host "Created recruitment-service/.env"
}

if (-not (Test-Path "client/.env")) {
  Copy-Item "client/.env.example" "client/.env"
  Write-Host "Created client/.env"
}

npm --prefix recruitment-service install
npm --prefix client install

Write-Host "Setup complete. Run scripts/db-migrate.ps1 when PostgreSQL / Neon DB is configured." -ForegroundColor Green
