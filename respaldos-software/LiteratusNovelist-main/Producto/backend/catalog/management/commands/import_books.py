"""
catalog/management/commands/import_books.py

Comando oficial de importación de libros con validación y auditoría automática integrada.

Flujo:
Libro encontrado
    ↓
Libro importado
    ↓
Capítulos creados
    ↓
Validación automática (audit_engine)
    ↓
Si todo está correcto: Libro publicado (status='published', is_published=True)
Si existen errores: Libro marcado para revisión (status='draft', is_published=False)
"""

import os
import json
import shutil
from pathlib import Path
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.conf import settings
from django.db import transaction

from catalog.models import Book, Author, BookAuthor, Edition, Chapter
from catalog.audit_engine import (
    extract_chapters_from_epub,
    extract_chapters_from_txt,
    get_book_source_file,
    audit_book,
    clean_chapter_title,
)


class Command(BaseCommand):
    help = "Importa libros desde los archivos fuente y valida automáticamente la integridad de sus capítulos."

    def add_arguments(self, parser):
        parser.add_argument(
            '--slug',
            type=str,
            default=None,
            help='Importa un libro específico por su slug de carpeta.',
        )
        parser.add_argument(
            '--slugs-file',
            type=str,
            default=None,
            help='Ruta a un archivo .txt con lista de slugs a importar.',
        )
        parser.add_argument(
            '--all',
            action='store_true',
            help='Importa todos los libros pendientes desde respaldos-software/books/.',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Simula la importación sin modificar la base de datos ni copiar archivos.',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Fuerza la reimportación y re-extracción de capítulos incluso si el libro ya existe.',
        )
        parser.add_argument(
            '--no-standardize',
            action='store_true',
            help='Omite la generación automática de portada/sinopsis (STANDARDIZE_ON_IMPORT).',
        )

    def handle(self, *args, **options):
        slug = options['slug']
        slugs_file = options['slugs_file']
        import_all = options['all']
        dry_run = options['dry_run']
        force = options['force']
        no_standardize = options['no_standardize']

        backend_dir = Path(settings.BASE_DIR)
        project_root = backend_dir.parent.parent
        src_books_dir = project_root / 'respaldos-software' / 'books'
        media_books_dir = backend_dir / 'media' / 'books'

        slugs_to_process = []
        if slug:
            slugs_to_process.append(slug)
        elif slugs_file:
            path = Path(slugs_file)
            if not path.exists():
                path = backend_dir / slugs_file
            if path.exists():
                slugs_to_process = [line.strip() for line in path.read_text(encoding='utf-8').splitlines() if line.strip()]
            else:
                self.stdout.write(self.style.ERROR(f"Archivo de slugs no encontrado: {slugs_file}"))
                return
        elif import_all:
            if src_books_dir.exists():
                slugs_to_process = [d.name for d in src_books_dir.iterdir() if d.is_dir() and list(d.glob('*.epub'))]

        if not slugs_to_process:
            self.stdout.write(self.style.WARNING("No se especificaron slugs para importar. Use --slug, --slugs-file o --all."))
            return

        self.stdout.write(f"Procesando {len(slugs_to_process)} libro(s)...")

        imported_count = 0
        published_count = 0
        review_count = 0

        for book_slug in slugs_to_process:
            self.stdout.write(f"\n[IMPORT] {book_slug}")

            src_folder = src_books_dir / book_slug
            epub_files = list(src_folder.glob('*.epub')) if src_folder.exists() else []

            if not epub_files:
                # Probar si ya está en media
                m_folder = media_books_dir / book_slug
                epub_files = list(m_folder.glob('*.epub')) if m_folder.exists() else []

            if not epub_files:
                self.stdout.write(self.style.ERROR(f"  No se encontró archivo EPUB para {book_slug}."))
                continue

            epub_src_path = epub_files[0]

            if dry_run:
                self.stdout.write(f"  [DRY-RUN] Archivo detectado: {epub_src_path.name}")
                continue

            # 1. Copiar a media si no está
            dest_folder = media_books_dir / book_slug
            dest_folder.mkdir(parents=True, exist_ok=True)
            dest_epub = dest_folder / epub_src_path.name
            if not dest_epub.exists() and epub_src_path != dest_epub:
                shutil.copy2(epub_src_path, dest_epub)

            # 2. Extraer capítulos
            extracted_chaps = extract_chapters_from_epub(dest_epub, book_slug)

            # 3. Transacción atómica de importación
            book_obj = None
            try:
                with transaction.atomic():
                    # Nombre y autor por defecto derivados del slug o metadatos
                    raw_title = book_slug.replace('-', ' ').title()
                    
                    book_obj, created = Book.objects.get_or_create(
                        slug=book_slug,
                        defaults={
                            'title': raw_title[:255],
                            'status': Book.StatusChoices.DRAFT,
                            'is_published': False,
                        }
                    )

                    if created or force:
                        book_obj.chapters.all().delete()
                        for chap_data in extracted_chaps:
                            Chapter.objects.create(
                                book=book_obj,
                                order=chap_data['order'],
                                title=chap_data['title'],
                                content_html=chap_data['content_html'],
                            )

                        Edition.objects.get_or_create(
                            book=book_obj,
                            format='epub',
                            defaults={
                                'file': f"books/{book_slug}/{dest_epub.name}",
                                'price': Decimal('0.00'),
                                'language': 'es',
                            }
                        )

                    # 4. VALIDACIÓN AUTOMÁTICA
                    audit_res = audit_book(book_obj, fix=False, dry_run=False, backend_dir=backend_dir)

                    if audit_res['status'] in ['OK', 'FIXED'] and len(extracted_chaps) > 0 and not audit_res['empty_chapters']:
                        book_obj.status = Book.StatusChoices.PUBLISHED
                        book_obj.is_published = True
                        book_obj.save(update_fields=['status', 'is_published'])
                        published_count += 1
                        self.stdout.write(self.style.SUCCESS(f"  [OK] Libro validado y publicado con {len(extracted_chaps)} capítulos."))
                    else:
                        book_obj.status = Book.StatusChoices.DRAFT
                        book_obj.is_published = False
                        book_obj.save(update_fields=['status', 'is_published'])
                        review_count += 1
                        self.stdout.write(self.style.WARNING(f"  [REVISIÓN] Libro marcado para revisión manual debido a inconsistencias:"))
                        for iss in audit_res['issues']:
                            self.stdout.write(self.style.WARNING(f"    - {iss}"))

                    imported_count += 1

            except Exception as e:
                self.stdout.write(self.style.ERROR(f"  [ERROR] Fallo al importar {book_slug}: {str(e)}"))
                continue

            # 5. ESTANDARIZACIÓN AUTOMÁTICA (portada + sinopsis) — post-commit, no crítica
            if (not dry_run and book_obj is not None and not no_standardize
                    and getattr(settings, 'STANDARDIZE_ON_IMPORT', True)):
                try:
                    from catalog.standardization import standardize_book
                    book_obj.refresh_from_db()
                    std = standardize_book(book_obj, do_cover=True, do_synopsis=True,
                                           regenerate=False, dry_run=False)
                    self.stdout.write(
                        f"  [STD] sinopsis={std.synopsis_status} portada={std.cover_status} "
                        f"revisión={'SI' if std.needs_review else 'no'}")
                    if std.needs_review:
                        for m in std.messages:
                            self.stdout.write(self.style.WARNING(f"    - {m}"))
                except Exception as e:
                    self.stdout.write(self.style.WARNING(
                        f"  [STD] Estandarización no crítica falló para {book_slug}: {e}"))

        self.stdout.write("\n" + "=" * 10 + " RESUMEN DE IMPORTACIÓN " + "=" * 10)
        self.stdout.write(f"Libros procesados: {imported_count}")
        self.stdout.write(f"Libros validados y publicados: {published_count}")
        self.stdout.write(f"Libros en revisión: {review_count}\n")
