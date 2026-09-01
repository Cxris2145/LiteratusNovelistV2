"""
catalog/management/commands/import_epubs.py

Reconstruye el catálogo desde una carpeta de EPUBs. Por cada subcarpeta
`<slug>/` con un `.epub` dentro, crea/actualiza Author, Book, BookAuthor,
Edition (epub, precio 0) y Chapter (contenido HTML limpio). Al final asigna
los géneros usando `json_data/elejandria_master.json`.

Es la versión de scripts/db_setup/bulk_db_injection.py convertida en comando
de gestión, con rutas por parámetro.

Uso:
    python manage.py import_epubs                       # autodetecta la carpeta
    python manage.py import_epubs --source ../../books  # carpeta explícita
    python manage.py import_epubs --limit 20            # prueba con 20 libros
    python manage.py import_epubs --skip-existing       # no re-procesa libros ya con capítulos
"""

import json
import os
import re
import shutil
import traceback
import zipfile
from decimal import Decimal
from pathlib import Path

from bs4 import BeautifulSoup
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from catalog.models import Author, Book, BookAuthor, Chapter, Edition, Genre

SPAM_PATTERNS = [
    r"¡Gracias por leer este libro.*",
    r"Descargado de.*",
    r"www\.elejandria\.com",
    r"Lectulandia",
    r"www\.lectulandia\.com",
    r"Descubre nuestra colecci.*",
    r"Si quieres m[aá]s libros.*",
    r"Libro descargado en.*",
]


def _candidate_sources():
    """Ubicaciones habituales de la carpeta de EPUBs, en orden de preferencia."""
    b = Path(settings.BASE_DIR)
    yield b / "media" / "books"
    for anc in [b, *b.parents][:7]:
        yield anc / "respaldos-software" / "books"
        yield anc / "books"


def _resolve_source(arg):
    if arg:
        p = Path(arg).expanduser().resolve()
        if not p.is_dir():
            raise CommandError(f"--source no existe: {p}")
        return p
    for cand in _candidate_sources():
        if cand.is_dir() and any(cand.glob("*/*.epub")):
            return cand
    raise CommandError(
        "No encontré la carpeta de EPUBs. Pásala con --source "
        "(ej. --source ruta/a/respaldos-software/books)."
    )


def _slugify(text):
    text = re.sub(r"[^a-z0-9]+", "-", str(text).lower())
    return text.strip("-")[:100]


def _clean_html(soup, book_slug):
    for img in soup.find_all("img"):
        src = img.get("src", "")
        if "elejandria" in src.lower() or "logo" in src.lower():
            img.decompose()
            continue
        img["src"] = f"/media/books/{book_slug}/images/{os.path.basename(src)}"
        img["style"] = (
            "max-width:100%;height:auto;display:block;margin:1em auto;"
            "border-radius:8px;box-shadow:0 4px 15px rgba(0,0,0,.3);"
        )
    html = str(soup)
    for pat in SPAM_PATTERNS:
        html = re.sub(pat, "", html, flags=re.IGNORECASE)
    return html


def _extract_images(epub_path, dest_folder):
    img_dir = Path(dest_folder) / "images"
    img_dir.mkdir(parents=True, exist_ok=True)
    try:
        with zipfile.ZipFile(epub_path) as z:
            for f in z.infolist():
                low = f.filename.lower()
                if low.endswith((".png", ".jpg", ".jpeg", ".gif")) and "elejandria" not in low:
                    with z.open(f) as s, open(img_dir / os.path.basename(f.filename), "wb") as t:
                        shutil.copyfileobj(s, t)
    except Exception:  # noqa: BLE001
        pass


def _metadata_from_opf(epub_path):
    try:
        with zipfile.ZipFile(epub_path) as z:
            container = z.read("META-INF/container.xml").decode("utf-8")
            opf_path = re.search(r'full-path="([^"]+)"', container).group(1)
            opf = z.read(opf_path).decode("utf-8", errors="ignore")
        t = re.search(r"<dc:title[^>]*>(.*?)</dc:title>", opf, re.DOTALL | re.IGNORECASE)
        c = re.search(r"<dc:creator[^>]*>(.*?)</dc:creator>", opf, re.DOTALL | re.IGNORECASE)
        title = re.sub(r"<[^>]+>", "", t.group(1)).strip() if t else None
        creator = re.sub(r"<[^>]+>", "", c.group(1)).strip() if c else None
        return title, creator
    except Exception:  # noqa: BLE001
        return None, None


