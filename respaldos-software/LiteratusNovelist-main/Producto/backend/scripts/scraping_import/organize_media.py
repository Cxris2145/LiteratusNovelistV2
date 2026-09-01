#!/usr/bin/env python3
"""
organize_media.py
=================
Refactoriza media/books/ construyendo una estructura slug-based a partir
de los ePubs de epubs_elejandria/.

Uso (desde backend/):
    python organize_media.py            # ejecución real
    python organize_media.py --dry-run  # simulación sin cambios en disco

Fases:
  1. Limpia todos los .epub encontrados en media/ (excepto los de la carpeta
     fuente epubs_elejandria/ y el backup assets_to_import/).
  2. Para cada .epub en epubs_elejandria/ crea:
         media/books/<slug>/
         media/books/<slug>/<slug>.epub
  3. Limpia directorios vacíos que hayan quedado en media/books/.
"""

import re
import sys
import unicodedata
import shutil
from pathlib import Path

# ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
MEDIA_DIR   = BACKEND_DIR / "media"
BOOKS_DIR   = MEDIA_DIR / "books"
ELEJANDRIA  = BACKEND_DIR / "epubs_elejandria"
ASSETS_DIR  = BACKEND_DIR / "assets_to_import"

DRY_RUN = "--dry-run" in sys.argv

# ─── HELPERS ──────────────────────────────────────────────────────────────────

def slugify(filename: str) -> str:
    """
    Genera un slug URL-friendly desde el nombre de un archivo .epub.

    Pasos:
      1. Quita la extensión.
      2. NFD → encode ASCII ignorando bytes no-ASCII → elimina acentos y tildes.
      3. Minúsculas.
      4. Espacios, guiones bajos, puntos → guión.
      5. Elimina caracteres que no sean [a-z0-9-].
      6. Colapsa guiones múltiples y recorta extremos.

    Ejemplos:
      "El_príncipe_feliz-Wilde_Oscar.epub"   → "el-principe-feliz-wilde-oscar"
      "7_de_Julio-Benito_Perez_Galdos.epub"  → "7-de-julio-benito-perez-galdos"
    """
    stem  = Path(filename).stem
    nfd   = unicodedata.normalize("NFD", stem)
    ascii_str = nfd.encode("ascii", "ignore").decode("ascii")
    lower = ascii_str.lower()
    dashed = re.sub(r"[\s_.\-]+", "-", lower)
    clean  = re.sub(r"[^a-z0-9\-]", "", dashed)
    slug   = re.sub(r"-+", "-", clean).strip("-")
    return slug


def log(msg: str) -> None:
    prefix = "[DRY-RUN] " if DRY_RUN else ""
    print(f"{prefix}{msg}")


def safe_remove_empty_dirs(root: Path) -> int:
    """
    Elimina recursivamente los subdirectorios vacíos dentro de root.
    Retorna la cantidad de directorios eliminados.
    """
    removed = 0
    # bottom-up para que los padres queden vacíos antes de inspeccionarlos
    for d in sorted(root.rglob("*"), key=lambda p: len(p.parts), reverse=True):
        if d.is_dir() and d != root and not any(d.iterdir()):
            log(f"  🧹 Eliminando directorio vacío: {d.relative_to(BACKEND_DIR)}/")
            if not DRY_RUN:
                d.rmdir()
            removed += 1
    return removed


# ─── FASE 1: Limpiar .epub antiguos en media/ ─────────────────────────────────

def cleanup_old_epubs() -> int:
    """
    Busca recursivamente todos los .epub en media/, excluyendo:
      - epubs_elejandria/   (carpeta fuente)
      - assets_to_import/   (backups originales)

    Elimina los encontrados y retorna la cantidad.
    """
    deleted = 0

    for epub in sorted(MEDIA_DIR.rglob("*.epub")):
        # Excluir carpeta fuente y backups
        try:
            epub.relative_to(ELEJANDRIA)
            continue  # está dentro de elejandria → saltar
        except ValueError:
            pass

        try:
            epub.relative_to(ASSETS_DIR)
            continue  # está dentro de assets_to_import → saltar
        except ValueError:
            pass

        log(f"  🗑  Eliminando epub antiguo: {epub.relative_to(BACKEND_DIR)}")
        if not DRY_RUN:
            epub.unlink()
        deleted += 1

    return deleted


# ─── FASE 2: Construir estructura slug-based ──────────────────────────────────

