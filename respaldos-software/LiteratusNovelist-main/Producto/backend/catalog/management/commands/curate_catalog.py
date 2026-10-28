"""
catalog/management/commands/curate_catalog.py

Deja el catálogo en la selección de `catalog/data/catalogo_200.json`: N libros por
categoría, una sola categoría por libro, y borra DE VERDAD todo lo demás (libros con
sus capítulos, ediciones, personajes y datos de lectura; autores sin obras; categorías
vacías), además de sus archivos en Supabase Storage.

Por defecto NO cambia nada: imprime el informe (dry-run). Con --apply guarda un
respaldo liviano (sin el texto de los capítulos, que vive en los EPUB), hace todo en
una transacción y, tras el commit, borra los archivos del bucket.

    python manage.py curate_catalog                    # solo informe
    python manage.py curate_catalog --apply            # aplica
    python manage.py curate_catalog --apply --skip-storage --no-backup

Volver a correrlo con la misma selección no cambia nada.
"""

import json
import os
from collections import Counter
from datetime import date
from pathlib import Path

import requests
from django.conf import settings
from django.core import serializers
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from ai_engine.models import AIAvatar, ChatSession
from catalog.models import Author, Book, BookAuthor, Chapter, ChapterAudio, Edition, Genre
from core.storage import SUPABASE_BUCKET
from users.models import Profile

SELECTION = Path(__file__).resolve().parents[2] / 'data' / 'catalogo_200.json'
AVATAR_IMAGES = ('avatar_image', 'image_speaking_1', 'image_speaking_2', 'image_speaking_3', 'image_thinking')
DELETE_BOOKS_BATCH = 20
STORAGE_BATCH = 500


def _paths(values):
    """Rutas del bucket a partir de valores de FileField (descarta vacíos y URLs externas)."""
    out = set()
    for value in values:
        value = str(value or '').strip().lstrip('/')
        if value and not value.startswith(('http://', 'https://')):
            out.add(value)
    return out


def _book_files(book_ids):
    """Archivos que cuelgan de esos libros: portada, PDF, ediciones, personajes y audios."""
    files = set()
    for cover, pdf in Book.all_objects.filter(id__in=book_ids).values_list('cover_image', 'pdf_file'):
        files |= _paths([cover, pdf])
    files |= _paths(Edition.all_objects.filter(book_id__in=book_ids).values_list('file', flat=True))
    for row in AIAvatar.all_objects.filter(edition__book_id__in=book_ids).values_list(*AVATAR_IMAGES):
        files |= _paths(row)
    for row in ChapterAudio.all_objects.filter(chapter__book_id__in=book_ids).values_list('audio_file', 'sync_file'):
        files |= _paths(row)
    return files


