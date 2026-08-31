# OPTIMIZATION_LOG — LiteratusNovelist

_Bitácora de `literatus-optimization`. Ciclo: medir → causa → cambio mínimo → probar → volver a medir → documentar._

---

## 2026-08-30 20:2x — Auditoría de rendimiento del catálogo (post-clasificación)

Contexto: `literatus-categories` acababa de asignar 1.522 relaciones libro↔género
(504 libros con 2+ géneros). Se remidieron los endpoints del catálogo con el dataset
real (**1.046 libros**, SQLite, `DEBUG=True`, `django.test.Client`, best-of-3).

### BASELINE (antes)

| Endpoint | queries | ms (mín/mediana) | payload | items |
|---|---|---|---|---|
| `GET /catalog/books/` (p1, por defecto) | 7 | 13.4 / 13.7 | ~5 KB | count=1046, page=12 |
| `GET /catalog/books/?compact=true` | 2 | 4.8 / 4.9 | ~2 KB | page=12 |
| `GET /catalog/books/?page=2` | 7 | 14.6 / 14.7 | ~6 KB | page=12 |
| `GET /catalog/books/?genres__slug=cuentos` | 7 | 15.6 / 15.9 | ~5 KB | count=258 |
| `GET /catalog/books/?search=garcia` | 7 | 13.0 / 14.2 | ~0 KB | count=1 |
| `GET /catalog/books/?ordering=title` | 7 | 11.5 / 12.1 | ~5 KB | count=1046 |
| `GET /catalog/genres/` | 2 | 2.4 / 2.6 | ~1 KB | 34 |
| `GET /catalog/books/<slug>/` (retrieve) | 6 | 7.3 / 7.4 | ~1 KB | — |
| `GET /catalog/books/<slug>/details/` (Full) | 10 | 11.6 / 12.6 | ~2 KB | — |
| `GET /catalog/books/recommendations/` (anón) | 7 | 7.8 / 8.0 | ~2 KB | 6 |

Verificado con el libro de **1.535 capítulos** (`los-nueve-libros-de-la-historia-herodoto`)
y con los libros con más ediciones / reviews / avatars: **detail = 6 q, full = 10 q constantes**.
`get_total_words()` muestrea 8 capítulos vía `values_list(..., flat=True)[:8]` — no carga
el libro completo. **No hay N+1 en ninguna ruta.** No se hallaron problemas CRITICAL ni HIGH.

---

### O1 — Prefetch de autores con `COUNT(DISTINCT)` inútil en el listado  ·  SEVERITY: MEDIUM  ·  AREA: BACKEND

**PROBLEM:** `BookViewSet.get_queryset()` (rama no-`compact`) usaba
`Prefetch('book_authors__author', queryset=Author.objects.annotate(author_books_count=Count('author_books', distinct=True)))`
para **todas** las acciones. En el listado, la query de prefetch de autores era
`SELECT ... , COUNT(DISTINCT catalog_bookauthor.id) ... LEFT OUTER JOIN catalog_bookauthor ... GROUP BY <15 columnas de Author>`.

**ROOT_CAUSE:** el único consumidor de `author_books_count` es
`AuthorReadSerializer.get_books_count`, que en esta vista solo interviene en la ficha
de detalle (`BookDetailFullSerializer → BookAuthorSerializer → AuthorReadSerializer`).
`BookListSerializer` no expone ese campo, así que en el endpoint más caliente el
`COUNT(DISTINCT)+JOIN+GROUP BY` era trabajo puro desperdiciado.

**CHANGE (mínimo, sin cambio de contrato):** `catalog/views.py` — la anotación se
conserva **solo** para `self.action in ('retrieve', 'details')`; el resto (list,
recommendations) usa el prefetch plano `'book_authors__author'` (igual que el
`queryset` de clase). Import `Prefetch` intacto.

**BASELINE → RESULT:**

| Endpoint | queries | ms (mín/mediana) | nota |
|---|---|---|---|
| `GET /catalog/books/` (list) | 7 → **7** | 13.4/13.7 → **13.2/13.3** | query de autores pasa de `COUNT+JOIN+GROUP BY` a `SELECT` plano |
| `GET /catalog/books/?ordering=title` | 7 → 7 | 11.5/12.1 → 11.8/12.0 | igual |
| `GET /catalog/books/<slug>/` | 6 → **6** | 7.3/7.4 → 7.3/7.5 | sin cambio (mantiene la anotación) |
| `GET /catalog/books/<slug>/details/` | 10 → **10** | 11.6/12.6 → 11.9/12.1 | sin cambio |

