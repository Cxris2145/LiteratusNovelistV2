Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "      Iniciando Literatus Novelist V2 (Full Stack)" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

$root = $PSScriptRoot

Write-Host "1. Iniciando Backend Django en http://127.0.0.1:8000..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\respaldos-software\LiteratusNovelist-main\Producto\backend'; & '.\.venv\Scripts\python.exe' manage.py runserver 127.0.0.1:8000"

Write-Host "2. Iniciando Frontend Angular en http://localhost:4200..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\respaldos-software\LiteratusNovelist-main\Producto\frontend'; npm start"

Write-Host ""
Write-Host "Servidores iniciados en ventanas independientes:" -ForegroundColor Green
Write-Host " - Backend:  http://127.0.0.1:8000/api/health/" -ForegroundColor Green
Write-Host " - Frontend: http://localhost:4200/" -ForegroundColor Green
