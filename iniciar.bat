@echo off
echo ========================================================
echo       Iniciando Literatus Novelist V2 (Full Stack)
echo ========================================================
echo.
echo 1. Iniciando Backend Django (http://127.0.0.1:8000)...
start "Literatus Backend (Django)" cmd /k "cd /d "%~dp0respaldos-software\LiteratusNovelist-main\Producto\backend" && .venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000"

echo 2. Iniciando Frontend Angular (http://localhost:4200)...
start "Literatus Frontend (Angular)" cmd /k "cd /d "%~dp0respaldos-software\LiteratusNovelist-main\Producto\frontend" && npm start"

echo.
echo ========================================================
echo Servidores iniciados en ventanas separadas:
echo - Backend:  http://127.0.0.1:8000/api/health/
echo - Frontend: http://localhost:4200/
echo ========================================================
pause
