# Ejecutar Literatus

Esta guia permite iniciar Literatus de forma repetible desde la raiz del workspace.

## Prompt listo para usar

Copia y envia este mensaje a la IA:

> Ejecuta Literatus. Sigue `EJECUTAR_LITERATUS.md` y usa `Start-Literatus.ps1`. No inicies procesos duplicados si los puertos 8000 o 4200 ya estan ocupados. Verifica el health check, la API del catalogo y el frontend. No modifiques la base de datos, `.env`, los EPUB ni ejecutes importaciones. Abre la aplicacion y dime cuantos libros devolvio el catalogo.

La version corta tambien sirve:

> Ejecuta Literatus.

`AGENTS.md` contiene una instruccion persistente para que los agentes reconozcan esa frase.

## Inicio con un solo comando

Desde `C:\Users\guerr\Downloads\LiteratusNovelist`:

```powershell
.\Start-Literatus.ps1 -OpenBrowser
```

Si Windows bloquea scripts locales:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\guerr\Downloads\LiteratusNovelist\Start-Literatus.ps1" -OpenBrowser
```

## Que hace el lanzador

1. Localiza la aplicacion en `respaldos-software\LiteratusNovelist-main`.
2. Comprueba los puertos `8000` y `4200` para no duplicar servidores.
3. Ejecuta `manage.py check` antes de iniciar Django.
4. Inicia Django y Angular en segundo plano con ventanas ocultas.
5. Espera la respuesta del health check y del frontend.
6. Consulta la API del catalogo y muestra el numero de libros.
7. Guarda los registros en `.codex-run-logs` dentro de la aplicacion.

## Comprobacion esperada

- Aplicacion: `http://127.0.0.1:4200/`
- API: `http://127.0.0.1:8000/api/v1/`
- Health check: `http://127.0.0.1:8000/api/health/`
- Resultado final: `Status: RUNNING`

## Inicio manual de respaldo

Usa dos terminales solamente si el lanzador falla.

Backend:

```powershell
Set-Location "C:\Users\guerr\Downloads\LiteratusNovelist\respaldos-software\LiteratusNovelist-main\Producto\backend"
.\.venv\Scripts\python.exe manage.py check
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000 --noreload
```

Frontend:

```powershell
Set-Location "C:\Users\guerr\Downloads\LiteratusNovelist\respaldos-software\LiteratusNovelist-main\Producto\frontend"
npm start -- --host 127.0.0.1 --port 4200
```

No ejecutes migraciones, importaciones ni procesos de IA para simplemente abrir la aplicacion.
