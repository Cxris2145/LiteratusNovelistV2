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

- [ ] [LIBRARY] Importar lote 001 (EPUBs #001-030)
- [ ] [LIBRARY] Verificar lote 001 en BD
- [ ] [LIBRARY] Importar lote 002 (EPUBs #031-060)
- [ ] [LIBRARY] Verificar lote 002 en BD
- [ ] [LIBRARY] Importar lote 003 (EPUBs #061-090)
- [ ] [LIBRARY] Verificar lote 003 en BD
- [ ] [LIBRARY] Importar lote 004 (EPUBs #091-120)
- [ ] [LIBRARY] Verificar lote 004 en BD
- [ ] [LIBRARY] Importar lote 005 (EPUBs #121-150)
- [ ] [LIBRARY] ... (continuar hasta completar los 1046 EPUBs)
- [ ] [LIBRARY] Revisar todos los libros fallidos en BOOK_IMPORT_ERRORS.md
- [ ] [LIBRARY] Reintentar importación de libros fallidos (segunda pasada)

---

## [LIBRARY] ETAPA 4 — PORTADAS

- [ ] [LIBRARY] Extraer portadas de los ~740 EPUBs con imagen interna
- [ ] [LIBRARY] Optimizar portadas extraídas a WEBP 600x900px
- [ ] [LIBRARY] Relacionar portadas con Book.cover_image en BD
- [ ] [LIBRARY] Generar portadas procedurales para los ~306 EPUBs sin portada
- [ ] [LIBRARY] Verificar todas las portadas visibles en el catálogo frontend

---

## [LIBRARY] ETAPA 5 — VERIFICACIÓN CON QA

- [ ] [LIBRARY] Confirmar que todos los libros aparecen en /catalog/books/
- [ ] [LIBRARY] Verificar paginación correcta con 1000+ libros (12/página)
- [ ] [LIBRARY] Verificar que libros son accesibles por slug
- [ ] [LIBRARY] Verificar capítulos legibles en el lector
- [ ] [QA] Ejecutar pruebas de catálogo con biblioteca completa
- [ ] [QA] Verificar que Mi Biblioteca (UserInventory) no fue afectada
- [ ] [QA] Verificar rendimiento de búsqueda con 1000+ libros

---

## [LIBRARY] ETAPA 6 — OPTIMIZACIÓN

- [ ] [LIBRARY] Analizar queries lentas con 1000+ libros
- [ ] [LIBRARY] Identificar N+1 queries en BookDetailFullSerializer (get_total_words)
- [ ] [LIBRARY] Crear recomendaciones de índices de BD
- [ ] [LIBRARY → BACKEND] Solicitar: agregar índice en Book.is_published y Book.is_featured
- [ ] [LIBRARY → BACKEND] Solicitar: evaluar campo word_count cacheado en Book
- [ ] [LIBRARY → BACKEND] Solicitar: evaluar migración a PostgreSQL antes de escalar
- [ ] [BACKEND] Revisar y aplicar optimizaciones de consultas

---

## [LIBRARY] TAREAS SEPARADAS DE IA (BAJO CONTROL DEL MANAGER)

- [ ] [LIBRARY] Generar sinopsis con Gemini para libros sin synopsis (crear tarea separada)
- [ ] [LIBRARY] Generar personajes AIAvatar para libros seleccionados (crear tarea separada)
- [ ] [LIBRARY] Analizar almacenamiento requerido para audiobooks con Kokoro
- [ ] [LIBRARY] Crear plan de generación de audiolibros por prioridad

---

## [LIBRARY] TAREAS DE MANTENIMIENTO CONTINUO

- [ ] [LIBRARY] Revisar libros con 0 capítulos en BD
- [ ] [LIBRARY] Revisar libros con capítulos corruptos (max_chapter_len < 600 chars)
- [ ] [LIBRARY] Detectar autores duplicados por variación de nombre
- [ ] [LIBRARY] Revisar libros en BD sin portada asignada
- [ ] [LIBRARY] Analizar duplicados entre el-principito y el-principito-antoine-de-saint-exupery

---


## [OPTIMIZATION] RENDIMIENTO Y ESCALABILIDAD (Optimization Agent)

- [ ] [OPTIMIZATION] Medir baseline de tiempos de respuesta en /api/catalog/books/ con carga actual
- [ ] [OPTIMIZATION] Auditar N+1 queries en BookDetailFullSerializer (get_total_words y get_avatars)
- [ ] [OPTIMIZATION] Evaluar impacto de índices en Book (is_published, is_featured, created_at)
- [ ] [OPTIMIZATION] Revisar estrategia de carga de Chapter.content_html (defer vs fetch completo)
- [ ] [OPTIMIZATION] Auditar suscripciones RxJS y renderizado en reader Angular

---
## [BACKEND] TAREAS SOLICITADAS POR LIBRARY AGENT

- [ ] [BACKEND] Evaluar migración de SQLite a PostgreSQL antes de importación masiva
  - Razón: db.sqlite3 puede alcanzar límites con ~25,000 capítulos HTML (~1-3 GB)
- [ ] [BACKEND] Agregar índice explícito en Book.is_published y Book.is_featured
  - Razón: Filtros frecuentes en catálogo con 1000+ libros
- [ ] [BACKEND] Optimizar get_total_words() en BookDetailFullSerializer
  - Razón: Itera chapters sin prefetch, genera N+1 queries
- [ ] [BACKEND] Revisar y optimizar get_avatars() en BookDetailFullSerializer
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



