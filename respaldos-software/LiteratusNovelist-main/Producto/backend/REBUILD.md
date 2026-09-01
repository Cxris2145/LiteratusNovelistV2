# Reconstrucción del catálogo (Literatus Novelist)

Guía para levantar el catálogo de libros **en una base de datos nueva** cuando
no se tiene acceso al despliegue anterior (Render/Supabase del equipo pasado).

Todo el material está en el repo:

| Recurso | Ubicación |
|---|---|
| 1046 EPUB + portadas | `respaldos-software/books/<slug>/` (versionados en git) |
| Mapa categoría → libros | `backend/json_data/elejandria_master.json` |
| Prompts de portadas IA | `respaldos-software/Automatizaciones/Creacion de Portadas_basicas/books_to_generate.json` |
| Prompts de avatares | `backend/author_prompts.json`, `backend/character_prompts.json` |

Los métodos de scraping / generación de portadas del equipo anterior quedaron
convertidos en **comandos de gestión de Django** dentro de
`backend/catalog/management/commands/`.

---

## 0. Requisitos

```bash
cd respaldos-software/LiteratusNovelist-main/Producto/backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1        # Windows;  source .venv/bin/activate en Linux/Mac
pip install -r requirements.txt
```

`.env` (copia de `.env.example`) con al menos:

```env
DEBUG=True
SECRET_KEY=una-clave-larga-cualquiera
DATABASE_URL=postgres://usuario:password@localhost:5432/literatus_db
ALLOWED_HOSTS=localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=http://localhost:4200
# Para subir portadas a tu propio Supabase (paso 5, opcional):
SUPABASE_URL=https://TU-PROYECTO.supabase.co
SUPABASE_SERVICE_KEY=eyJ...        # Project Settings → API → service_role
```

Crear la base y migrar:

```bash
python manage.py migrate
python manage.py createsuperuser
```

---

## 1. Respaldar la API vieja  ⚠️ HACER PRIMERO

Mientras el backend viejo siga en línea, baja todo lo que expone (sinopsis,
portadas, géneros, tags, bios). Es la red de seguridad.

```bash
python manage.py backup_live_api
# genera backups/live_api/{books,authors,genres}.json  (indexado por slug)
```

Guarda esa carpeta fuera del equipo (Drive, otro repo).

---

## 2. Reconstruir desde los EPUB

Crea libros, capítulos, autores, ediciones y asigna géneros.

```bash
# ensayo con 20 libros
python manage.py import_epubs --source ../../../books --limit 20

# tanda completa (1046 libros, ~10-20 min)
python manage.py import_epubs --source ../../../books
```

- `--source` : carpeta con subcarpetas `<slug>/*.epub`. Si se omite, intenta
  autodetectar `respaldos-software/books` o `media/books`.
- `--skip-existing` : no re-procesa libros que ya tengan capítulos.
- Los géneros se asignan al final leyendo `json_data/elejandria_master.json`.

---

## 3. Enriquecer con el respaldo de la API

Rellena sinopsis, portada (URL pública de Supabase del sitio viejo — **sigue
funcionando** aunque no tengas acceso), destacados, tags y bios de autores.
Empareja por slug.

```bash
python manage.py import_api_backup                 # usa backups/live_api/
python manage.py import_api_backup --overwrite     # pisa valores existentes
```

> Los pasos 2 y 3 juntos = `python manage.py rebuild_catalog`

---

## 4. (Opcional) Generar portadas faltantes con IA

Usa pollinations.ai (gratis, sin API key). Solo escribe `cover.jpg` en disco.

```bash
python manage.py generate_covers \
  --source ../../../books \
  --prompts "../../../Automatizaciones/Creacion de Portadas_basicas/books_to_generate.json"
```

---

## 5. (Opcional) Subir portadas a TU Supabase

Sube `<slug>/cover.jpg` al bucket y enlaza `Book.cover_image`.
Requiere `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` en `.env`.

```bash
python manage.py upload_covers_supabase --source ../../../books --dry-run   # ver qué haría
python manage.py upload_covers_supabase --source ../../../books
```

Si haces esto, quita del `.env` el `SUPABASE_URL` viejo o las portadas del
paso 3 seguirán apuntando al Supabase anterior.

---

## 6. Limpiar libros sin capítulos

```bash
python manage.py prune_bookless --list      # reporte, no borra
python manage.py prune_bookless --apply     # soft-delete (reversible)
```

---

## 7. Verificar

```bash
python manage.py runserver
```

- `http://localhost:8000/api/v1/catalog/stats/` → conteos en vivo
- `http://localhost:8000/api/v1/catalog/books/` → listado
- `http://localhost:8000/admin/` → revisar libros y capítulos

---

## Traer libros NUEVOS de elejandria.com (scraper)

El scraper original está en `scripts/scraping_import/scraper_elejandria.py`
(copia idéntica en `respaldos-software/Automatizaciones/`). Necesita Chrome +
dependencias extra que **no** están en `requirements.txt`:

```bash
pip install selenium webdriver-manager
python scripts/scraping_import/scraper_elejandria.py
# descarga EPUBs a ./epubs_elejandria/  (con reanudación vía json_data/scraper_estado.json)
```

Luego mueve cada EPUB a `respaldos-software/books/<slug>/<slug>.epub` y corre
`import_epubs --skip-existing`.

---

## Resumen de comandos añadidos

| Comando | Origen | Qué hace |
|---|---|---|
| `backup_live_api` | nuevo | Respalda la API pública vieja a JSON |
| `import_epubs` | `db_setup/bulk_db_injection.py` | EPUBs → libros/capítulos/autores/géneros |
| `import_api_backup` | nuevo | Sinopsis/portadas/tags/bios desde el respaldo |
| `generate_covers` | `Automatizaciones/generar_portadas_ia.py` | Portadas IA (pollinations) |
| `upload_covers_supabase` | `scripts/sync_covers_supabase.py` | Sube portadas a Supabase Storage |
| `rebuild_catalog` | nuevo | Orquesta import_epubs + import_api_backup |
| `prune_bookless` | nuevo | Borra (soft) libros sin capítulos |
