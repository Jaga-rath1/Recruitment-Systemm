Write-Host "=== Running Backend Automated Tests ===" -ForegroundColor Cyan
npm --prefix recruitment-service test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "=== Running Frontend Automated Tests ===" -ForegroundColor Cyan
npm --prefix client test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "=== All NEXNUV Recruitment Tests Passed ===" -ForegroundColor Green