def _chapters_structural(book_epub, slug):
    import urllib.parse

    from ebooklib import epub

    chapters = []

    def walk(items):
        for item in items:
            if isinstance(item, tuple):
                walk(item)
            elif isinstance(item, epub.Link):
                parts = item.href.split("#")
                fname = urllib.parse.unquote(parts[0])
                anchor = parts[1] if len(parts) > 1 else None
                doc = book_epub.get_item_with_href(fname)
                if not doc:
                    continue
                soup = BeautifulSoup(doc.get_content(), "html.parser")
                html = ""
                if anchor:
                    node = soup.find(id=anchor) or soup.find(attrs={"name": anchor})
                    if node:
                        buf, curr = [], node
                        while curr:
                            buf.append(str(curr))
                            curr = curr.next_sibling
                            if curr and hasattr(curr, "get") and (curr.get("id") or curr.get("name")):
                                break
                        html = "".join(buf)
                if not html:
                    html = str(soup.body) if soup.body else str(soup)
                chapters.append({
                    "title": (item.title or "")[:200],
                    "content": _clean_html(BeautifulSoup(html, "html.parser"), slug),
                    "order": len(chapters) + 1,
                })
            elif hasattr(item, "links"):
                walk(item.links)

    walk(book_epub.toc)
    return chapters


def _chapters_manual(epub_path, slug):
    chapters, order = [], 1
    with zipfile.ZipFile(epub_path) as z:
        container = z.read("META-INF/container.xml").decode("utf-8")
        opf_path = re.search(r'full-path="([^"]+)"', container).group(1)
        opf = z.read(opf_path).decode("utf-8", errors="ignore")
        base = os.path.dirname(opf_path)
        manifest = {
            re.search(r'id="([^"]+)"', ln).group(1): re.search(r'href="([^"]+)"', ln).group(1)
            for ln in opf.split("<item ") if 'id="' in ln and 'href="' in ln
        }
        spine = [
            re.search(r'idref="([^"]+)"', ln).group(1)
            for ln in opf.split("<itemref ") if 'idref="' in ln
        ]
        for item_id in spine:
            if item_id not in manifest:
                continue
            fpath = os.path.join(base, manifest[item_id]).replace("\\", "/")
            try:
                soup = BeautifulSoup(z.read(fpath).decode("utf-8", errors="ignore"), "html.parser")
                if len(soup.get_text().strip()) > 100:
                    chapters.append({
                        "title": (soup.find(["h1", "h2"]) or soup).text.strip()[:100],
                        "content": _clean_html(soup, slug),
                        "order": order,
                    })
                    order += 1
            except Exception:  # noqa: BLE001
                continue
    return chapters


def _chapters_wholebook(epub_path, slug):
    """Último recurso: mete TODO el texto (x)html del EPUB en un solo capítulo."""
    parts = []
    try:
        with zipfile.ZipFile(epub_path) as z:
            names = [n for n in z.namelist() if n.lower().endswith((".xhtml", ".html", ".htm"))]
            for n in sorted(names):
                low = n.lower()
                if any(k in low for k in ("cover", "titlepage", "nav", "toc")):
                    continue
                try:
                    soup = BeautifulSoup(z.read(n).decode("utf-8", errors="ignore"), "html.parser")
                except Exception:  # noqa: BLE001
                    continue
                body = soup.body or soup
                if len(body.get_text(strip=True)) > 80:
                    parts.append(_clean_html(BeautifulSoup(str(body), "html.parser"), slug))
    except Exception:  # noqa: BLE001
        return []
    if not parts:
        return []
    return [{"title": "Texto completo", "content": "\n".join(parts), "order": 1}]


