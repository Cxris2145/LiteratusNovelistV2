# AGENT_LOG.md — LiteratusNovelist
## Registro de Ejecuciones de Agentes

---

## Formato de entrada

```
### [AGENTE] YYYY-MM-DD HH:MM — Descripción
- Lote procesado: N
- EPUBs encontrados: N
- Libros importados: N
- Libros omitidos: N
- Duplicados detectados: N
- Errores: N
- Portadas extraídas: N
- Portadas generadas: N
- Tiempo utilizado: Xm Xs
- Archivos modificados: [lista]
- Observaciones: ...
```

---

## 2026-08-28 21:45 — [LIBRARY] Análisis inicial del proyecto

- **Agente:** Library Content Agent
- **Tipo:** Análisis / No modificó datos de producción
- **Lote procesado:** Etapa 0 (Análisis)
- **Tarea:** Creación del agente y análisis completo de arquitectura

### Datos recolectados

| Dato | Valor |
|---|---|
| Carpetas en respaldos-software/books/ | 1109 |
| Archivos EPUB encontrados | 1046 |
| Carpetas sin EPUB | 63 |
| Libros en media/books/ (backend) | 10 |
| Tamaño total de EPUBs | ~1.04 GB |
| EPUBs con portada interna | ~740 |
| EPUBs sin portada | ~306 |
| Tamaño actual db.sqlite3 | 0.8 MB |
| Duplicados exactos | 0 |
| Grupos sospechosos (similitud de nombre) | 8 |
| Duplicado confirmado | el-principito / el-principito-antoine-de-saint-exupery |

### Hallazgos críticos

1. **Ruta de importación:** `bulk_db_injection.py` lee desde `media/books/` pero los EPUBs reales están en `respaldos-software/books/`. Requiere adaptar antes de importar.

2. **SQLite con 1000 libros:** Con ~25,000 capítulos de HTML pesado, el archivo db.sqlite3 podría crecer entre 1-3 GB. Riesgo de alcanzar límites prácticos de SQLite. Se recomienda evaluar migración a PostgreSQL.

3. **N+1 Query en serializer:** `get_total_words()` en `BookDetailFullSerializer` itera `obj.chapters.all()` sin prefetch optimizado en la acción `details`.

4. **Sin sistema de checkpoints previo:** No existía ningún sistema de checkpoint o log de importación. Se crean ahora.

5. **Paginación correcta:** La API ya tiene paginación de 12/página máx 50. No hay riesgo de cargar 1000 libros de una vez.

### Scripts existentes reutilizables

- `bulk_db_injection.py` — Importación masiva (base para el proceso)
- `fix_broken_books.py` — Reparación de capítulos vacíos
- `merge_authors.py` — Fusión de autores duplicados
- `clean_book_titles.py` — Limpieza de títulos

### Archivos creados en esta sesión

- `.agents/agents/library-content/agent.md`
- `TASKS.md`
- `AGENT_LOG.md`
- `IMPORT_CHECKPOINT.json`
- `BOOK_IMPORT_ERRORS.md`

### Tiempo total

~15 minutos (solo análisis, sin modificar base de datos)

---


---

## 2026-08-29 -- [LIBRARY] Etapa 1: Inventario completo de EPUBs

- Agente: Library Content Agent
- Tipo: Analisis (solo lectura -- sin modificar BD)
- Etapa: 1 -- Inventario

### Resultados

| Dato | Valor |
|---|---|
| EPUBs procesados | 1046 |
| OK (validos) | 1017 |
| Con advertencias | 29 |
| Con errores | 0 |
| Autores unicos | 320 |
| Con portada | 889 |
| Sin portada | 157 |
| Con ISBN | 8 |
| Sin ISBN | 1038 |
| Capitulos legibles totales | 13,155 |
| Duplicados exactos (SHA-256) | 1 |
| Posibles duplicados | 1 |
| Tamano total | 1.038 GB |
| Tiempo de analisis | 0.1 minutos |

### Archivos generados
- LIBRARY_INVENTORY.json
- LIBRARY_INVENTORY.md
- IMPORT_CHECKPOINT.json (actualizado)
- BOOK_IMPORT_ERRORS.md (actualizado)



---

## 2026-08-29 -- [LIBRARY] Etapa 2: Importacion Piloto (25 libros)

| Dato | Valor |
|---|---|
| Modo | IMPORTACION REAL |
| Procesados | 25 |
| OK | 25 |
| Errores | 0 |
| Capitulos creados | 643 |
| DB antes | 824.0 KB |
| DB despues | 7596.0 KB |
| Tiempo total | 24.8s |

---

## 2026-08-28 — [MANAGER] Creación e Integración de Optimization Agent

- **Agente Creado:** Optimization Agent (`[OPTIMIZATION]`)
- **Ubicación:** `.agents/agents/optimization/agent.md`
- **Agente Coordinador:** Project Manager Agent (`.agents/agents/manager/agent.md`)
- **Tipo:** Creación de Agente & Arquitectura Multiagente

### Propósito del Agente
Especialista en análisis de rendimiento, métricas, profiling, eliminación de queries N+1 en Backend (Django/DRF), optimización de base de datos (índices estratégicos y TOAST/almacenamiento), rendimiento Frontend (Angular/RxJS/Reader), optimización de imágenes (WebP 600x900) y escalabilidad para 1,000+ libros.

### Filosofía Operativa
`MEDIR → OPTIMIZAR → VOLVER A MEDIR` (Ningún cambio sin justificación técnica y evidencia).