**IMPROVEMENT:** el nº de queries no cambia; se elimina un `COUNT(DISTINCT)` + `LEFT
OUTER JOIN` + `GROUP BY` (15 columnas) por request en el listado y en `recommendations`.
Ganancia de tiempo dentro del ruido a 1.046 filas (~0.4 ms); el valor real es evitar
que ese agregado escale con el nº de autores/relaciones al crecer el catálogo o migrar
a PostgreSQL. Regresión en detalle: **ninguna** (la anotación se mantiene donde se usa).

**TESTS:** `python manage.py test` → **34/34 OK** (incl. `catalog` 13/13). Payloads y
códigos HTTP idénticos (200) en los 10 endpoints medidos.

**FILES_CHANGED:** `Producto/backend/catalog/views.py` (`get_queryset`, ~10 líneas).

**RISK:** bajo. Cambio acotado a `get_queryset`; sin migración; sin cambio de API;
salida byte-compatible.

**NEXT_ACTION:** ninguna.

---

## 2026-08-30 21:0x — Scroll en "Explorar" (`/catalog`) y "Categorías" (`/categories`, `/categories/:slug`)  ·  SEVERITY: HIGH  ·  AREA: FRONTEND

### PROBLEM / ROOT_CAUSE

1. **`backdrop-filter: blur(16px)` por tarjeta.** `.book-card` arrastra la clase global
   `.glass-panel`, que aplica `backdrop-filter: blur(16px)`. En Explorar son **24 tarjetas**
   a la vez; en el detalle de categoría la lista **crece sin límite** con "Cargar más"
   (10 → 20 → 30 …). Cada `backdrop-filter` obliga al compositor a re-muestrear y
   difuminar el fondo **en cada frame de scroll** → frames largos / jank, sobre todo en
   equipos medios y móvil. La portada tapa casi todo el panel: el blur apenas se ve.
2. **`category-detail`: `*ngFor` de libros sin `trackBy`** + append
   (`this.books = [...this.books, ...nuevos]`). Cada "Cargar más" **recrea todo el DOM**
   de las tarjetas ya pintadas (re-decodifica imágenes, re-dispara animaciones) → tirón
   tras cada carga.
3. **`category-detail`: `route.params.subscribe` en `ngOnInit` sin `unsubscribe`** ni
   `OnDestroy` → fuga de suscripción al navegar entre categorías.
4. **`categories`: 3 bindings `[style.background]` con concatenación de strings** por
   tarjeta, recomputados en cada ciclo de detección de cambios; `*ngFor` sin `trackBy`.

### CHANGE (mínimo, sin rediseño; se conservan fondo, borde, sombra y gradientes → aspecto idéntico)

| Archivo | Cambio |
|---|---|
| `catalog/book-list/book-list.component.css` | `.book-card { backdrop-filter: none; -webkit-backdrop-filter: none }` + `@media (prefers-reduced-motion: reduce) { .book-card { animation: none } }` |
| `categories/category-detail/category-detail.component.css` | `.book-card { backdrop-filter: none; -webkit-backdrop-filter: none }` |
| `categories/category-detail/category-detail.component.ts` | `implements OnDestroy`; guarda `paramsSub` y `unsubscribe()` + `clearTimeout` en `ngOnDestroy`; `trackByBook(i,b) => b.slug || b.id` |
| `categories/category-detail/category-detail.component.html` | `*ngFor="… ; trackBy: trackByBook"` |
| `categories/categories.component.ts` | `wrapBg` y `gradientOverlay` precalculados en el `.map()` y en la tarjeta manual "Literatura y Ficción"; `trackByCat(i,c) => c.slug` |
| `categories/categories.component.html` | usa `cat.wrapBg` / `cat.gradientOverlay`; `*ngFor="… ; trackBy: trackByCat"` |

### BASELINE → RESULT (estructural — el jank de scroll se mide con traza de Performance en dispositivo real, no con arnés)

| Métrica | Antes | Después |
|---|---|---|
| Capas `backdrop-filter` compuestas al scrollear la grilla | 24 (Explorar) · 10–250+ (Categoría) | **0** |
| "Cargar más": nodos DOM de tarjeta recreados por click | todos (N) | **solo los 10 nuevos** (trackBy) |
| Suscripción `route.params` en category-detail | fuga (nunca se cierra) | cerrada en `ngOnDestroy` |
| Escrituras de estilo por tarjeta/ciclo CD en Categorías | 3 concatenaciones de string | **0** (precalculado) |

