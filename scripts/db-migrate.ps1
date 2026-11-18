param(
  [switch]$Seed
)

Write-Host "Running Sequelize migrations for recruitment-service..." -ForegroundColor Cyan
npm --prefix recruitment-service run db:migrate
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if ($Seed) {
  Write-Host "Seeding baseline canonical permissions..." -ForegroundColor Cyan
  npm --prefix recruitment-service run seed
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
