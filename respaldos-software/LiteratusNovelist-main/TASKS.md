# TASKS.md — LiteratusNovelist
## Sistema de Tareas Multiagente

Actualizado: 2026-08-28
Coordinador: Project Manager Agent

---

## [LIBRARY] ETAPA 0 — ANÁLISIS (COMPLETADO)

- [x] [LIBRARY] Verificar arquitectura real del proyecto (2026-08-28)
- [x] [LIBRARY] Contar EPUBs disponibles en respaldos-software/books/ → 1046 EPUBs
- [x] [LIBRARY] Detectar carpetas sin EPUB → 63 carpetas vacías
- [x] [LIBRARY] Analizar bulk_db_injection.py y flujo de importación
- [x] [LIBRARY] Analizar modelos Book, Author, Edition, Chapter, UserInventory
- [x] [LIBRARY] Calcular espacio requerido (1.04 GB EPUBs → ~1-3 GB DB estimado)
- [x] [LIBRARY] Detectar posibles duplicados → el-principito confirmado, 8 grupos a revisar
- [x] [LIBRARY] Evaluar riesgos con SQLite + 1000 libros
- [x] [LIBRARY] Identificar portadas en EPUBs (~740 con portada, ~306 sin portada)
- [x] [LIBRARY] Crear Library Content Agent (agent.md)

---

## [LIBRARY] ETAPA 1 — INVENTARIO

- [x] [LIBRARY] Generar LIBRARY_INVENTORY.md (2026-08-28) con todos los 1046 EPUBs
- [x] [LIBRARY] Extraer titulo y autor del OPF de cada EPUB (2026-08-28)
- [x] [LIBRARY] Detectar EPUBs corruptos (2026-08-28) -> 0 corruptos, 29 con advertencias
- [x] [LIBRARY] Confirmar duplicados exactos (2026-08-28) -> 1 grupo exacto (SHA-256)
- [x] [LIBRARY] Registrar idioma de cada EPUB (2026-08-28) -> es:1001, en:39, desc:5, und:1
- [x] [LIBRARY] Registrar ISBN (2026-08-28) -> 8 con ISBN de 1046
- [x] [LIBRARY] Clasificar portadas (2026-08-28) -> con:889, sin:157

---

## [LIBRARY] ETAPA 2 — PREPARACIÓN Y PRUEBA PILOTO

- [x] [LIBRARY] Resolver ruta de importacion: respaldos-software/books/ -> media/books/ (2026-08-28)
- [x] [LIBRARY] Adaptar bulk_db_injection.py -> creado pilot_importer.py con dry-run y soporte por lotes (2026-08-28)
- [x] [LIBRARY] Crear IMPORT_CHECKPOINT.json inicial (2026-08-28)
- [x] [LIBRARY] Seleccionar 25 EPUBs representativos (pilot_25_selection.json) (2026-08-28)
- [x] [LIBRARY] Ejecutar importacion del lote piloto (25 libros) -> 25/25 exitosos (2026-08-28)
- [x] [LIBRARY] Verificar Books/Authors/Editions/Chapters en BD -> 25 Books, 19 autores nuevos, 681 caps (2026-08-28)
- [x] [LIBRARY] Verificar portadas extraidas en media/books/<slug>/ -> 16 portadas extraidas (2026-08-28)
- [x] [LIBRARY] Medir tiempo y espacio -> 24.8s total, +9.1 MB BD, +41.3 MB media (2026-08-28)
- [x] [LIBRARY] Registrar resultados del piloto en AGENT_LOG.md (2026-08-28)
- [x] [LIBRARY] Ajustar parametros: spine fallback para libros grandes, sanitizacion ISBN (2026-08-28)

---

## [LIBRARY] ETAPA 3 — IMPORTACIÓN POR LOTES

