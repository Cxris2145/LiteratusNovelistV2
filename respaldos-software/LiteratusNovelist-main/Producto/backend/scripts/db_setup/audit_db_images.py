import argparse
import hashlib
import os
import sys
from collections import defaultdict
from pathlib import Path

IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.gif'}

# Carpeta con las imagenes extraidas de los EPUBs locales (respaldos-software/books/<slug>/images/*).
# Es independiente de la BD real: solo lee archivos ya presentes en el repo.
DEFAULT_BOOKS_IMAGES_ROOT = Path(__file__).resolve().parents[5] / 'books'


def _sha256_of_file(path, block_size=1 << 20):
    digest = hashlib.sha256()
    with open(path, 'rb') as fh:
        while True:
            chunk = fh.read(block_size)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def audit_local_book_images(books_root=DEFAULT_BOOKS_IMAGES_ROOT):
    """Hashea (SHA-256) todas las imagenes bajo <books_root>/<slug>/images/ y
    agrupa por contenido. No requiere Django ni BD: solo lee el arbol de
    archivos local, por lo que es 100% determinista y probable de forma
    aislada. Devuelve (hash -> lista de (slug, ruta_relativa)), y el listado
    de rutas que no se pudieron leer (permiso/roto)."""
    groups = defaultdict(list)
    unreadable = []

    if not books_root.is_dir():
        return groups, unreadable

    for book_dir in sorted(books_root.iterdir()):
        images_dir = book_dir / 'images'
        if not images_dir.is_dir():
            continue
        for image_path in sorted(images_dir.iterdir()):
            if not image_path.is_file():
                continue
            if image_path.suffix.lower() not in IMAGE_EXTENSIONS:
                continue
            try:
                file_hash = _sha256_of_file(image_path)
            except OSError as exc:
                unreadable.append((str(image_path), str(exc)))
                continue
            groups[file_hash].append((book_dir.name, str(image_path.relative_to(books_root))))

    return groups, unreadable


def print_local_duplicate_report(books_root=DEFAULT_BOOKS_IMAGES_ROOT):
    groups, unreadable = audit_local_book_images(books_root)

    total_files = sum(len(rows) for rows in groups.values())
    cross_book_dupes = {
        h: rows for h, rows in groups.items()
        if len({slug for slug, _ in rows}) > 1
    }

    print("--- DUPLICADOS DE IMAGENES LOCALES (respaldos-software/books/*/images/) ---")
    print(f"Archivos de imagen escaneados: {total_files}")
    print(f"Grupos de contenido identico entre >1 libro distinto: {len(cross_book_dupes)}")
    if unreadable:
        print(f"Archivos no legibles (omitidos): {len(unreadable)}")

    if cross_book_dupes:
        print("\nhash_sha256 (12) | n_filas | libros afectados | archivo de ejemplo")
        for file_hash, rows in sorted(cross_book_dupes.items(), key=lambda kv: -len(kv[1])):
            slugs = sorted({slug for slug, _ in rows})
            example_path = rows[0][1]
            print(f"{file_hash[:12]} | {len(rows)} | {', '.join(slugs)} | {example_path}")

    return cross_book_dupes


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        '--local-only', action='store_true',
        help='Solo hashea/agrupa imagenes locales de respaldos-software/books/. '
             'No requiere Django ni BD (usar cuando no hay BD real disponible).',
    )
    args = parser.parse_args()

    if args.local_only:
        print_local_duplicate_report()
        return

    import django

    # Fix python path to allow importing django config correctly
    sys.path.append(str(Path(__file__).resolve().parent.parent.parent))
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
    django.setup()

    from catalog.models import Book, Author
    from ai_engine.models import AIAvatar

    print("--- ANALIZANDO IMAGENES EN BASE DE DATOS LOCAL ---")

    # Check Book covers
    books_with_covers = Book.objects.exclude(cover_image='')
    print(f"Libros con portada registrada en la BD: {books_with_covers.count()}")
    for book in books_with_covers[:5]:
        print(f" - Book: {book.title} | Cover: {book.cover_image}")

    # Check Author photos
    authors_with_photos = Author.objects.exclude(photo='')
    print(f"Autores con foto registrada en la BD: {authors_with_photos.count()}")
    for author in authors_with_photos[:5]:
        print(f" - Author: {author.full_name} | Photo: {author.photo}")

    # Check AI Avatars images and videos
    avatars = AIAvatar.objects.all()
    print(f"Avatares de IA en la BD: {avatars.count()}")
    for avatar in avatars:
        print(f" - Avatar: {avatar.name} | Image: {avatar.avatar_image} | Video: {avatar.video_avatar}")

    print()
    print_local_duplicate_report()


if __name__ == "__main__":
    main()
