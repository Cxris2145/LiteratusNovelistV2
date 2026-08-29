#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pilot_importer.py -- Library Content Agent, Etapa 2
====================================================
Importador piloto reutilizable basado en bulk_db_injection.py.

Cambios respecto al original:
  1. Lee EPUBs desde RESPALDO (respaldos-software/books/) en vez de media/books/
  2. Copia el EPUB al directorio media/books/<slug>/ antes de procesar
  3. Soporta --dry-run (no modifica BD ni copia archivos)
  4. Soporta --slugs para procesar una lista especifica
  5. Continua si un libro falla (log por libro)
  6. Evita duplicados via get_or_create
  7. Respeta checkpoint (no reimporta libros ya importados)
  8. NO llama a IA, no genera audio, no ejecuta flush
  9. ISBN nunca se carga automaticamente (campo vacio)
 10. Registra metricas de tiempo y crecimiento de BD

Uso:
    python pilot_importer.py --dry-run --slugs slugs.txt
    python pilot_importer.py --slugs slugs.txt
    python pilot_importer.py --all           (usa todos los pendientes del checkpoint)
"""
import sys, io, os, json, shutil, time, argparse, traceback, zipfile, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

from pathlib import Path
from decimal import Decimal
from datetime import datetime, timezone

# ─── Rutas ───────────────────────────────────────────────────────────────────
SCRIPT_DIR   = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR
BACKEND_DIR  = PROJECT_ROOT / "Producto" / "backend"
BOOKS_SRC    = PROJECT_ROOT.parent.parent / "respaldos-software" / "books"
MEDIA_BOOKS  = BACKEND_DIR / "media" / "books"
CHECKPOINT   = PROJECT_ROOT / "IMPORT_CHECKPOINT.json"
ERRORS_MD    = PROJECT_ROOT / "BOOK_IMPORT_ERRORS.md"
AGENT_LOG    = PROJECT_ROOT / "AGENT_LOG.md"
PILOT_LOG    = PROJECT_ROOT / "pilot_import.log"
INVENTORY    = PROJECT_ROOT / "LIBRARY_INVENTORY.json"

# ─── Setup Django ─────────────────────────────────────────────────────────────
sys.path.insert(0, str(BACKEND_DIR))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
import django
django.setup()

from catalog.models import Book, Author, BookAuthor, Edition, Genre, Chapter
from bs4 import BeautifulSoup
from ebooklib import epub
import ebooklib

# ─── Helpers de parseo (reutilizados de bulk_db_injection.py) ────────────────
def slugify_fallback(text):
    text = str(text).lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")[:100]

def slug_from_folder_name(folder_name):
    """Extrae autor del slug de carpeta si es la forma titulo-autor."""
    parts = folder_name.split("-")
    if len(parts) >= 4:
        # Intentar aislar el autor (ultimas 2-3 palabras)
        for split in [2, 3]:
            potential = " ".join(parts[-split:]).title()
            if len(potential) > 3:
                return potential
    return None

def clean_content(html_soup, book_slug):
    spam_patterns = [
        r"Gracias por leer este libro.*", r"Descargado de.*",
        r"www\.elejandria\.com", r"Lectulandia", r"www\.lectulandia\.com",
    ]
    for img in html_soup.find_all("img"):
        src = img.get("src", "")
        if "elejandria" in src.lower() or "logo" in src.lower():
            img.decompose()
            continue
        filename = os.path.basename(src)
        img["src"] = f"/media/books/{book_slug}/images/{filename}"
        img["style"] = "max-width:100%;height:auto;display:block;margin:1em auto;"
    html_str = str(html_soup)
    for pattern in spam_patterns:
        html_str = re.sub(pattern, "", html_str, flags=re.IGNORECASE)
    return html_str

def extract_images(epub_path, dest_folder):
    img_folder = Path(dest_folder) / "images"
    img_folder.mkdir(parents=True, exist_ok=True)
    try:
        with zipfile.ZipFile(epub_path, "r") as z:
            for f in z.infolist():
                if f.filename.lower().endswith((".png",".jpg",".jpeg",".gif",".webp")):
                    if "elejandria" not in f.filename.lower():
                        dest = img_folder / os.path.basename(f.filename)
                        with z.open(f) as s, open(dest, "wb") as t:
                            shutil.copyfileobj(s, t)
    except Exception:
        pass

def extract_cover(epub_path, dest_folder, slug):
    """Intenta extraer la portada del EPUB y guardarla como cover.jpg/png."""
    cover_extensions = (".jpg", ".jpeg", ".png", ".webp", ".gif")
    try:
        with zipfile.ZipFile(epub_path, "r") as z:
            # Buscar por nombre
            candidates = []
            for e in z.infolist():
                name = e.filename.lower()
                if re.search(r"cover|portada", name) and name.endswith(cover_extensions):
                    candidates.append(e)
            if not candidates:
                # Intentar via OPF meta cover
                container = z.read("META-INF/container.xml").decode("utf-8", errors="ignore")
                opf_path_m = re.search(r'full-path="([^"]+)"', container)
                if opf_path_m:
                    opf_text = z.read(opf_path_m.group(1)).decode("utf-8", errors="ignore")
                    cover_id_m = re.search(r'<meta\s+name="cover"\s+content="([^"]+)"', opf_text, re.IGNORECASE)
                    if cover_id_m:
                        cid = cover_id_m.group(1)
                        href_m = re.search(rf'<item[^>]+id="{re.escape(cid)}"[^>]*href="([^"]+)"', opf_text, re.IGNORECASE)
                        if href_m:
                            base_dir = str(Path(opf_path_m.group(1)).parent)
                            fp = (Path(base_dir) / href_m.group(1)).as_posix()
                            try:
                                data = z.read(fp)
                                ext = Path(href_m.group(1)).suffix.lower() or ".jpg"
                                cover_path = Path(dest_folder) / f"cover{ext}"
                                cover_path.write_bytes(data)
                                return str(cover_path.relative_to(BACKEND_DIR / "media"))
                            except Exception:
                                pass
            if candidates:
                best = candidates[0]
                data = z.read(best.filename)
                ext = Path(best.filename).suffix.lower() or ".jpg"
                cover_path = Path(dest_folder) / f"cover{ext}"
                cover_path.write_bytes(data)
                return str(cover_path.relative_to(BACKEND_DIR / "media"))
    except Exception:
        pass
    return None

def get_metadata_from_opf(epub_path):
    try:
        with zipfile.ZipFile(epub_path, "r") as z:
            container = z.read("META-INF/container.xml").decode("utf-8", errors="ignore")
            opf_path = re.search(r'full-path="([^"]+)"', container).group(1)
            opf_content = z.read(opf_path).decode("utf-8", errors="ignore")
            title_m   = re.search(r"<dc:title[^>]*>(.*?)</dc:title>",   opf_content, re.DOTALL | re.IGNORECASE)
            creator_m = re.search(r"<dc:creator[^>]*>(.*?)</dc:creator>", opf_content, re.DOTALL | re.IGNORECASE)
            lang_m    = re.search(r"<dc:language[^>]*>(.*?)</dc:language>", opf_content, re.DOTALL | re.IGNORECASE)
            desc_m    = re.search(r"<dc:description[^>]*>(.*?)</dc:description>", opf_content, re.DOTALL | re.IGNORECASE)
            def clean(m): return re.sub(r"<[^>]+>", "", m.group(1)).strip() if m else None
            return clean(title_m), clean(creator_m), clean(lang_m), clean(desc_m)
    except Exception:
        return None, None, None, None

def get_structural_chapters(book_epub, book_slug):
    import urllib.parse
    chapters_data = []
    def walk_toc(items):
        for item in items:
            if isinstance(item, tuple): walk_toc(item)
            elif isinstance(item, epub.Link):
                href_parts = item.href.split("#")
                file_name  = urllib.parse.unquote(href_parts[0])
                anchor     = href_parts[1] if len(href_parts) > 1 else None
                doc = book_epub.get_item_with_href(file_name)
                if not doc: continue
                soup = BeautifulSoup(doc.get_content(), "html.parser")
                if anchor:
                    start = soup.find(id=anchor) or soup.find(attrs={"name": anchor})
                    if start:
                        payload = []
                        curr = start
                        while curr:
                            payload.append(str(curr))
                            curr = curr.next_sibling
                            if curr and hasattr(curr, "get") and (curr.get("id") or curr.get("name")):
                                break
                        content_html = "".join(payload)
                    else:
                        content_html = str(soup.body) if soup.body else str(soup)
                else:
                    content_html = str(soup.body) if soup.body else str(soup)
                chapters_data.append({
                    "title": item.title[:200] if item.title else f"Capitulo {len(chapters_data)+1}",
                    "content": clean_content(BeautifulSoup(content_html, "html.parser"), book_slug),
                    "order": len(chapters_data) + 1
                })
            elif hasattr(item, "links"):
                walk_toc(item.links)
    walk_toc(book_epub.toc)
    return chapters_data

def manual_extract_chapters(epub_path, slug):
    chapters = []
    try:
        with zipfile.ZipFile(epub_path, "r") as z:
            container = z.read("META-INF/container.xml").decode("utf-8")
            opf_path  = re.search(r'full-path="([^"]+)"', container).group(1)
            opf_content = z.read(opf_path).decode("utf-8", errors="ignore")
            base_dir  = os.path.dirname(opf_path)
            manifest  = {re.search(r'id="([^"]+)"', l).group(1): re.search(r'href="([^"]+)"', l).group(1)
                         for l in opf_content.split("<item ") if 'id="' in l and 'href="' in l}
            spine_ids = [re.search(r'idref="([^"]+)"', l).group(1)
                         for l in opf_content.split("<itemref ") if 'idref="' in l]
            order = 1
            for iid in spine_ids:
                if iid not in manifest: continue
                fp = os.path.join(base_dir, manifest[iid]).replace("\\", "/")
                try:
                    raw_html = z.read(fp).decode("utf-8", errors="ignore")
                    soup = BeautifulSoup(raw_html, "html.parser")
                    if len(soup.get_text().strip()) > 100:
                        heading = soup.find(["h1","h2"]) or soup
                        chapters.append({
                            "title": heading.text.strip()[:100] if hasattr(heading,"text") else f"Capitulo {order}",
                            "content": clean_content(soup, slug),
                            "order": order
                        }); order += 1
                except Exception:
                    continue
    except Exception as e:
        raise Exception(f"Manual extraccion fallo: {e}")
    return chapters

# ─── Checkpoint ──────────────────────────────────────────────────────────────
def load_checkpoint():
    if CHECKPOINT.exists():
        try:
            return json.loads(CHECKPOINT.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}

def save_checkpoint(data):
    CHECKPOINT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

# ─── Importar un libro ───────────────────────────────────────────────────────
def import_one(slug, dry_run=False, verbose=True):
    """
    Importa un EPUB desde BOOKS_SRC a MEDIA_BOOKS y lo registra en Django.
    Retorna dict con resultado.
    """
    result = {
        "slug": slug, "status": "ok",
        "book_created": False, "author_created": False,
        "edition_created": False, "chapters_created": 0,
        "cover_extracted": False, "cover_path": None,
        "title": "", "author": "",
        "errors": [], "warnings": [],
    }
    src_folder = BOOKS_SRC / slug
    epub_files = list(src_folder.glob("*.epub")) if src_folder.exists() else []
    if not epub_files:
        result["status"] = "error"
        result["errors"].append(f"No se encontro EPUB en {src_folder}")
        return result

    epub_path = epub_files[0]

    # ── DRY RUN: solo inspeccionar ──────────────────────────────────────────
    if dry_run:
        book_title, author_name, lang, desc = get_metadata_from_opf(epub_path)
        # Fallback de autor desde slug
        if not author_name:
            author_name = slug_from_folder_name(slug) or "Autor Desconocido"
            result["warnings"].append(f"Autor extraido del slug: {author_name}")
        if not book_title:
            book_title = slug.replace("-", " ").title()
            result["warnings"].append("Titulo extraido del slug")
        result["title"]  = book_title or ""
        result["author"] = author_name or ""
        # Contar capitulos
        try:
            book_epub = epub.read_epub(str(epub_path))
            chaps = get_structural_chapters(book_epub, slug)
            if not chaps:
                chaps = manual_extract_chapters(str(epub_path), slug)
        except Exception:
            try:
                chaps = manual_extract_chapters(str(epub_path), slug)
            except Exception as e:
                chaps = []
                result["warnings"].append(f"No pude contar capitulos: {e}")
        result["chapters_created"] = len(chaps)
        # Conflictos
        if Book.objects.filter(slug=slug[:100]).exists():
            result["warnings"].append("Book ya existe en BD (se usara get_or_create)")
        author_slug = slugify_fallback(author_name)
        if Author.objects.filter(slug=author_slug).exists():
            result["warnings"].append(f"Author '{author_name}' ya existe (reutilizando)")
        result["dry_run"] = True
        return result

    # ── IMPORTACION REAL ────────────────────────────────────────────────────
    dest_folder = MEDIA_BOOKS / slug
    dest_folder.mkdir(parents=True, exist_ok=True)

    # 1. Copiar EPUB
    dest_epub = dest_folder / epub_path.name
    if not dest_epub.exists():
        shutil.copy2(epub_path, dest_epub)

    # 2. Extraer imagenes
    extract_images(dest_epub, dest_folder)

    # 3. Extraer metadatos
    book_title, author_name, lang, desc = get_metadata_from_opf(epub_path)
    try:
        book_epub = epub.read_epub(str(epub_path))
        if not author_name:
            creators = book_epub.get_metadata("DC", "creator")
            author_name = str(creators[0][0]) if creators and isinstance(creators[0], tuple) else None
        if not book_title:
            titles = book_epub.get_metadata("DC", "title")
            book_title = str(titles[0][0]) if titles and isinstance(titles[0], tuple) else None
        chapters_data = get_structural_chapters(book_epub, slug)
    except Exception:
        try:
            chapters_data = manual_extract_chapters(str(epub_path), slug)
        except Exception as e:
            result["errors"].append(f"Extraccion capitulos fallo: {e}")
            chapters_data = []

    # Fallbacks de titulo/autor
    if not author_name:
        author_name = slug_from_folder_name(slug) or "Autor Desconocido"
        result["warnings"].append(f"Autor desde slug: {author_name}")
    if not book_title:
        book_title = slug.replace("-", " ").title()
        result["warnings"].append("Titulo desde slug")

    result["title"]  = book_title[:100]
    result["author"] = author_name[:100]

    if not chapters_data:
        result["warnings"].append("0 capitulos extraidos — libro importado sin contenido")

    # 4. Extraer portada
    cover_rel = extract_cover(epub_path, dest_folder, slug)
    if cover_rel:
        result["cover_extracted"] = True
        result["cover_path"] = cover_rel

    # 5. BD: Author
    author_obj, author_created = Author.objects.get_or_create(
        slug=slugify_fallback(author_name),
        defaults={"full_name": author_name[:255]}
    )
    result["author_created"] = author_created

    # 6. BD: Book
    book_defaults = {
        "title": book_title[:255],
        "status": "published",
        "is_published": True,
    }
    if desc:
        book_defaults["synopsis"] = desc[:2000]
    if cover_rel:
        book_defaults["cover_image"] = cover_rel

    book_obj, book_created = Book.objects.get_or_create(
        slug=slug[:512],
        defaults=book_defaults
    )
    # Si la portada se acaba de extraer y el libro ya existia sin portada
    if cover_rel and not book_obj.cover_image:
        book_obj.cover_image = cover_rel
        book_obj.save(update_fields=["cover_image"])
    result["book_created"] = book_created

    # 7. BD: BookAuthor
    BookAuthor.objects.get_or_create(book=book_obj, author=author_obj)

    # 8. BD: Edition -- isbn SIEMPRE vacio
    edition_defaults = {
        "file": f"books/{slug}/{epub_path.name}",
        "price": Decimal("0.00"),
        "language": (lang or "es")[:10],
        # isbn deliberadamente NO se carga
    }
    _, edition_created = Edition.objects.get_or_create(
        book=book_obj, format="epub",
        defaults=edition_defaults
    )
    result["edition_created"] = edition_created

    # 9. BD: Chapters
    if chapters_data:
        book_obj.chapters.all().delete()
        chaps_ok = 0
        for chap in chapters_data:
            # Saltar capitulos que son solo una imagen de portada
            if chap["order"] == 1 and chap["content"].count("<img") == 1 and len(chap["content"]) < 500:
                continue
            try:
                Chapter.objects.create(
                    book=book_obj,
                    title=chap["title"][:255],
                    content_html=chap["content"],
                    order=chap["order"]
                )
                chaps_ok += 1
            except Exception as e:
                result["warnings"].append(f"Cap {chap['order']} error: {e}")
        result["chapters_created"] = chaps_ok

    return result

# ─── Main ─────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Library Content Agent -- Importador Piloto")
    parser.add_argument("--dry-run",  action="store_true", help="Simular sin modificar BD")
    parser.add_argument("--slugs",    type=str, help="Archivo con lista de slugs (uno por linea)")
    parser.add_argument("--all",      action="store_true", help="Procesar todos los pendientes del checkpoint")
    parser.add_argument("--verbose",  action="store_true", default=True)
    args = parser.parse_args()

    ts = datetime.now(timezone.utc).isoformat()
    mode = "DRY-RUN" if args.dry_run else "IMPORTACION REAL"
    print(f"\n{'='*65}")
    print(f"  Library Content Agent -- Piloto Etapa 2 ({mode})")
    print(f"  {ts}")
    print(f"{'='*65}\n")

    # Cargar lista de slugs
    if args.slugs:
        slugs_file = Path(args.slugs)
        if not slugs_file.exists():
            print(f"ERROR: no existe {args.slugs}")
            sys.exit(1)
        slugs = [l.strip() for l in slugs_file.read_text(encoding="utf-8").splitlines() if l.strip()]
    elif args.all:
        chk = load_checkpoint()
        slugs = chk.get("pending", [])
        if not slugs:
            print("No hay slugs pendientes en el checkpoint.")
            sys.exit(0)
    else:
        print("Especifica --slugs <archivo> o --all")
        sys.exit(1)

    print(f"[*] Libros a procesar: {len(slugs)}")
    print(f"[*] Modo: {mode}\n")

    # Filtrar ya importados
    chk = load_checkpoint()
    already = set(chk.get("imported", []))
    skipped = [s for s in slugs if s in already]
    slugs   = [s for s in slugs if s not in already]
    if skipped:
        print(f"[*] Omitidos (ya importados): {len(skipped)}")

    # DB size antes
    db_path = BACKEND_DIR / "db.sqlite3"
    db_size_before = db_path.stat().st_size if db_path.exists() else 0

    start_time = time.time()
    results = []
    ok_list, warn_list, error_list = [], [], []

    print(f"{'#':<3} {'Slug':<50} {'Caps':>5} {'Cov':>4} {'Aut':>4} {'Status'}")
    print("-"*80)

    for i, slug in enumerate(slugs, 1):
        t0 = time.time()
        res = import_one(slug, dry_run=args.dry_run)
        t1 = time.time()
        res["time_s"] = round(t1 - t0, 2)

        results.append(res)
        if res["status"] == "error":
            error_list.append(res)
            flag = "ERROR"
        elif res.get("warnings"):
            warn_list.append(res)
            flag = "WARN "
        else:
            ok_list.append(res)
            flag = "OK   "

        aut = "NEW" if res.get("author_created") else "EXI"
        cov = "SI" if res.get("cover_extracted") else "NO"
        caps = res.get("chapters_created", 0)
        print(f"{i:<3} {slug[:50]:<50} {caps:>5} {cov:>4} {aut:>4} {flag} ({res['time_s']:.1f}s)")
        if res["errors"]:
            for e in res["errors"]:
                print(f"    ERROR: {e}")
        if res["warnings"] and args.verbose:
            for w in res["warnings"]:
                print(f"    WARN: {w}")

    elapsed = time.time() - start_time
    db_size_after = db_path.stat().st_size if db_path.exists() else 0

    print(f"\n{'='*65}")
    print(f"  RESUMEN {mode}")
    print(f"{'='*65}")
    print(f"  Procesados:       {len(results)}")
    print(f"  OK:               {len(ok_list)}")
    print(f"  Con advertencias: {len(warn_list)}")
    print(f"  Errores:          {len(error_list)}")
    if not args.dry_run:
        total_chaps = sum(r["chapters_created"] for r in results)
        authors_new = sum(1 for r in results if r["author_created"])
        authors_reu = sum(1 for r in results if not r["author_created"] and r["status"]!="error")
        books_new   = sum(1 for r in results if r["book_created"])
        edits_new   = sum(1 for r in results if r["edition_created"])
        covers_ext  = sum(1 for r in results if r["cover_extracted"])
        print(f"\n  Books creados:        {books_new}")
        print(f"  Autores nuevos:       {authors_new}")
        print(f"  Autores reutilizados: {authors_reu}")
        print(f"  Editions creadas:     {edits_new}")
        print(f"  Capitulos creados:    {total_chaps}")
        print(f"  Portadas extraidas:   {covers_ext}")
        print(f"\n  DB antes:  {db_size_before/1024:.1f} KB")
        print(f"  DB despues:{db_size_after/1024:.1f} KB")
        delta_kb = (db_size_after - db_size_before) / 1024
        print(f"  Crecimiento: +{delta_kb:.1f} KB ({delta_kb/len(results):.1f} KB/libro)")
        if len(results) > 0:
            proyeccion_1046 = (delta_kb / len(results)) * 1046
            print(f"\n  Proyeccion para 1046 libros: +{proyeccion_1046/1024:.1f} MB de BD")
        print(f"  Media/books usado: {sum(r.get('size_bytes',0) for r in results)/1024/1024:.2f} MB")
    print(f"\n  Tiempo total:   {elapsed:.1f}s")
    print(f"  Tiempo/libro:   {elapsed/len(results):.2f}s" if results else "")
    print(f"{'='*65}\n")

    # Actualizar checkpoint si no es dry-run
    if not args.dry_run:
        chk = load_checkpoint()
        imported = chk.get("imported", [])
        failed   = chk.get("failed",   {})
        for r in results:
            if r["status"] != "error":
                if r["slug"] not in imported:
                    imported.append(r["slug"])
            else:
                failed[r["slug"]] = "; ".join(r["errors"][:2])
        # Guardar estadisticas del piloto
        chk["stage"]    = "PILOT_COMPLETE"
        chk["imported"] = imported
        chk["failed"]   = failed
        chk["pilot_stats"] = {
            "processed": len(results),
            "ok": len(ok_list) + len(warn_list),
            "errors": len(error_list),
            "chapters": sum(r["chapters_created"] for r in results),
            "db_before_kb": round(db_size_before/1024, 1),
            "db_after_kb":  round(db_size_after/1024, 1),
            "elapsed_s":    round(elapsed, 1),
        }
        save_checkpoint(chk)
        print("[*] Checkpoint actualizado.")

        # Registrar errores en BOOK_IMPORT_ERRORS.md
        if error_list:
            ts_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            lines = [f"| {r['slug'][:60]} | {'; '.join(r['errors'][:1])[:100]} | {ts_date} | importacion | Revisar EPUB |"
                     for r in error_list]
            content = ERRORS_MD.read_text(encoding="utf-8") if ERRORS_MD.exists() else ""
            content += "\n\n### Errores -- Etapa 2 Piloto\n\n| Slug | Error | Fecha | Fase | Solucion |\n|---|---|---|---|---|\n"
            content += "\n".join(lines)
            ERRORS_MD.write_text(content, encoding="utf-8")

        # AGENT_LOG
        entry = f"""

---

## {ts[:10]} -- [LIBRARY] Etapa 2: Importacion Piloto ({len(results)} libros)

| Dato | Valor |
|---|---|
| Modo | IMPORTACION REAL |
| Procesados | {len(results)} |
| OK | {len(ok_list) + len(warn_list)} |
| Errores | {len(error_list)} |
| Capitulos creados | {sum(r['chapters_created'] for r in results)} |
| DB antes | {db_size_before/1024:.1f} KB |
| DB despues | {db_size_after/1024:.1f} KB |
| Tiempo total | {elapsed:.1f}s |
"""
        with open(AGENT_LOG, "a", encoding="utf-8") as f:
            f.write(entry)

    # Guardar log detallado
    log_data = {"mode": mode, "timestamp": ts, "results": results}
    PILOT_LOG.write_text(json.dumps(log_data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[*] Log detallado guardado en pilot_import.log")

if __name__ == "__main__":
    main()
