@echo off
REM ==========================================================================
REM  Genera el catalogo de personajes IA de todos los libros (DeepSeek).
REM  Doble clic para arrancar. Dejar el PC encendido; se puede cerrar y volver
REM  a abrir cuando quieras: retoma donde quedo.
REM  Para en [STOP] si se acaba el saldo de DeepSeek -> recarga y vuelve a abrir.
REM ==========================================================================
cd /d "%~dp0"
set PY=.venv\Scripts\python.exe

:loop
echo.
echo ===== Ejecutando generador de personajes =====
%PY% -u scripts\scraping_import\discover_characters_gemini.py --provider deepseek --sleep 0.5

echo.
echo ===== Comprobando libros pendientes =====
%PY% -c "import django,os;os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings');django.setup();from ai_engine.models import AIAvatar;from catalog.models import Book;from django.db.models import Exists,OuterRef;import sys;n=Book.objects.annotate(h=Exists(AIAvatar.objects.filter(edition__book=OuterRef('pk')))).filter(h=False).count();print('LIBROS PENDIENTES:',n);sys.exit(0 if n==0 else 1)"

if errorlevel 1 (
  echo.
  echo Aun quedan libros. Reintento en 30 s... (Ctrl+C para cortar)
  timeout /t 30 /nobreak >nul
  goto loop
)

echo.
echo ==========================================================
echo  LISTO: todos los libros tienen personajes.
echo ==========================================================
pause
