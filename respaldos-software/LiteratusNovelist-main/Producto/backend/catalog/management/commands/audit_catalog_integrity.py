"""Read-only catalog integrity audit for LiteratusNovelist."""

from __future__ import annotations

import hashlib
import json
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand

from catalog.models import Author, Book


WORD_RE = re.compile(r"[a-z0-9]+")


def _ascii(text: str) -> str:
    value = unicodedata.normalize("NFKD", text or "")
    return value.encode("ascii", "ignore").decode("ascii")


def normalized_name(name: str) -> str:
    return " ".join(WORD_RE.findall(_ascii(name).lower()))


def token_signature(name: str) -> str:
    return " ".join(sorted(normalized_name(name).split()))


def file_sha256(path: Path) -> str | None:
    try:
        digest = hashlib.sha256()
        with path.open("rb") as fh:
            for chunk in iter(lambda: fh.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()
    except OSError:
        return None


class Command(BaseCommand):
    help = "Audits authors, duplicate book slugs and cover references without changing data."

    def add_arguments(self, parser):
        parser.add_argument(
            "--no-report",
            action="store_true",
            help="Only print the summary; do not write CATALOG_INTEGRITY_AUDIT files.",
        )

    def handle(self, *args, **options):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

        result = run_audit()

        self.stdout.write("Catalog integrity audit")
        self.stdout.write(f"Books: {result['counts']['books']}")
        self.stdout.write(f"Authors: {result['counts']['authors']}")
        self.stdout.write(f"Missing cover assignments: {result['counts']['missing_cover_assignments']}")
        self.stdout.write(f"Missing cover files: {result['counts']['missing_cover_files']}")
        self.stdout.write(f"Author duplicate groups: {len(result['author_duplicate_groups'])}")
        self.stdout.write(f"El Principito DB candidates: {len(result['el_principito_db_candidates'])}")
        self.stdout.write(f"El Principito inventory candidates: {len(result['el_principito_inventory_candidates'])}")

        if not options["no_report"]:
            project_root = Path(settings.BASE_DIR).parent.parent
            json_path = project_root / "CATALOG_INTEGRITY_AUDIT.json"
            md_path = project_root / "CATALOG_INTEGRITY_AUDIT.md"
            json_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
            md_path.write_text(render_markdown(result), encoding="utf-8")
            self.stdout.write(f"JSON report: {json_path}")
            self.stdout.write(f"Markdown report: {md_path}")


def run_audit() -> dict:
    authors = list(Author.objects.all().order_by("full_name", "id"))
    books = list(
        Book.objects.prefetch_related("book_authors__author", "editions").order_by("title", "id")
    )

    author_groups = defaultdict(list)
    for author in authors:
        sig = token_signature(author.full_name)
        if sig:
            author_groups[sig].append(author)

    duplicate_author_groups = []
    for sig, group in sorted(author_groups.items()):
        if len(group) < 2:
            continue
        duplicate_author_groups.append(
            {
                "signature": sig,
                "authors": [
                    {
                        "id": str(author.id),
                        "full_name": author.full_name,
                        "slug": author.slug,
                        "books_count": author.author_books.count(),
                    }
                    for author in group
                ],
            }
        )

    media_root = Path(settings.MEDIA_ROOT)
    missing_cover_assignments = []
    missing_cover_files = []
    for book in books:
        if not book.cover_image:
            missing_cover_assignments.append(book_record(book))
            continue
        cover_path = media_root / book.cover_image.name
        if not cover_path.exists():
            item = book_record(book)
            item["cover_image"] = book.cover_image.name
            missing_cover_files.append(item)

    principito_db_candidates = [
        book_record(book)
        for book in books
        if "principito" in normalized_name(book.slug) or "principito" in normalized_name(book.title)
    ]
    for item in principito_db_candidates:
        book = next(b for b in books if str(b.id) == item["id"])
        edition = book.editions.first()
        if edition and edition.file:
            source = Path(settings.BASE_DIR) / edition.file.name
            if not source.exists():
                source = Path(settings.MEDIA_ROOT) / edition.file.name
            item["edition_file"] = edition.file.name
            item["edition_file_exists"] = source.exists()
            item["edition_file_sha256"] = file_sha256(source) if source.exists() else None

    principito_inventory_candidates = load_inventory_principito_candidates()

    return {
        "counts": {
            "books": len(books),
            "authors": len(authors),
            "missing_cover_assignments": len(missing_cover_assignments),
            "missing_cover_files": len(missing_cover_files),
        },
        "author_duplicate_groups": duplicate_author_groups,
        "missing_cover_assignments": missing_cover_assignments,
        "missing_cover_files": missing_cover_files,
        "el_principito_db_candidates": principito_db_candidates,
        "el_principito_inventory_candidates": principito_inventory_candidates,
    }


def book_record(book: Book) -> dict:
    return {
        "id": str(book.id),
        "title": book.title,
        "slug": book.slug,
        "authors": [ba.author.full_name for ba in book.book_authors.all()],
        "is_published": book.is_published,
    }


def load_inventory_principito_candidates() -> list[dict]:
    inventory_path = Path(settings.BASE_DIR).parent.parent / "LIBRARY_INVENTORY.json"
    if not inventory_path.exists():
        return []
    try:
        inventory = json.loads(inventory_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []

    if isinstance(inventory, list):
        items = inventory
    elif isinstance(inventory, dict):
        items = inventory.get("items") or inventory.get("books") or inventory.get("epubs") or []
    else:
        items = []

    candidates = []
    for item in items:
        if not isinstance(item, dict):
            continue
        slug = str(item.get("slug", ""))
        title = str(item.get("title", ""))
        normalized = f"{normalized_name(slug)} {normalized_name(title)}"
        if "principito" not in normalized:
            continue
        candidates.append(
            {
                "slug": slug,
                "title": title,
                "authors": item.get("authors", []),
                "sha256": item.get("sha256"),
                "status": item.get("status"),
                "path": item.get("path"),
            }
        )
    return candidates


def render_markdown(result: dict) -> str:
    lines = [
        "# CATALOG_INTEGRITY_AUDIT.md",
        "",
        "Read-only audit of catalog maintenance tasks.",
        "",
        "## Summary",
        "",
        f"- Books: {result['counts']['books']}",
        f"- Authors: {result['counts']['authors']}",
        f"- Author duplicate groups: {len(result['author_duplicate_groups'])}",
        f"- Missing cover assignments: {result['counts']['missing_cover_assignments']}",
        f"- Missing cover files: {result['counts']['missing_cover_files']}",
        f"- El Principito DB candidates: {len(result['el_principito_db_candidates'])}",
        f"- El Principito inventory candidates: {len(result['el_principito_inventory_candidates'])}",
        "",
    ]

    lines.extend(["## Potential Duplicate Authors", ""])
    if result["author_duplicate_groups"]:
        for group in result["author_duplicate_groups"]:
            lines.append(f"### `{group['signature']}`")
            for author in group["authors"]:
                lines.append(
                    f"- `{author['slug']}` | {author['full_name']} | books: {author['books_count']}"
                )
            lines.append("")
    else:
        lines.append("No potential duplicate author groups found by normalized token signature.")
        lines.append("")

    lines.extend(["## Cover Gaps", ""])
    if result["missing_cover_assignments"] or result["missing_cover_files"]:
        for book in result["missing_cover_assignments"]:
            lines.append(f"- Missing assignment: `{book['slug']}` | {book['title']}")
        for book in result["missing_cover_files"]:
            lines.append(
                f"- Missing file: `{book['slug']}` | {book['title']} | `{book.get('cover_image', '')}`"
            )
        lines.append("")
    else:
        lines.append("No missing cover assignments or missing referenced cover files found.")
        lines.append("")

    lines.extend(["## El Principito DB Candidates", ""])
    if result["el_principito_db_candidates"]:
        for book in result["el_principito_db_candidates"]:
            lines.append(f"- `{book['slug']}` | {book['title']} | authors: {', '.join(book['authors'])}")
            if book.get("edition_file"):
                lines.append(
                    f"  - source: `{book['edition_file']}` | exists: {book['edition_file_exists']} | sha256: `{book.get('edition_file_sha256')}`"
                )
    else:
        lines.append("No El Principito candidates found in the current database.")

    lines.extend(["", "## El Principito Inventory Candidates", ""])
    if result["el_principito_inventory_candidates"]:
        for item in result["el_principito_inventory_candidates"]:
            lines.append(
                f"- `{item['slug']}` | {item['title']} | authors: {', '.join(item.get('authors', []))} | sha256: `{item.get('sha256')}` | status: {item.get('status')}"
            )
    else:
        lines.append("No El Principito candidates found in LIBRARY_INVENTORY.json.")

    lines.append("")
    return "\n".join(lines)
