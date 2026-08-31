"""Merge explicitly reviewed duplicate authors."""

from __future__ import annotations

import hashlib
import json
import shutil
import sys
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from catalog.models import Author, BookAuthor


class Command(BaseCommand):
    help = "Merges reviewed duplicate Author rows into an explicit canonical author."

    def add_arguments(self, parser):
        parser.add_argument(
            "--group",
            action="append",
            default=[],
            metavar="CANONICAL_SLUG:ALIAS_SLUG[,ALIAS_SLUG...]",
            help="Reviewed merge group. Can be passed more than once.",
        )
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Apply changes. Without this flag the command runs as a dry-run.",
        )
        parser.add_argument(
            "--no-backup",
            action="store_true",
            help="Skip SQLite backup. Intended only for tests.",
        )
        parser.add_argument(
            "--no-report",
            action="store_true",
            help="Do not write AUTHOR_MERGE_REPORT.json.",
        )

    def handle(self, *args, **options):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

        groups = parse_groups(options["group"])
        if not groups:
            raise CommandError("Pass at least one --group CANONICAL:ALIAS[,ALIAS].")

        report = merge_groups(
            groups=groups,
            apply=options["apply"],
            backup=not options["no_backup"],
        )

        self.stdout.write("Author duplicate merge")
        self.stdout.write(f"Mode: {'APPLY' if options['apply'] else 'DRY-RUN'}")
        self.stdout.write(f"Groups: {len(report['groups'])}")
        self.stdout.write(f"Relations moved: {report['totals']['relations_moved']}")
        self.stdout.write(f"Duplicate relations skipped: {report['totals']['duplicate_relations_skipped']}")
        self.stdout.write(f"Authors merged: {report['totals']['authors_merged']}")
        if report.get("backup"):
            self.stdout.write(f"Backup: {report['backup']['path']}")
            self.stdout.write(f"Backup SHA-256: {report['backup']['sha256']}")

        if not options["no_report"]:
            project_root = Path(settings.BASE_DIR).parent.parent
            report_path = project_root / "AUTHOR_MERGE_REPORT.json"
            report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
            self.stdout.write(f"Report: {report_path}")


def parse_groups(raw_groups: list[str]) -> list[dict[str, list[str] | str]]:
    groups = []
    for raw in raw_groups:
        if ":" not in raw:
            raise CommandError(f"Invalid group '{raw}'. Expected CANONICAL:ALIAS[,ALIAS].")
        canonical, aliases = raw.split(":", 1)
        canonical = canonical.strip()
        alias_slugs = [slug.strip() for slug in aliases.split(",") if slug.strip()]
        if not canonical or not alias_slugs:
            raise CommandError(f"Invalid group '{raw}'. Expected one canonical slug and aliases.")
        if canonical in alias_slugs:
            raise CommandError(f"Canonical slug also appears as alias in '{raw}'.")
        groups.append({"canonical": canonical, "aliases": alias_slugs})
    return groups


def merge_groups(*, groups: list[dict[str, list[str] | str]], apply: bool, backup: bool = True) -> dict:
    backup_info = None
    if apply and backup:
        backup_info = create_sqlite_backup()

    report = {
        "mode": "apply" if apply else "dry-run",
        "generated_at": timezone.now().isoformat(),
        "backup": backup_info,
        "groups": [],
        "totals": {
            "relations_moved": 0,
            "duplicate_relations_skipped": 0,
            "authors_merged": 0,
        },
    }

    with transaction.atomic():
        for group in groups:
            item = merge_group(
                canonical_slug=str(group["canonical"]),
                alias_slugs=list(group["aliases"]),
                apply=apply,
            )
            report["groups"].append(item)
            report["totals"]["relations_moved"] += item["relations_moved"]
            report["totals"]["duplicate_relations_skipped"] += item["duplicate_relations_skipped"]
            report["totals"]["authors_merged"] += item["authors_merged"]

        if not apply:
            transaction.set_rollback(True)

    return report


def merge_group(*, canonical_slug: str, alias_slugs: list[str], apply: bool) -> dict:
    canonical = get_author(canonical_slug)
    aliases = [get_author(slug) for slug in alias_slugs]

    item = {
        "canonical": author_record(canonical),
        "aliases": [author_record(author) for author in aliases],
        "relations_moved": 0,
        "duplicate_relations_skipped": 0,
        "authors_merged": 0,
        "moves": [],
        "skips": [],
    }

    for alias in aliases:
        for relation in BookAuthor.objects.filter(author=alias).select_related("book").order_by("book__title", "id"):
            duplicate = BookAuthor.objects.filter(
                book=relation.book,
                author=canonical,
                role=relation.role,
            ).first()
            if duplicate:
                item["duplicate_relations_skipped"] += 1
                item["skips"].append(
                    {
                        "book_slug": relation.book.slug,
                        "book_title": relation.book.title,
                        "alias": alias.slug,
                        "reason": "canonical_relation_exists",
                    }
                )
                if apply:
                    relation.delete()
                continue

            item["relations_moved"] += 1
            item["moves"].append(
                {
                    "book_slug": relation.book.slug,
                    "book_title": relation.book.title,
                    "from": alias.slug,
                    "to": canonical.slug,
                    "role": relation.role,
                }
            )
            if apply:
                relation.author = canonical
                relation.save(update_fields=["author", "updated_at"])

        item["authors_merged"] += 1
        if apply:
            alias.delete()

    return item


def get_author(slug: str) -> Author:
    try:
        return Author.objects.get(slug=slug)
    except Author.DoesNotExist as exc:
        raise CommandError(f"Active author slug not found: {slug}") from exc


def author_record(author: Author) -> dict:
    return {
        "id": str(author.id),
        "slug": author.slug,
        "full_name": author.full_name,
        "books_count": author.author_books.count(),
    }


def create_sqlite_backup() -> dict:
    db_settings = settings.DATABASES["default"]
    if db_settings["ENGINE"] != "django.db.backends.sqlite3":
        return {"skipped": True, "reason": "non_sqlite_database"}

    db_path = Path(db_settings["NAME"])
    if not db_path.exists():
        raise CommandError(f"SQLite database not found: {db_path}")

    backups_dir = Path(settings.BASE_DIR) / "backups"
    backups_dir.mkdir(parents=True, exist_ok=True)
    stamp = timezone.now().strftime("%Y%m%d_%H%M%S")
    backup_path = backups_dir / f"db_before_author_merge_{stamp}.sqlite3"
    shutil.copy2(db_path, backup_path)
    sha256 = file_sha256(backup_path)
    if not sha256:
        raise CommandError(f"Could not verify backup hash: {backup_path}")
    return {
        "path": str(backup_path),
        "sha256": sha256,
        "size_bytes": backup_path.stat().st_size,
    }


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()
