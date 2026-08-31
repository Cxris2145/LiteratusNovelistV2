"""Genera y audita la colección unificada de portadas Literatus (procedural, sin IA).

Este script se conserva por compatibilidad. La lógica vive ahora en
``catalog.covers`` (compositor) y ``catalog.standardization`` (backup + auditoría).
Para la estandarización completa (con ilustración de Gemini) usa en su lugar::

    python manage.py standardize_library --all

Modo por defecto: dry-run/auditoría.
``--apply``: escribe una WEBP 600x900 procedural por libro en
``media/books/<slug>/cover_literatus.webp`` y actualiza ``Book.cover_image``,
tras crear un backup SQLite verificado por sha256.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = PROJECT_ROOT / "Producto" / "backend"
sys.path.insert(0, str(BACKEND_DIR))
os.chdir(BACKEND_DIR)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django  # noqa: E402

django.setup()

from django.conf import settings  # noqa: E402
from django.db import transaction  # noqa: E402

from catalog.covers import build_cover_context, palette_for, render_literatus_cover  # noqa: E402
from catalog.models import Book  # noqa: E402
from catalog.standardization import (  # noqa: E402
    audit_current_covers,
    backup_sqlite_database,
)

DEFAULT_OUTPUT_NAME = "cover_literatus.webp"
DEFAULT_REPORT = PROJECT_ROOT / "cover_collection_audit.json"


def generate_cover(book, target: Path, quality: int) -> dict:
    ctx = build_cover_context(book)
    img = render_literatus_cover(
        title=ctx["title"], authors=ctx["authors"], book_code=ctx["book_code"],
        seed=ctx["seed"], symbol=ctx["symbol"],
        palette=palette_for(ctx["seed"], ctx["palette_family"]),
        art_background=None, with_medallion=True)
    target.parent.mkdir(parents=True, exist_ok=True)
    img.save(target, "WEBP", quality=quality, method=6)
    from catalog.covers import sha256_file
    return {
        "slug": book.slug,
        "title": ctx["title"],
        "authors": ctx["authors"],
        "symbol": ctx["symbol"],
        "code": ctx["book_code"],
        "relative_path": target.relative_to(Path(settings.MEDIA_ROOT)).as_posix(),
        "bytes": target.stat().st_size,
        "sha256": sha256_file(target),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Genera/audita portadas Literatus (procedural).")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--quality", type=int, default=88)
    parser.add_argument("--output-name", default=DEFAULT_OUTPUT_NAME)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    before = audit_current_covers()
    books = list(Book.objects.prefetch_related("authors", "genres").order_by("slug"))
    if args.limit is not None:
        books = books[: args.limit]

    generated: list[dict] = []
    backup = None
    if args.apply:
        backup = backup_sqlite_database("cover_unification")
        media_root = Path(settings.MEDIA_ROOT)
        for i, book in enumerate(books, start=1):
            target = media_root / "books" / book.slug / args.output_name
            info = generate_cover(book, target, args.quality)
            generated.append(info)
            if args.verbose:
                print(f"{i:04d}/{len(books):04d} {book.slug} -> {info['relative_path']} "
                      f"{info['bytes'] / 1024:.1f}KB")
        with transaction.atomic():
            for item in generated:
                Book.objects.filter(slug=item["slug"]).update(cover_image=item["relative_path"])

    after = audit_current_covers()
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": "apply" if args.apply else "dry-run",
        "target": {"format": "WEBP", "width": 600, "height": 900, "output_name": args.output_name},
        "books_selected": len(books),
        "backup": backup,
        "before": before,
        "after": after,
        "generated": generated,
    }
    args.report.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    counts = after["counts"]
    print("LITERATUS_COVER_COLLECTION")
    print(f"mode={payload['mode']}")
    print(f"books_selected={len(books)}")
    if backup:
        print(f"backup={backup['backup']}")
        print(f"backup_sha256={backup['sha256']}")
    for key in ("books", "webp", "target_size", "missing_db", "missing_file",
                "invalid_image", "invalid_format", "invalid_size"):
        print(f"{key}={counts.get(key, 0)}")
    print(f"report={args.report}")
    has_errors = any(counts.get(k, 0) for k in
                     ("missing_db", "missing_file", "invalid_image", "invalid_format", "invalid_size"))
    return 1 if has_errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