- [x] [LIBRARY] Importar lote 001 (30 EPUBs pendientes; 30/30 exitosos, 2026-08-29)
- [x] [LIBRARY] Verificar lote 001 en BD (30 Books, 30 Editions, 162 Chapters, 24 portadas, 0 libros sin capítulos)
- [x] [LIBRARY] Importar lote 002 (30 EPUBs pendientes; 30/30 exitosos, 2026-08-30)
- [x] [LIBRARY] Verificar lote 002 en BD (30 Books, 30 Editions, 114 Chapters, 22 portadas, 0 libros sin capítulos)
- [x] [LIBRARY] Importar lote 003 (30 EPUBs pendientes; 30/30 exitosos, 2026-08-30)
- [x] [LIBRARY] Verificar lote 003 en BD (30 Books, 30 Editions, 399 Chapters, 24 portadas, 0 libros sin capítulos)
- [x] [LIBRARY] Importar lote 004 (30 EPUBs pendientes; 30/30 exitosos, 2026-08-30)
- [x] [LIBRARY] Verificar lote 004 en BD (30 Books, 30 Editions, 281 Chapters, 23 portadas, 0 libros sin capítulos)
- [x] [LIBRARY] Importar lote 005 (30/30 EPUBs importados; completado 2026-08-30)
- [x] [LIBRARY] Verificar lote 005 en BD (30 Books, 30 Editions, 121 Chapters, 30 portadas, 0 libros sin capítulos)
- [x] [LIBRARY] Importar lote 006 (30 EPUBs pendientes; 30/30 exitosos, 2026-08-30)
- [x] [LIBRARY] Verificar lote 006 en BD (30 Books, 30 Editions, 143 Chapters, 22 portadas, 0 libros sin capítulos)
- [x] [LIBRARY] Importar lote 007 (30 EPUBs pendientes; 30/30 exitosos, 2026-08-30)
- [x] [LIBRARY] Verificar lote 007 en BD (30 Books, 30 Editions, 257 Chapters, 23 portadas, 0 libros sin capítulos)
- [x] [LIBRARY] Completar importación masiva (1045 EPUBs únicos importados; 1 duplicado SHA-256 excluido; 2026-08-30)
- [x] [LIBRARY] Revisar todos los libros fallidos en BOOK_IMPORT_ERRORS.md (0 fallidos)
- [x] [LIBRARY] Reintentar importación de libros fallidos (no requerido; 0 fallidos)

---

## [LIBRARY] ETAPA 4 — PORTADAS

- [x] [LIBRARY] Extraer todas las portadas disponibles en los EPUBs importados
- [x] [LIBRARY] Optimizar portadas extraídas a WEBP 600x900px (2026-08-30: 1046/1046 portadas referenciadas en WebP 600x900; 743 convertidas)
- [x] [LIBRARY] Relacionar portadas con Book.cover_image en BD (1046/1046)
- [x] [LIBRARY] Generar portadas procedurales para archivos faltantes o inválidos (269 generadas)
- [x] [LIBRARY] Verificar archivos de portada del catálogo (1046/1046 legibles)
- [x] [LIBRARY] Incorporar `standardize_library --art-dir <carpeta>` para ilustraciones originales por slug (validación 2:3, unicidad exacta/visual, backup, composición e informe; 2026-08-30)
- [x] [LIBRARY] Auditar formato y unicidad de las portadas actuales (2026-08-30: 1046/1046 WEBP 600x900; 0 rutas, archivos o hashes visuales repetidos)
- [x] [LIBRARY] Aplicar la línea editorial Literatus a los 1046 libros (2026-08-30: 1046 portadas procedurales temáticas, WEBP 600x900; 0 fallos, 0 duplicados exactos/visuales; backup SQLite y respaldo individual verificados)

---

## [LIBRARY] ETAPA 5 — VERIFICACIÓN CON QA

- [x] [LIBRARY] Confirmar que todos los libros aparecen en /catalog/books/ (2026-08-30: API real count=1046)
- [x] [LIBRARY] Verificar paginación correcta con 1000+ libros (12/página) (2026-08-30: 88 páginas, page_size=12)
- [x] [LIBRARY] Verificar que libros son accesibles por slug (2026-08-30: 1046/1046 slugs listados recuperables por API)
- [x] [LIBRARY] Verificar capítulos legibles en el lector (2026-08-30: 10688 capítulos, 0 vacíos, 0 libros sin capítulos)
- [x] [QA] Ejecutar pruebas de catálogo con biblioteca completa (2026-08-30: `manage.py test` 27/27 OK; catálogo 6/6 OK)
- [x] [QA] Verificar que Mi Biblioteca (UserInventory) no fue afectada (2026-08-30: verificación de solo lectura, UserInventory count=1)
- [x] [QA] Verificar rendimiento de búsqueda con 1000+ libros (2026-08-30: búsquedas API locales medianas 8.78-28.85 ms)