class Command(BaseCommand):
    help = "Reconstruye el catálogo (libros, capítulos, autores, géneros) desde una carpeta de EPUBs."

    def add_arguments(self, parser):
        parser.add_argument("--source", default=None, help="Carpeta con subcarpetas <slug>/*.epub")
        parser.add_argument("--categories", default=None,
                            help="JSON categoría->[slugs] (default: json_data/elejandria_master.json)")
        parser.add_argument("--limit", type=int, default=0, help="Procesa como máximo N libros.")
        parser.add_argument("--skip-existing", action="store_true",
                            help="Salta libros que ya tienen capítulos.")

    def handle(self, *args, **opts):
        src = _resolve_source(opts["source"])
        w = self.stdout.write
        w(f"Fuente de EPUBs: {src}")

        folders = sorted(f for f in src.iterdir() if f.is_dir() and any(f.glob("*.epub")))
        if opts["limit"]:
            folders = folders[: opts["limit"]]
        w(f"Carpetas con EPUB: {len(folders)}")

        ok = skipped = failed = 0
        for i, folder in enumerate(folders, 1):
            slug = folder.name[:100]
            epub_path = next(iter(folder.glob("*.epub")))
            try:
                existing = Book.objects.filter(slug=slug).first()
                if opts["skip_existing"] and existing and existing.chapters.exists():
                    skipped += 1
                    continue

                _extract_images(epub_path, folder)
                title, author = _metadata_from_opf(epub_path)

                chapters = []
                try:
                    from ebooklib import epub as _epub
                    be = _epub.read_epub(str(epub_path))
                    if not author:
                        cr = be.get_metadata("DC", "creator")
                        author = str(cr[0][0]) if cr else None
                    if not title:
                        ti = be.get_metadata("DC", "title")
                        title = str(ti[0][0]) if ti else None
                    chapters = _chapters_structural(be, slug)
                except Exception:  # noqa: BLE001
                    chapters = []
                # Fallback: si el TOC no dio capítulos, extraer por spine.
                if not chapters:
                    try:
                        chapters = _chapters_manual(epub_path, slug)
                    except Exception:  # noqa: BLE001
                        chapters = []
                # Último recurso: un único capítulo con todo el texto del EPUB.
                if not chapters:
                    chapters = _chapters_wholebook(epub_path, slug)

                author = author or "Autor Desconocido"
                title = title or slug.replace("-", " ").title()
                if not chapters:
                    failed += 1
                    w(f"  ! {slug}: sin capítulos extraíbles")
                    continue

                with transaction.atomic():
                    author_obj, _ = Author.objects.get_or_create(
                        slug=_slugify(author), defaults={"full_name": author[:255]}
                    )
                    book_obj, _ = Book.objects.get_or_create(
                        slug=slug,
                        defaults={"title": title[:255], "status": "published", "is_published": True},
                    )
                    BookAuthor.objects.get_or_create(book=book_obj, author=author_obj)
                    Edition.objects.get_or_create(
                        book=book_obj, format="epub",
                        defaults={"file": f"books/{slug}/{epub_path.name}", "price": Decimal("0.00")},
                    )
                    book_obj.chapters.all().delete()
                    rows = [
                        Chapter(
                            book=book_obj, title=ch["title"] or f"Capítulo {ch['order']}",
                            content_html=ch["content"], order=ch["order"],
                        )
                        for ch in chapters
                        if not (ch["order"] == 1 and ch["content"].count("<img") == 1
                                and len(ch["content"]) < 500)
                    ]
                    Chapter.objects.bulk_create(rows, batch_size=200)
                ok += 1
                if i % 10 == 0:
                    w(f"  [{i}/{len(folders)}] {ok} ok / {skipped} saltados / {failed} fallidos")
                    self.stdout.flush()
            except Exception:  # noqa: BLE001
                failed += 1
                w(f"  ! {slug}: error\n{traceback.format_exc(limit=2)}")

        self._sync_categories(opts["categories"], w)
        w(self.style.SUCCESS(
            f"\nListo. {ok} importados, {skipped} saltados, {failed} fallidos. "
            f"Libros en catálogo: {Book.objects.count()}"
        ))

    def _sync_categories(self, path, w):
        json_path = Path(path) if path else Path(settings.BASE_DIR) / "json_data" / "elejandria_master.json"
        if not json_path.exists():
            w(f"(sin asignar géneros: no existe {json_path})")
            return
        master = json.loads(json_path.read_text(encoding="utf-8"))
        books_by_slug = {b.slug: b for b in Book.objects.all().only("id", "slug")}
        Through = Book.genres.through
        links, linked = [], 0
        for cat_name, slugs in master.items():
            genre, _ = Genre.objects.get_or_create(name=cat_name.strip())
            for s in slugs:
                book = books_by_slug.get(str(s)[:100])
                if book:
                    links.append(Through(book_id=book.id, genre_id=genre.id))
                    linked += 1
        Through.objects.bulk_create(links, batch_size=500, ignore_conflicts=True)
        w(f"Géneros asignados: {linked} vínculos libro-categoría.")