def build_slug_structure() -> tuple[int, int]:
    """
    Para cada .epub en epubs_elejandria/:
      1. Genera slug desde el nombre del archivo.
      2. Crea  media/books/<slug>/
      3. Mueve el epub a media/books/<slug>/<slug>.epub

    Retorna (carpetas_creadas, archivos_movidos).
    """
    if not ELEJANDRIA.exists():
        print(f"ERROR: Carpeta fuente no encontrada: {ELEJANDRIA}")
        sys.exit(1)

    epubs = sorted(ELEJANDRIA.glob("*.epub"))
    if not epubs:
        print("ADVERTENCIA: No hay archivos .epub en epubs_elejandria/")
        return 0, 0

    created = 0
    moved   = 0
    skipped = 0
    slug_seen: dict[str, Path] = {}  # para detectar colisiones

    for epub in epubs:
        slug = slugify(epub.name)

        if not slug:
            print(f"  ⚠  Slug vacío para: {epub.name!r} — omitido.")
            skipped += 1
            continue

        # Detectar colisión de slugs
        if slug in slug_seen:
            print(
                f"  ⚠  COLISIÓN de slug '{slug}':\n"
                f"       {slug_seen[slug].name}\n"
                f"       {epub.name}  ← omitido"
            )
            skipped += 1
            continue
        slug_seen[slug] = epub

        dest_dir  = BOOKS_DIR / slug
        dest_file = dest_dir / f"{slug}.epub"

        # Crear directorio
        if not dest_dir.exists():
            log(f"  📁 Creando: books/{slug}/")
            if not DRY_RUN:
                dest_dir.mkdir(parents=True, exist_ok=True)
            created += 1

        # Mover epub
        if dest_file.exists():
            log(f"  ⏭  Ya existe, omitido: books/{slug}/{slug}.epub")
            skipped += 1
        else:
            log(f"  📦 {epub.name}\n"
                f"          → books/{slug}/{slug}.epub")
            if not DRY_RUN:
                shutil.move(str(epub), str(dest_file))
            moved += 1

    if skipped:
        print(f"\n  ℹ  Archivos omitidos (colisión/vacío): {skipped}")

    return created, moved


# ─── FASE 3: Limpiar directorios vacíos ──────────────────────────────────────

def cleanup_empty_dirs() -> int:
    """Elimina los directorios vacíos que quedaron en media/books/."""
    if not BOOKS_DIR.exists():
        return 0
    return safe_remove_empty_dirs(BOOKS_DIR)


# ─── MAIN ─────────────────────────────────────────────────────────────────────

def main() -> None:
    print("=" * 65)
    print("  Literatus Novelist — Reorganizador de media/books/")
    print("=" * 65)

    if DRY_RUN:
        print("  ⚠  MODO SIMULACIÓN activo — ningún archivo será modificado.\n")

    if not ELEJANDRIA.exists():
        print(f"ERROR: No se encontró epubs_elejandria/ en {BACKEND_DIR}")
        sys.exit(1)

    # Asegurar que books/ exista
    if not DRY_RUN:
        BOOKS_DIR.mkdir(parents=True, exist_ok=True)

    # ── Fase 1 ──────────────────────────────────────────────────────────────
    print("\n[Fase 1] Limpiando .epub antiguos en media/ ...")
    deleted = cleanup_old_epubs()
    print(f"         → {deleted} archivo(s) eliminado(s).")

    # ── Fase 2 ──────────────────────────────────────────────────────────────
    print("\n[Fase 2] Construyendo estructura slug-based ...")
    created, moved = build_slug_structure()
    print(f"         → {created} carpeta(s) nueva(s) creada(s).")
    print(f"         → {moved} epub(s) migrado(s).")

    # ── Fase 3 ──────────────────────────────────────────────────────────────
    print("\n[Fase 3] Limpiando directorios vacíos en media/books/ ...")
    removed_dirs = cleanup_empty_dirs()
    print(f"         → {removed_dirs} directorio(s) vacío(s) eliminado(s).")

    # ── Resumen ─────────────────────────────────────────────────────────────
    print("\n" + "=" * 65)
    print("  RESUMEN FINAL")
    print("=" * 65)
    print(f"  ePubs antiguos eliminados    : {deleted}")
    print(f"  Carpetas slug creadas        : {created}")
    print(f"  ePubs migrados               : {moved}")
    print(f"  Directorios vacíos limpiados : {removed_dirs}")
    if DRY_RUN:
        print("\n  Ejecuta sin --dry-run para aplicar los cambios reales.")
    else:
        print("\n  ✅  Migración completada.")
    print("=" * 65)


if __name__ == "__main__":
    main()