---

## [LIBRARY] ETAPA 6 — OPTIMIZACIÓN

- [x] [LIBRARY] Analizar queries lentas con 1000+ libros (2026-08-31: catálogo local sano; listado ~14 ms previo, detalle grande constante; sin CRITICAL/HIGH)
- [x] [LIBRARY] Identificar N+1 queries en BookDetailFullSerializer (get_total_words) (2026-08-30: corregido con `chapter_count` anotado; detalle 12 -> 10 queries)
- [x] [LIBRARY] Crear recomendaciones de índices de BD (2026-08-31: verificados índices `is_published,is_featured`, `status`, `created_at`; SQLite usa `created_at`/`status`, índice booleano compuesto queda disponible pero sin impacto medible con 1046 publicados y 0 destacados)
- [x] [LIBRARY → BACKEND] Solicitar: agregar índice en Book.is_published y Book.is_featured (2026-08-31: aplicado en migración `0022_book_catalog_boo_is_publ_5fcf8b_idx_and_more`)
- [x] [LIBRARY → BACKEND] Solicitar: evaluar campo word_count cacheado en Book (2026-08-31: medido; no se crea migración por beneficio marginal actual, estimador mediana 0.834 ms/1 query en top 10 libros)
- [x] [LIBRARY → BACKEND] Solicitar: evaluar migración a PostgreSQL antes de escalar (2026-08-31: SQLite local íntegro y suficiente para dev actual, 329.23 MiB/19.730 capítulos/303.4 MB HTML; PostgreSQL recomendado antes de producción multiusuario o crecimiento del catálogo)
- [x] [BACKEND] Revisar y aplicar optimizaciones de consultas (2026-08-31: `BookViewSet` y serializers optimizados; `manage.py test` 63/63 OK)

---

## [LIBRARY] TAREAS SEPARADAS DE IA (BAJO CONTROL DEL MANAGER)

- [x] [LIBRARY] Generar y normalizar sinopsis para toda la biblioteca (2026-08-30: 1046/1046 con 55-130 palabras, español, 0 duplicados; 1042 creadas/mejoradas y 4 conservadas mediante capítulos/EPUB locales, sin depender de Gemini)
- [ ] [LIBRARY] Generar personajes AIAvatar para libros seleccionados (crear tarea separada)
- [ ] [LIBRARY] Analizar almacenamiento requerido para audiobooks con Kokoro
- [ ] [LIBRARY] Crear plan de generación de audiolibros por prioridad

---

## [LIBRARY] TAREAS DE MANTENIMIENTO CONTINUO

- [x] [LIBRARY] Revisar libros con 0 capítulos en BD (2026-08-30: reparado `el-principe-feliz`; global 0 libros sin capítulos)
- [x] [LIBRARY] Revisar libros con capítulos corruptos (max_chapter_len < 600 chars) (2026-08-30: 0 detectados)
- [x] [LIBRARY] Detectar autores duplicados por variación de nombre (2026-08-31: `audit_catalog_integrity` deja 0 grupos potenciales; reporte en `CATALOG_INTEGRITY_AUDIT.md`)
- [x] [LIBRARY] Revisar libros en BD sin portada asignada (2026-08-30: 0 asignaciones faltantes y 0 archivos de portada faltantes)
- [x] [LIBRARY] Analizar duplicados entre el-principito y el-principito-antoine-de-saint-exupery (2026-08-30: 0 candidatos activos en BD y 0 en `LIBRARY_INVENTORY.json`; no hay duplicado importado que fusionar)
- [x] [LIBRARY/BACKEND] Revisar y fusionar manualmente, con backup previo, los grupos potenciales de autores duplicados de `CATALOG_INTEGRITY_AUDIT.md` (2026-08-31: fusionados los 3 grupos restantes; 3 alias/3 relaciones con backup `db_before_author_merge_20260831_200526.sqlite3`; auditoría final: 358 autores, 0 grupos duplicados)