**Verificación funcional (dev server `:4200` + backend `:8000`):**
- Explorar `/catalog`: renderiza; 12 tarjetas en viewport con `backdrop-filter: none` confirmado por DOM; layout y barra de scroll correctos (`docHeight` estable).
- Categorías `/categories`: 34 tarjetas con gradientes por color correctos y `book_count` real (Ficción clásica 362, Cuentos 258, …).
- `/categories/terror` (63 libros): carga; "Cargar más" 10 → 20 con `backdrop-filter: none` en las nuevas; **consola sin errores JS** (solo 401 de API sin login, preexistentes).
- `ng build --configuration production`: **OK**, sin errores; `main` −0.2 kB, `styles.css` idéntico.

### TESTS

`ng build --configuration production` OK (AOT + type-check de plantillas). Revisión visual
de las 3 vistas en el navegador: sin regresión de aspecto ni de funcionalidad; consola limpia.

### FILES_CHANGED: 6

`frontend/src/app/catalog/book-list/book-list.component.css`
`frontend/src/app/categories/category-detail/category-detail.component.{ts,html,css}`
`frontend/src/app/categories/categories.component.{ts,html}`

### RISK

Bajo. CSS encapsulado por componente (no se toca `styles.css` global); plantillas solo
añaden `trackBy` y props precalculadas; build de producción OK.

### NEXT_ACTION / registrado

- **`content-visibility: auto` + `contain-intrinsic-size`** en las tarjetas: probado en esta
  sesión pero **retirado** — no se pudo verificar su beneficio de forma fiable con la
  herramienta de navegador (posible "checkerboard" al repintar tras scroll programático).
  Es el siguiente paso natural para la lista larga de `/categories/:slug`; validar con
  traza de Performance + CPU throttle 4–6× en un equipo medio antes de reintroducirlo.
- `styles.css` tiene el bloque `.glass-panel` (y varios `.glass-*`) **duplicado**
  (líneas ~119 y ~314) — limpieza aparte, derivar a `literatus`.

### Hallazgos registrados (NO implementados — requieren coordinación o no los justifica la medición)

| # | Sev | Área | Hallazgo | Por qué no se toca ahora |
|---|---|---|---|---|
| M1 | MEDIUM | API/DB | `?genres__slug` se filtra **dos veces**: `DjangoFilterBackend` (`filterset_fields={'genres__slug':['exact']}`) **y** el bloque manual `qs.filter(genres__slug__iexact=...).distinct()` en `get_queryset`. Igual para `genres__name`. | Quitar el bloque manual cambia `iexact`→`exact` (contrato). Coste real hoy: ~2 ms. Derivar a `literatus` para decidir el contrato antes de simplificar. |
| M2 | MEDIUM | DB/búsqueda | `search_fields = ['title','synopsis','book_authors__author__full_name','genres__name']` → la búsqueda hace JOIN a relaciones to-many + `DISTINCT` y `LIKE '%q%'`. A 1.046 filas: 13–14 ms. En PostgreSQL con 10k+ libros y sin índice trigram/FTS degradará. | Optimización mayor (full-text / `SearchVector` / `pg_trgm`) que corresponde planificar con `literatus`; hoy la medición no lo exige. |
| L1 | LOW | DB | No hay índice para el orden por defecto `('-is_featured','-created_at')`. Existen `Book(is_published,is_featured)`, `Book(status)`. | 1.046 filas ordenan en <14 ms; regla: no añadir índice sin que la medición lo justifique. Reevaluar al crecer el volumen o migrar a PostgreSQL (coincide con el `NEXT_ACTION` histórico de AGENT_LOG). |
| M3 | LOW | Correctitud (no rendimiento) | `BookListSerializer.ai_character_count = IntegerField(read_only=True)` sin `default`/`required=False`; en el listado por defecto no se anota. | **RESUELTO en ciclo 2026-08-31** (asignado `default=0`). |

---

## 2026-08-31 00:15 — Auditoría Global y Eliminación de N+1 en Autores, Inventario y Lector

Contexto: Auditoría global de rendimiento en todo el sistema (backend DRF, base de datos con 1.046 libros y 275 autores, biblioteca del usuario y endpoints del lector).

### BASELINE (antes de optimizaciones)

