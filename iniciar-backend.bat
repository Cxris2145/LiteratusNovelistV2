@echo off
echo Iniciando Backend Django (http://127.0.0.1:8000)...
cd /d "%~dp0respaldos-software\LiteratusNovelist-main\Producto\backend"
.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
pause
