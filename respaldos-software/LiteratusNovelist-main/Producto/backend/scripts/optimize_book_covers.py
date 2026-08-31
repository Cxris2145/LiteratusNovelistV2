"""
Optimize catalog book covers to WEBP 600x900.

The script is intentionally conservative:
- default mode is dry-run;
- original image files are left in place;
- optimized images are written as cover_optimized.webp next to the source;
- Book.cover_image is updated only with --apply.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from PIL import Image, ImageOps


BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE_DIR))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django  # noqa: E402

django.setup()

from django.conf import settings  # noqa: E402
from django.db import transaction  # noqa: E402

from catalog.models import Book  # noqa: E402


TARGET_SIZE = (600, 900)
TARGET_NAME = "cover_optimized.webp"


def needs_optimization(path: Path) -> tuple[bool, str, tuple[int, int]]:
    with Image.open(path) as image:
        fmt = (image.format or "").upper()
        size = (image.width, image.height)
    return fmt != "WEBP" or size != TARGET_SIZE, fmt, size


def render_cover(source: Path, target: Path, quality: int) -> int:
    with Image.open(source) as image:
        image = ImageOps.exif_transpose(image)
        if image.mode not in ("RGB", "RGBA"):
            image = image.convert("RGBA")

        canvas = Image.new("RGB", TARGET_SIZE, (246, 242, 232))
        fitted = ImageOps.contain(image, TARGET_SIZE, method=Image.Resampling.LANCZOS)
        if fitted.mode == "RGBA":
            background = Image.new("RGBA", fitted.size, (246, 242, 232, 255))
            background.alpha_composite(fitted)
            fitted = background.convert("RGB")
        elif fitted.mode != "RGB":
            fitted = fitted.convert("RGB")

        offset = (
            (TARGET_SIZE[0] - fitted.width) // 2,
            (TARGET_SIZE[1] - fitted.height) // 2,
        )
        canvas.paste(fitted, offset)
        target.parent.mkdir(parents=True, exist_ok=True)
        canvas.save(target, "WEBP", quality=quality, method=6)

    return target.stat().st_size


def iter_books(limit: int | None = None):
    qs = (
        Book.objects.exclude(cover_image="")
        .exclude(cover_image__isnull=True)
        .only("id", "slug", "cover_image")
        .order_by("slug")
    )
    if limit is not None:
        qs = qs[:limit]
    return qs


def main() -> int:
    parser = argparse.ArgumentParser(description="Optimize Book.cover_image files to WEBP 600x900.")
    parser.add_argument("--apply", action="store_true", help="Write optimized files and update Book.cover_image.")
    parser.add_argument("--limit", type=int, default=None, help="Optional number of books to inspect.")
    parser.add_argument("--quality", type=int, default=82, help="WEBP quality, default: 82.")
    args = parser.parse_args()

    media_root = Path(settings.MEDIA_ROOT)
    inspected = 0
    optimized = 0
    skipped = 0
    missing = 0
    invalid = 0
    before_bytes = 0
    after_bytes = 0

    for book in iter_books(args.limit):
        inspected += 1
        rel_path = Path(str(book.cover_image.name))
        source = media_root / rel_path
        if not source.exists():
            missing += 1
            print(f"MISSING {book.slug} {rel_path}")
            continue

        try:
            should_optimize, fmt, size = needs_optimization(source)
        except Exception as exc:
            invalid += 1
            print(f"INVALID {book.slug} {rel_path} {exc}")
            continue

        if not should_optimize:
            skipped += 1
            continue

        before_bytes += source.stat().st_size
        target = source.with_name(TARGET_NAME)
        target_rel = rel_path.with_name(TARGET_NAME).as_posix()

        if args.apply:
            new_size = render_cover(source, target, args.quality)
            after_bytes += new_size
            with transaction.atomic():
                Book.objects.filter(pk=book.pk).update(cover_image=target_rel)
        optimized += 1
        print(f"{'OPTIMIZED' if args.apply else 'WOULD_OPTIMIZE'} {book.slug} {fmt} {size[0]}x{size[1]} -> {target_rel}")

    print(
        "SUMMARY "
        f"mode={'apply' if args.apply else 'dry-run'} "
        f"inspected={inspected} optimized={optimized} skipped={skipped} "
        f"missing={missing} invalid={invalid} "
        f"source_mb={before_bytes / 1024 / 1024:.2f} "
        f"optimized_mb={after_bytes / 1024 / 1024:.2f}"
    )
    return 1 if missing or invalid else 0


if __name__ == "__main__":
    raise SystemExit(main())