---


## [OPTIMIZATION] RENDIMIENTO Y ESCALABILIDAD (Optimization Agent)

- [x] [OPTIMIZATION] Medir y optimizar /api/v1/catalog/books/ para la sección Explorar (2026-08-30: 13.66 ms → 3.10 ms; 7 → 2 queries)
- [x] [OPTIMIZATION] Activar lazy loading nativo de portadas en la grilla Explorar (2026-08-30)
- [x] [OPTIMIZATION] Auditar N+1 queries en BookDetailFullSerializer (get_total_words y get_avatars) (2026-08-30: details libro grande 12 -> 10 queries; `get_avatars` ya usa prefetch)
- [x] [OPTIMIZATION] Evaluar impacto de índices en Book (is_published, is_featured, created_at) (2026-08-31: migración 0022 aplicada; `EXPLAIN` usa `created_at` en listado y `status`; compuesto booleano sin mejora visible por distribución actual)
- [x] [OPTIMIZATION] Revisar estrategia de carga de Chapter.content_html (defer vs fetch completo) (2026-08-31: backend ya difiere `content_html` en TOC con `include_content=false`; medido libro mayor 1535 capítulos: TOC 17.13 ms/0 chars vs fetch completo 43.24 ms/1,885,333 chars; agregado test de regresión; `manage.py test` 69/69 OK)
- [x] [OPTIMIZATION] Auditar suscripciones RxJS y renderizado en reader Angular (2026-08-31: corregida fuga por suscripción duplicada en `speakChatReply`, HTTP/audio del chat cancelables con `takeUntil`, Lottie destruido en `ngOnDestroy`, polling `chatWith` cancelable; `ng.cmd build --configuration production` OK)
- [x] [FRONTEND] Limpiar bloque duplicado `.glass-panel/.glass-*` en `styles.css` (2026-08-31: queda 1 definición de `.glass-panel`, `.glass-input` y `.glass-btn`; `ng.cmd build --configuration production` OK)

---

## [FRONTEND] FILTROS DE EXPLORAR Y CATEGORIAS

- [x] [FRONTEND] Agregar filtro visible en Categorias y usar `filteredCategories` en la grilla (2026-08-30)
- [x] [FRONTEND] Cargar filtros de Explorar desde `catalog/genres/` y filtrar libros por `genres__slug` (2026-08-30)
- [x] [FRONTEND] Agregar ordenamiento en Explorar y detalle de categoria (`-created_at`, `title`, `-is_featured`, `?`) (2026-08-30)
- [x] [QA] Verificar build Angular y endpoints reales de catalogo con filtros (2026-08-30)

---
## [BACKEND] TAREAS SOLICITADAS POR LIBRARY AGENT

- [x] [BACKEND] Evaluar migración de SQLite a PostgreSQL antes de importación masiva/escalado futuro (2026-08-31: no se migra en esta ejecución; `DATABASES` ya usa `env.db()`, PostgreSQL vía `DATABASE_URL` queda como ruta de despliegue)
  - Razón: db.sqlite3 puede alcanzar límites con ~25,000 capítulos HTML (~1-3 GB)
- [x] [BACKEND] Agregar índice explícito en Book.is_published y Book.is_featured (2026-08-31: migración no destructiva `0022` aplicada y verificada)
  - Razón: Filtros frecuentes en catálogo con 1000+ libros
- [x] [BACKEND] Optimizar get_total_words() en BookDetailFullSerializer (2026-08-30: usa `chapter_count` anotado en `details` y mantiene muestra de 8 capítulos)
  - Razón: Itera chapters sin prefetch, genera N+1 queries
- [x] [BACKEND] Revisar y optimizar get_avatars() en BookDetailFullSerializer (2026-08-30: verificado con `editions__avatars` prefetcheado; sin query extra por avatar)
  - Razón: Query adicional AIAvatar.objects.filter() no optimizada

---

## [AUTH] SISTEMA DE AUTENTICACIÓN Y RECUPERACIÓN