### Archivos Creados / Modificados
- `.agents/agents/optimization/agent.md` (CREADO)
- `.agents/agents/manager/agent.md` (CREADO / INTEGRADO)
- `TASKS.md` (ACTUALIZADO con sección `[OPTIMIZATION]` y leyenda de agentes)
- `AGENT_LOG.md` (ACTUALIZADO con registro de integración)

---

## 2026-08-28 23:18 -04:00 — [AUTH] Reparación completa de autenticación y recuperación

- **Agente coordinador:** Codex
- **Subagentes coordinados:** Backend Agent, Frontend Agent, QA Agent, Reviewer Agent
- **Tipo:** Corrección backend/frontend + QA automatizado + E2E real
- **AUTH_FIX_STATUS:** COMPLETED

### ROOT_CAUSE

El fallo `registro -> login` fue reproducido por API real. El usuario se creaba en base de datos, `has_usable_password()` y `check_password()` devolvían `True`, pero el registro forzaba `is_active=False`; Django/SimpleJWT rechaza usuarios inactivos y respondía credenciales inválidas. Además, el modelo declaraba el email como identificador principal en comentarios, pero SimpleJWT seguía usando `username` y no aceptaba email como login.

### Correcciones aplicadas

- Registro público crea usuarios activos por defecto para permitir login inmediato.
- Verificación de email queda disponible pero opt-in mediante `REQUIRE_EMAIL_VERIFICATION=True`.
- Login acepta `username`, `email` o identificador con correo, normalizando email y resolviendo usuario de forma case-insensitive.
- Passwords de registro y reset pasan por validadores de Django y se guardan con `create_user()`/`set_password()`.
- Recuperación de contraseña usa `PasswordResetTokenGenerator`, `uid`, token temporal, mensaje anti-enumeración y endpoint de validación.
- `/users/me/` ya no permite cambiar `role`, `password`, `is_staff` ni `is_superuser`.
- Frontend normaliza entradas, usa `AuthService` para login/registro/reset, muestra mensajes claros y valida el enlace de recuperación antes de mostrar el formulario.
- Specs Angular existentes fueron estabilizados con providers de HTTP/routing para que Karma ejecute correctamente.

### FILES_CHANGED

- `Producto/backend/users/serializers.py`
- `Producto/backend/users/views.py`
- `Producto/backend/users/urls.py`
- `Producto/backend/users/tests.py`
- `Producto/backend/config/settings.py`
- `Producto/backend/.env.example`
- `Producto/frontend/src/app/core/services/auth.service.ts`
- `Producto/frontend/src/app/core/interceptors/auth.interceptor.ts`
- `Producto/frontend/src/app/auth/login/login.component.ts`
- `Producto/frontend/src/app/auth/login/login.component.html`
- `Producto/frontend/src/app/auth/register/register.component.ts`
- `Producto/frontend/src/app/auth/register/register.component.html`
- `Producto/frontend/src/app/auth/forgot-password/forgot-password.component.ts`
- `Producto/frontend/src/app/auth/reset-password/reset-password.component.ts`
- `Producto/frontend/src/app/auth/reset-password/reset-password.component.html`
- `Producto/frontend/src/app/app.component.spec.ts`
- `Producto/frontend/src/app/home/home.component.spec.ts`
- `Producto/frontend/src/app/library/tavern/tavern.component.spec.ts`
- `Producto/frontend/src/app/catalog/author-detail-page/author-detail-page.component.spec.ts`
- `Producto/frontend/src/app/catalog/book-detail-page/book-detail-page.component.spec.ts`
- `Producto/frontend/src/app/dashboard/author-editor/author-editor.component.spec.ts`
- `TASKS.md`
- `AGENT_LOG.md`

### TESTS_EXECUTED

- `Producto/backend/.venv312/Scripts/python.exe manage.py check`
- `Producto/backend/.venv312/Scripts/python.exe manage.py makemigrations --check --dry-run`
- `Producto/backend/.venv312/Scripts/python.exe manage.py test users`
- `Producto/backend/.venv312/Scripts/python.exe manage.py test`
- `npm run build`
- `npm test -- --watch=false --browsers=ChromeHeadless`
- E2E API real contra `http://127.0.0.1:8000/api/v1/users/`

### TEST_RESULTS

- Django system check: OK.
- Migraciones: no changes detected.
- Backend auth tests: 21/21 OK.
- Backend global tests: 24/24 OK.
- Angular build: OK; warnings CommonJS preexistentes en dependencias (`canvg`, `lottie-web`, `html2canvas`, etc.).
- Angular Karma: 8/8 OK.
- E2E API real: registro 201, usuario activo, password hasheada, login 200, `/me/` 200 con JWT, `/me/` 401 sin JWT, reset request 200, token válido 200, confirm reset 200, password antigua 401, password nueva 200, `/me/` 200 con nuevo JWT, token de reset reutilizado 400.

### RESET_PASSWORD_STATUS

Funcional de extremo a extremo. El flujo genera enlace seguro con `uid` + token, valida token, cambia contraseña con `set_password()`, invalida el token tras el cambio y permite login con la nueva contraseña.

### NEXT_ACTION

No hay acción bloqueante pendiente para el flujo solicitado. Para producción, configurar `EMAIL_BACKEND`, SMTP o Resend mediante variables de entorno y mantener `EMAIL_HOST_PASSWORD` fuera del repositorio.