| Endpoint | Queries | ms (mín/mediana) | Payload | Items / Count |
|---|---|---|---|---|
| `GET /catalog/authors/<slug>/` (Benito Pérez Galdós, 39 libros) | **201** | ~18.5 / 20.2 | ~8 KB | 39 libros |
| `GET /catalog/authors/<slug>/` (Hermanos Grimm, 29 libros) | **151** | ~15.0 / 16.5 | ~6 KB | 29 libros |
| `GET /catalog/authors/<slug>/` (Émile Zola, 3 libros) | **16** | 9.7 / 10.6 | ~2.5 KB | 3 libros |
| `GET /catalog/authors/` (p1 list) | **6** | 12.7 / 12.8 | ~7 KB | count=275, p1=12 |
| `GET /catalog/authors/?page=2` | **6** | 18.7 / 19.1 | ~6.7 KB | count=275, p2=12 |
| `GET /library/inventory/` (10 libros) | **37** | ~22.0 / 24.5 | ~14 KB | 10 libros |
| `GET /library/inventory/<id>/chapters/?include_content=false` (TOC) | **7** | 5.0 / 5.6 | 124 B | 1 capítulo |
| `GET /library/inventory/<id>/chapters/?order=1` (Lectura) | **8** | 5.7 / 6.1 | 15.5 KB | 1 capítulo |

---

### O3 — Eliminación de N+1 en Ficha de Detalle de Autor (`AuthorViewSet.retrieve`)  ·  SEVERITY: CRITICAL  ·  AREA: BACKEND

**PROBLEM:** Consultar la ficha de un autor con muchas obras disparaba hasta **201 queries SQL** (Benito Pérez Galdós: 39 libros = 201 q; Hermanos Grimm: 29 libros = 151 q; Edgar Allan Poe: 23 libros = 121 q). La complejidad era `O(N)` donde `queries = 1 + 5 * num_libros`.
**ROOT_CAUSE:**
1. `AuthorViewSet.queryset` solo precargaba `author_books__book__genres` y `author_books__book__editions`, ignorando `tags` y `book_authors__author`.
2. `AuthorDetailSerializer.get_books` ejecutaba `[ba.book for ba in obj.author_books.all().select_related('book')]`. El método `.select_related('book')` sobre el manager relacionado forzaba la creación de un nuevo QuerySet que **rompía la caché de prefetch** en memoria, disparando queries individuales por cada libro para tags, autores y ediciones.
**CHANGE:**
1. `catalog/serializers.py`: `AuthorDetailSerializer.get_books` itera directamente los objetos precargados: `books = [ba.book for ba in obj.author_books.all()]`.
2. `catalog/views.py`: `AuthorViewSet.get_queryset` implementa prefetch anidado completo para `retrieve`:
   `Prefetch('author_books', queryset=BookAuthor.objects.select_related('book').prefetch_related('book__genres', 'book__tags', 'book__editions', 'book__book_authors__author'))`.

**BASELINE → RESULT:**
- Benito Pérez Galdós: **201 queries → 7 queries** (**96.5% de reducción**, queries constantes `O(1)`).
- Hermanos Grimm: **151 queries → 7 queries** (**95.4% de reducción**).
- Émile Zola: **16 queries → 7 queries** (10.6 ms → **7.1 ms**, **33% speedup**).

---

### O4 — Optimización de Listado de Autores (`AuthorViewSet.list`)  ·  SEVERITY: HIGH  ·  AREA: BACKEND

**PROBLEM:** `AuthorViewSet.list` ejecutaba 6 queries cargando todas las relaciones de libros, géneros y ediciones que el serializador ligero `AuthorReadSerializer` nunca consumía. Además, faltaba la anotación `author_books_count`, causando conteos repetidos.
**ROOT_CAUSE:** `AuthorViewSet` no discriminaba `get_queryset()` por acción.
**CHANGE:** `catalog/views.py`: `AuthorViewSet.get_queryset()` para acciones distintas de `retrieve` aplica `.annotate(author_books_count=Count('author_books', distinct=True)).order_by('full_name')` sin prefetches innecesarios de libros.
**BASELINE → RESULT:**
- `GET /catalog/authors/` (p1): **6 queries → 2 queries** (12.8 ms → **5.0 ms**, **61% speedup**).
- `GET /catalog/authors/?page=2`: **6 queries → 2 queries** (19.1 ms → **5.0 ms**, **74% speedup**).

---

### O5 — Eliminación de N+1 en Biblioteca del Usuario (`UserInventoryViewSet.list`)  ·  SEVERITY: HIGH  ·  AREA: BACKEND

