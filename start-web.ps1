Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "  Waku Encrypted Chat - Web Demo" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Starting Vite dev server..." -ForegroundColor Green
Write-Host ""
Write-Host "Web UI: http://localhost:5173" -ForegroundColor Yellow
Write-Host ""
Write-Host "Mock mode - messages work across browser tabs" -ForegroundColor Gray
Write-Host ""

Set-Location -Path "$PSScriptRoot\packages\web"
node node_modules/vite/bin/vite.js