- [x] [AUTH] AUTH_FIX_STATUS: COMPLETED (2026-08-28 23:18 -04:00)
- [x] [AUTH] ROOT_CAUSE: el registro público forzaba `is_active=False`; Django/SimpleJWT no autentica usuarios inactivos. Además, el modelo documentaba email como login, pero SimpleJWT seguía usando `username` sin aceptar `email`.
- [x] [AUTH] Corregir registro para activar usuarios por defecto y dejar verificación de correo como opción por `REQUIRE_EMAIL_VERIFICATION`.
- [x] [AUTH] Corregir login para aceptar correo o nombre de usuario, con normalización de email y errores claros.
- [x] [AUTH] Corregir hashing y validación de contraseñas en registro y reset con validadores de Django.
- [x] [AUTH] Corregir recuperación de contraseña con solicitud anti-enumeración, validación de token y cambio mediante `set_password()`.
- [x] [AUTH] Corregir frontend Angular para normalizar credenciales, mostrar mensajes correctos y validar enlace de reset.
- [x] [AUTH] Corregir riesgos críticos: autorregistro no puede escalar `role`; `/users/me/` no acepta cambios de `password`, `role`, `is_staff` ni `is_superuser`.
- [x] [QA] TESTS_EXECUTED: `manage.py check`, `manage.py makemigrations --check --dry-run`, `manage.py test users`, `manage.py test`, `npm run build`, `npm test -- --watch=false --browsers=ChromeHeadless`, E2E API real contra `127.0.0.1:8000`.
- [x] [QA] TEST_RESULTS: backend 21/21 auth OK; backend global 24/24 OK; frontend Karma 8/8 OK; build Angular OK con warnings CommonJS preexistentes; E2E API OK.
- [x] [AUTH] RESET_PASSWORD_STATUS: funcional de extremo a extremo; token válido permite cambio, token inválido/expirado falla, token usado queda invalidado tras cambiar password.
- [x] [AUTH] NEXT_ACTION: ninguna acción bloqueante pendiente para el flujo solicitado; para producción configurar `EMAIL_BACKEND`/SMTP o Resend y mantener secretos fuera del repositorio.

---

## [MANAGER] ORQUESTACIÓN DEL AGENTE CRON

- [x] [MANAGER] Definir el ciclo autónomo de `literatus` (Cron) en `AGENTS.md`: DETECTAR→PRIORIZAR→IMPLEMENTAR/DELEGAR→PROBAR→CORREGIR→VERIFICAR→DOCUMENTAR→CONTINUAR, con inicio obligatorio (lectura de AGENTS/MEMORY/TASKS/AGENT_LOG + checkpoints) y cierre de ejecución (2026-08-31)
- [x] [MANAGER] Añadir regla anti-conflicto: no duplicar trabajo si hay otra ejecución sobre los mismos recursos (archivos recién tocados, checkpoint IN_PROGRESS, backup `db_before_*` reciente, entradas nuevas en AGENT_LOG/TASKS) (2026-08-31)
- [x] [MANAGER] Añadir tabla de delegación y pipeline canónico de libro nuevo (library → categories → standardize_library → optimization sólo con señal → verificar) en `AGENTS.md` y `MEMORY.md` (2026-08-31)
- [x] [MANAGER] Registrar comandos de gestión disponibles para el líder: `standardize_library` (`--art-dir`, `--offline`, checkpoints), `audit_catalog_integrity`, hook `STANDARDIZE_ON_IMPORT` (2026-08-31)

---

## LEYENDA DE ESTADOS

- [ ] Pendiente
- [/] En progreso
- [x] Completado
- [!] Bloqueado (ver nota)
- [~] Cancelado

## LEYENDA DE AGENTES

- [MANAGER] Project Manager Agent (Coordinador)
- [OPTIMIZATION] Optimization Agent (Rendimiento, Profiling, Métricas y Escalabilidad)
- [LIBRARY] Library Content Agent (Inventario, Validación, Importación y Portadas)
- [BACKEND] Backend Agent (Modelos Django, DRF APIs, Base de Datos, Lógica)
- [FRONTEND] Frontend Agent (Aplicación Angular, UI/UX, Reader, Componentes)
- [QA] QA Agent (Testing Automatizado, Integridad, Validación)
- [REVIEWER] Reviewer Agent (Auditoría de Código, Seguridad, Clasificación de Riesgos)