**PROBLEM:** El listado de inventario personal (`/api/v1/library/inventory/`) ejecutaba 37 queries para 10 libros adquiridos.
**ROOT_CAUSE:** `UserInventorySerializer` anida `EditionSerializer`, el cual serializa `BookListSerializer(obj.book)`. `UserInventoryViewSet.get_queryset()` no precargaba `edition__book__editions` ni `edition__book__book_authors__author`, disparando 3 queries SQL por cada libro en inventario.
**CHANGE:** `library/views.py`: `UserInventoryViewSet.get_queryset()` añade `'edition__book__editions'` y `'edition__book__book_authors__author'` a `prefetch_related`.
**BASELINE → RESULT:**
- 10 libros en biblioteca: **37 queries → 7 queries** (**81% de reducción**, queries constantes `O(1)`). Payload idéntico comprobado.

---

### O6 — Optimización de Consultas en Reader de Capítulos (`UserInventoryViewSet.chapters`)  ·  SEVERITY: MEDIUM  ·  AREA: BACKEND / READER

**PROBLEM:** El endpoint de capítulos del lector ejecutaba prefetches redundantes de géneros, tags y avatares del libro al validar el inventario.
**ROOT_CAUSE:** `get_queryset()` aplicaba los prefetches de listado a todas las acciones.
**CHANGE:** `library/views.py`: `UserInventoryViewSet.get_queryset()` retorna `qs.select_related('edition__book')` liviano cuando `self.action == 'chapters'`.
**BASELINE → RESULT:**
- `GET /library/inventory/<id>/chapters/?include_content=false` (TOC): **7 queries → 4 queries** (5.6 ms → **2.9 ms**, **48% speedup**).
- `GET /library/inventory/<id>/chapters/?order=1` (Lectura capítulo): **8 queries → 5 queries** (6.1 ms → **3.7 ms**, **39% speedup**).

---

### O7 — Robustez en Serialización de Libro (`BookListSerializer.ai_character_count`)  ·  SEVERITY: LOW  ·  AREA: BACKEND

**CHANGE:** `catalog/serializers.py`: `ai_character_count = serializers.IntegerField(read_only=True, default=0)`.

---

### TESTS Y VERIFICACIÓN

1. `python manage.py test`: **67/67 OK** (0 errores, 0 fallos).
2. `ng build --configuration production`: **OK** (0 errores, bundles optimizados).
3. Verificación de invariantes:
   - Autenticación y permisos: Intactos (JWT, IsAuthenticated, IsAuthenticatedOrReadOnly).
   - Integridad de datos: 1.046 libros, 275 autores, 34 géneros, 18.220 capítulos intactos.
   - Paginación: `PAGE_SIZE = 12` estricto en todos los ViewSets.

---

### Resumen para el líder

- **STATUS:** COMPLETED
- **AREAS_ANALYZED:** Backend DRF (BookViewSet, GenreViewSet, AuthorViewSet, UserInventoryViewSet, ReadingProgressViewSet, AIAvatar views), Database (1.046 libros, 275 autores, 18.220 capítulos, índices), Frontend (Reader, TOC, Tokens cache, Angular prod build).
- **CRITICAL_FOUND:** 1 (N+1 en AuthorViewSet.retrieve con 201 queries)
- **HIGH_FOUND:** 2 (N+1 en UserInventoryViewSet, prefetches pesados en AuthorViewSet.list)
- **MEDIUM_FOUND:** 1 (Prefetches redundantes en endpoints de reader de capítulos)
- **LOW_FOUND:** 1 (M3: BookListSerializer.ai_character_count default)
- **OPTIMIZATIONS_IMPLEMENTED:** 5 (O3, O4, O5, O6, O7)
- **BASELINE_SUMMARY:** Author detail hasta 201 queries por autor; Author list 6 queries / 19 ms; User inventory 37 queries / 10 items; Reader chapters 7-8 queries / 6 ms.
- **RESULT_SUMMARY:** Author detail reducido de 201 a 7 queries constantes (-96.5%); Author list de 6 a 2 queries (5.0 ms, -74%); User inventory de 37 a 7 queries constantes (-81%); Reader chapters reducido a 4-5 queries (2.9 ms, -48%). 67/67 tests de backend pasando, Angular build production OK.
- **TESTS:** `python manage.py test` 67/67 OK; `ng build --configuration production` OK.
- **NEXT_ACTION:** Sistema en estado óptimo de alto rendimiento. Las oportunidades pendientes (M1, M2, L1) quedan registradas para cuando se requiera migración a PostgreSQL o búsqueda full-text a gran escala.