class Command(BaseCommand):
    help = "Deja el catálogo en la selección curada (catalogo_200.json). Dry-run por defecto; --apply para aplicar."

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Aplica los cambios. Sin esto solo informa.')
        parser.add_argument('--selection', default=str(SELECTION), help='JSON con la selección.')
        parser.add_argument('--skip-storage', action='store_true', help='No borra archivos de Supabase Storage.')
        parser.add_argument('--no-backup', action='store_true', help='No guarda el respaldo liviano.')
        parser.add_argument('--backup-dir', default=None,
                            help='Carpeta del respaldo (por defecto respaldos-software/respaldo-catalogo-<fecha>).')

    # ── Plan ────────────────────────────────────────────────────────────────

    def _load(self, path):
        try:
            data = json.loads(Path(path).read_text(encoding='utf-8'))
        except (OSError, ValueError) as exc:
            raise CommandError(f'No se pudo leer la selección {path}: {exc}')
        books, categories = data['books'], data['categories']
        per_category = data.get('per_category')
        counts = Counter(books.values())
        if set(counts) != set(categories):
            raise CommandError(f'Categorías de la selección no cuadran: {sorted(set(counts) ^ set(categories))}')
        if per_category and any(n != per_category for n in counts.values()):
            raise CommandError(f'Se esperaban {per_category} libros por categoría: {dict(counts)}')
        return data

    def _plan(self, data):
        books = data['books']
        merges = data.get('author_merges', {})
        fixes = data.get('book_author_fixes', {})

        kept = {b.slug: b for b in Book.all_objects.filter(slug__in=books)}
        missing = sorted(set(books) - set(kept))
        if missing:
            raise CommandError(f'No existen en la base: {missing}')
        soft_deleted = sorted(s for s, b in kept.items() if b.deleted_at)
        if soft_deleted:
            raise CommandError(f'Están borrados de forma suave y no pueden quedar: {soft_deleted}')
        self._check_references(set(books))

        kept_ids = [b.id for b in kept.values()]
        drop_ids = list(Book.all_objects.exclude(id__in=kept_ids).values_list('id', flat=True))

        # Autores que quedan, ya aplicadas las fusiones y las correcciones de autoría.
        kept_authors = set()
        for book_slug, author_slug in BookAuthor.objects.filter(book_id__in=kept_ids).values_list(
                'book__slug', 'author__slug'):
            fix = fixes.get(book_slug)
            if fix and author_slug == fix['from']:
                author_slug = fix['to']
            kept_authors.add(merges.get(author_slug, author_slug))
        for fix in fixes.values():
            if not Author.all_objects.filter(slug=fix['to']).exists():
                raise CommandError(f"No existe el autor {fix['to']}")
        for canonical in set(merges.values()):
            if not Author.all_objects.filter(slug=canonical).exists():
                raise CommandError(f'No existe el autor canónico {canonical}')
        drop_authors = Author.all_objects.exclude(slug__in=kept_authors)

        categories = data['categories']
        absent = sorted(set(categories) - set(Genre.all_objects.filter(slug__in=categories).values_list('slug', flat=True)))
        if absent:
            raise CommandError(f'Faltan categorías en la base: {absent}')
        drop_genres = Genre.all_objects.exclude(slug__in=categories)

        return {
            'kept': kept, 'kept_ids': kept_ids, 'drop_ids': drop_ids,
            'drop_authors': drop_authors, 'drop_genres': drop_genres,
            # Archivos que el frontend usa por su ruta aunque su categoría desaparezca.
            'keep_files': set(data.get('keep_files', [])),
        }

    def _check_references(self, keep_slugs):
        """Lo que el código nombra a mano (portada, La Senda) tiene que quedar."""
        from catalog.home import CAST, STARTER_SLUGS
        from learning.ai_generator import SAFE_CLASSIC_SLUGS
        named = set(STARTER_SLUGS) | {slug for _, slug, _ in CAST} | set(SAFE_CLASSIC_SLUGS)
        lost = sorted(named - keep_slugs)
        if lost:
            raise CommandError(f'La selección deja fuera libros que el código usa a mano: {lost}')

    # ── Informe ─────────────────────────────────────────────────────────────

    def _report(self, data, plan):
        w = self.stdout.write
        drop_ids = plan['drop_ids']
        w(self.style.MIGRATE_HEADING('Selección'))
        for slug, name in data['categories'].items():
            n = sum(1 for c in data['books'].values() if c == slug)
            w(f'  {name:<28} {n}')
        w(f"  Libros que quedan: {len(plan['kept'])}")

        w(self.style.MIGRATE_HEADING('Libros que salen'))
        w(f'  Libros: {len(drop_ids)} '
          f'(ya borrados de forma suave: {Book.all_objects.filter(id__in=drop_ids, deleted_at__isnull=False).count()})')
        w(f'  Capítulos: {Chapter.all_objects.filter(book_id__in=drop_ids).count()}')
        w(f'  Ediciones: {Edition.all_objects.filter(book_id__in=drop_ids).count()}')
        avatars = AIAvatar.all_objects.filter(edition__book_id__in=drop_ids)
        w(f'  Personajes de IA: {avatars.count()} '
          f'(quedan {AIAvatar.all_objects.filter(edition__book_id__in=plan["kept_ids"]).count()})')
        w(f'  Chats con esos personajes: {ChatSession.all_objects.filter(avatar__in=avatars).count()}')
        try:
            from community.models import ReadingClub
            from library.models import ReadingSession, UserFavorite, UserInventory
            w(f'  Libros comprados por usuarios: '
              f'{UserInventory.all_objects.filter(edition__book_id__in=drop_ids).count()}')
            w(f'  Sesiones de lectura: {ReadingSession.all_objects.filter(book_id__in=drop_ids).count()}')
            w(f'  Favoritos: {UserFavorite.all_objects.filter(book_id__in=drop_ids).count()}')
            w(f'  Círculos de lectura: {ReadingClub.all_objects.filter(book_id__in=drop_ids).count()}')
        except ImportError:  # pragma: no cover
            pass
        w(f'  Audios: {ChapterAudio.all_objects.filter(chapter__book_id__in=drop_ids).count()}')

        w(self.style.MIGRATE_HEADING('Autores'))
        for dup, canonical in data.get('author_merges', {}).items():
            if Author.all_objects.filter(slug=dup).exists():
                w(f'  Fusionar {dup} → {canonical}')
        for book_slug, fix in data.get('book_author_fixes', {}).items():
            w(f"  Autoría de {book_slug}: {fix['from']} → {fix['to']}")
        for slug, fields in data.get('author_updates', {}).items():
            w(f"  Actualizar {slug}: {fields.get('full_name', '')}")
        names = sorted(plan['drop_authors'].values_list('full_name', flat=True))
        w(f'  Autores que se borran: {len(names)}')
        w('    ' + '; '.join(names))

        w(self.style.MIGRATE_HEADING('Categorías'))
        for slug, name in data['categories'].items():
            current = Genre.all_objects.get(slug=slug).name
            if current != name:
                w(f'  Renombrar {slug}: «{current}» → «{name}»')
        w('  Se borran: ' + ', '.join(sorted(plan['drop_genres'].values_list('slug', flat=True))))

        files = self._storage_paths(plan)
        prefixes = Counter(p.split('/')[0] if '/' in p else p for p in files)
        w(self.style.MIGRATE_HEADING('Archivos en Supabase Storage'))
        w(f'  A borrar: {len(files)} ' + ', '.join(f'{k}: {v}' for k, v in prefixes.most_common()))
        for slug, age in data.get('min_age', {}).items():
            w(f'  Edad mínima de {slug} → {age}')

    # ── Archivos ────────────────────────────────────────────────────────────

    def _kept_files(self, plan):
        files = _book_files(plan['kept_ids'])
        files |= _paths(Author.all_objects.exclude(id__in=plan['drop_authors'].values('id'))
                        .values_list('photo', flat=True))
        files |= _paths(Genre.all_objects.exclude(id__in=plan['drop_genres'].values('id'))
                        .values_list('cover_image', flat=True))
        return files | plan['keep_files']

    def _storage_paths(self, plan):
        dropped = _book_files(plan['drop_ids'])
        dropped |= _paths(plan['drop_authors'].values_list('photo', flat=True))
        dropped |= _paths(plan['drop_genres'].values_list('cover_image', flat=True))
        return dropped - self._kept_files(plan)

    def _delete_from_storage(self, paths):
        url = getattr(settings, 'SUPABASE_URL', None) or os.getenv('SUPABASE_URL')
        key = os.getenv('SUPABASE_SERVICE_KEY') or os.getenv('SUPABASE_KEY')
        if not url or not key:
            self.stdout.write(self.style.WARNING('Sin SUPABASE_URL/SUPABASE_SERVICE_KEY: no se borraron archivos.'))
            return 0, sorted(paths)
        endpoint = f'{url}/storage/v1/object/{SUPABASE_BUCKET}'
        headers = {'apikey': key, 'Authorization': f'Bearer {key}'}
        deleted, failed = 0, []
        batch_list = sorted(paths)
        for start in range(0, len(batch_list), STORAGE_BATCH):
            batch = batch_list[start:start + STORAGE_BATCH]
            try:
                response = requests.delete(endpoint, headers=headers, json={'prefixes': batch}, timeout=120)
            except requests.RequestException as exc:
                self.stdout.write(self.style.WARNING(f'  Error de red en Storage: {exc}'))
                failed.extend(batch)
                continue
            if response.status_code == 200:
                deleted += len(response.json())
            else:
                self.stdout.write(self.style.WARNING(f'  Storage respondió {response.status_code}: {response.text[:200]}'))
                failed.extend(batch)
        return deleted, failed

    # ── Aplicar ─────────────────────────────────────────────────────────────

    def _backup(self, plan, folder):
        folder.mkdir(parents=True, exist_ok=True)
        drop_ids = plan['drop_ids']
        sets = {
            'books': Book.all_objects.filter(id__in=drop_ids),
            'book_authors': BookAuthor.all_objects.filter(book_id__in=drop_ids),
            'editions': Edition.all_objects.filter(book_id__in=drop_ids),
            'avatars': AIAvatar.all_objects.filter(edition__book_id__in=drop_ids),
            'authors': plan['drop_authors'],
            'genres': plan['drop_genres'],
        }
        try:
            from library.models import ReadingSession, UserInventory
            sets['inventory'] = UserInventory.all_objects.filter(edition__book_id__in=drop_ids)
            sets['reading_sessions'] = ReadingSession.all_objects.filter(book_id__in=drop_ids)
        except ImportError:  # pragma: no cover
            pass
        for name, qs in sets.items():
            (folder / f'{name}.json').write_text(serializers.serialize('json', qs, indent=1), encoding='utf-8')
        self.stdout.write(f'Respaldo liviano en {folder}')

    def _fix_authorship(self, data):
        for book_slug, fix in data.get('book_author_fixes', {}).items():
            book = Book.all_objects.filter(slug=book_slug).first()
            old = Author.all_objects.filter(slug=fix['from']).first()
            new = Author.all_objects.get(slug=fix['to'])
            if not book or not old or not BookAuthor.objects.filter(book=book, author=old).exists():
                continue
            BookAuthor.objects.filter(book=book, author=old).update(author=new)
            # El personaje "autor" de la obra pasa a ser el del autor correcto: se reutiliza
            # uno que ya tenga (con retrato y prompt) y se quita el del autor equivocado.
            edition = book.editions.first()
            donor = (AIAvatar.objects.filter(is_author=True, name=new.full_name,
                                             edition__book__book_authors__author=new)
                     .exclude(edition__book=book).exclude(avatar_image='').first())
            if edition and donor:
                AIAvatar.all_objects.filter(edition=edition, is_author=True).delete()
                donor.edition = edition
                donor.save(update_fields=['edition', 'updated_at'])

    def _merge_authors(self, data):
        for dup_slug, canonical_slug in data.get('author_merges', {}).items():
            dup = Author.all_objects.filter(slug=dup_slug).first()
            if not dup:
                continue
            canonical = Author.all_objects.get(slug=canonical_slug)
            for link in BookAuthor.all_objects.filter(author=dup):
                if BookAuthor.all_objects.filter(book_id=link.book_id, author=canonical).exists():
                    link.delete()
                else:
                    BookAuthor.all_objects.filter(pk=link.pk).update(author=canonical)
                AIAvatar.all_objects.filter(edition__book_id=link.book_id, is_author=True,
                                            name=dup.full_name).update(name=canonical.full_name)
            for profile in Profile.objects.filter(followed_authors=dup):
                profile.followed_authors.add(canonical)

    def _update_authors(self, data):
        for slug, fields in data.get('author_updates', {}).items():
            author = Author.all_objects.filter(slug=slug).first()
            if not author:
                continue
            old_name = author.full_name
            for field, value in fields.items():
                setattr(author, field, value)
            author.save()
            if 'full_name' in fields and old_name != author.full_name:
                AIAvatar.all_objects.filter(is_author=True, name=old_name,
                                            edition__book__book_authors__author=author).update(name=author.full_name)

    def _set_categories(self, data, plan):
        genres = {g.slug: g for g in Genre.all_objects.filter(slug__in=data['categories'])}
        for slug, name in data['categories'].items():
            if genres[slug].name != name:
                genres[slug].name = name
                genres[slug].save(update_fields=['name', 'updated_at'])
        for slug, category in data['books'].items():
            book = plan['kept'][slug]
            if set(book.genres.values_list('slug', flat=True)) != {category}:
                book.genres.set([genres[category]])

    def _apply(self, data, plan):
        w = self.stdout.write
        with transaction.atomic():
            self._fix_authorship(data)
            self._merge_authors(data)
            self._update_authors(data)
            for slug, age in data.get('min_age', {}).items():
                Book.all_objects.filter(slug=slug).update(min_age=age)
            self._set_categories(data, plan)

            # Las rutas se calculan antes de borrar (después ya no hay de dónde sacarlas).
            plan = self._plan(data)
            storage_paths = self._storage_paths(plan)

            drop_ids = plan['drop_ids']
            for start in range(0, len(drop_ids), DELETE_BOOKS_BATCH):
                Book.all_objects.filter(id__in=drop_ids[start:start + DELETE_BOOKS_BATCH]).delete()
            authors_deleted, _ = plan['drop_authors'].delete()
            genres_deleted, _ = plan['drop_genres'].delete()
            # Lo que siga referenciado por lo que queda no se toca en el bucket.
            storage_paths -= self._kept_files(self._plan(data))
        w(self.style.SUCCESS(f'Base lista: {len(drop_ids)} libros, autores y categorías borrados.'))

        for book in Book.objects.filter(slug__in=data['books']):
            book.recount_words()
        return storage_paths

    def handle(self, *args, **opts):
        data = self._load(opts['selection'])
        plan = self._plan(data)
        self._report(data, plan)
        if not opts['apply']:
            self.stdout.write(self.style.WARNING('\nDry-run: no se cambió nada. Usa --apply para aplicar.'))
            return

        if not opts['no_backup']:
            folder = Path(opts['backup_dir']) if opts['backup_dir'] else (
                Path(settings.BASE_DIR).parents[2] / f'respaldo-catalogo-{date.today().isoformat()}')
            self._backup(plan, folder)

        storage_paths = self._apply(data, plan)
        if opts['skip_storage'] or not storage_paths:
            self.stdout.write(f'Storage: {len(storage_paths)} archivos sin borrar (--skip-storage o nada que borrar).')
            return
        deleted, failed = self._delete_from_storage(storage_paths)
        self.stdout.write(self.style.SUCCESS(f'Storage: {deleted} archivos borrados de {len(storage_paths)} rutas.'))
        if failed:
            self.stdout.write(self.style.WARNING(f'Storage: {len(failed)} rutas fallaron, por ejemplo {failed[:5]}'))
