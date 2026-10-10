# Logros 2.0 — estado del trabajo

Revisión retomada el 9 de octubre de 2026. Implementación terminada en el código local.

## Dónde había quedado

Ya existían cambios sin commit en los modelos, el motor de logros, los catálogos y las migraciones, además de un componente de marcos parcialmente integrado. La página de Logros, la colección, los avisos y la mayor parte de la integración visual todavía usaban la versión anterior.

Se conservaron los cambios anteriores del lector, los resúmenes de libros y la narración. No se publicó ni se aplicaron migraciones a Supabase.

## Resultado

- 45 logros con rareza, progreso, Tinta y premios cosméticos. Incluye Social, La Senda, Juegos, Lector activo y Colección.
- 47 cosméticos en la colección: 12 marcos, 10 títulos y 25 accesorios de Maguito. Ocho accesorios son nuevos; los cosméticos exclusivos indican qué logro los entrega.
- Logros con sección «Casi lo tienes», vistas previas de premios y fecha de desbloqueo. Colección permite probar, equipar y quitar objetos, o abrir El Bazar.
- Marcos compartidos entre perfil, menú, tarjeta de la Taberna, amigos y ranking. Títulos visibles junto al nombre en esas superficies.
- Avisos al iniciar sesión y después de acciones autenticadas, con consultas agrupadas, cola de celebraciones, premio y enlace «Ver premio». Cada logro mostrado se marca como notificado.
- Las migraciones crean los catálogos, entregan premios a logros ya desbloqueados y corrigen títulos antiguos. Los comandos de siembra comparten los mismos catálogos y conservan los precios editados.

También se corrigieron la evaluación de La Senda antes de guardar el nivel, la evaluación de estrellas al practicar y al saltar unidades, el saldo devuelto después de premios de colección, los disparadores con recompensa cero y el equipamiento de inventario con cantidad cero. El umbral guardado en el catálogo determina cada desbloqueo.

## Verificación

- **184 tests aprobados** en `catalog`, `library`, `learning` y `community`, con `config.test_settings` y SQLite.
- Django: `makemigrations --check --dry-run` sin cambios pendientes.
- Compilación Angular de desarrollo, comprobación de TypeScript/plantillas y compilación de producción aprobadas.
- Producción avisa que el bundle inicial mide **2,45 MB** frente al umbral de aviso de 2 MB; permanece por debajo del límite de error de 5 MB. También emite avisos de dependencias CommonJS y selectores de transiciones ya presentes en la aplicación.
- Navegador real con backend SQLite en 8010 y frontend de prueba en 4300: desbloqueo, notificación, inventario, equipar/quitar marco y título, prueba de los ocho accesorios, exclusivos ocultos en El Bazar y marcos/títulos de comunidad.
- Capturas en 1440 px y 390 px, temas oscuro y claro; sin errores de JavaScript ni desbordamiento horizontal en las vistas comprobadas. Resultados y capturas en `frontend/docs/audits/logros-v2/`.

Se aplicó la skill instalada `frontend-design`, manteniendo Cormorant Garamond, Plus Jakarta Sans y los colores de Literatus. Impeccable no está disponible como skill o ejecutable en este entorno; no se ejecutaron sus comandos `context` o `detect`.

## Repetir la revisión local

Desde `Producto/backend`, en PowerShell:

```powershell
New-Item -ItemType Directory -Path '.tmp-achievements-tests' -Force | Out-Null
$env:TEMP = (Resolve-Path '.tmp-achievements-tests').Path
$env:TMP = $env:TEMP
.\.venv\Scripts\python.exe manage.py test catalog library learning community --settings=config.test_settings --noinput
.\.venv\Scripts\python.exe scripts/preview_achievements.py
```

Desde `Producto/frontend`:

```powershell
node scripts/audit-achievements.mjs --start-servers
node node_modules/@angular/cli/bin/ng.js build --configuration production
```

La auditoría inicia sus propios servidores locales y un navegador sin ventana. Usa únicamente la cuenta ficticia y la SQLite en `.tmp-achievements-preview/`. Las sesiones y datos temporales están excluidos de Git. La compilación de producción necesita acceso a Google Fonts.

## Pendiente para verlo en el sitio publicado

Publicar los cambios y aplicar `learning/0005_cosmetics_v2` y `library/0011_achievements_v2` a la base compartida. El plan original exige autorización antes de migrar Supabase; Render ejecuta las migraciones al desplegar. No se ejecutó ese paso ni se creó un commit o PR.
