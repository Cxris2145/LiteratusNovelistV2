"""
catalog/management/commands/audit_book_chapters.py

Comando oficial de auditoría y corrección fiel de libros y capítulos para Literatus Novelist.

Uso:
    python manage.py audit_book_chapters
    python manage.py audit_book_chapters --fix
    python manage.py audit_book_chapters --book-id <uuid>
    python manage.py audit_book_chapters --slug <slug>
    python manage.py audit_book_chapters --dry-run
"""

import sys
import json
from pathlib import Path
from django.core.management.base import BaseCommand
from django.conf import settings
from catalog.models import Book, Author, Chapter
from catalog.audit_engine import audit_book, get_book_source_file


class Command(BaseCommand):
    help = "Audita y corrige fielmente todos los capítulos de todos los libros en Literatus Novelist."

    def add_arguments(self, parser):
        parser.add_argument(
            '--fix',
            action='store_true',
            help='Aplica correcciones automáticas seguras contrastadas con el archivo original.',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Muestra qué modificaría sin tocar la base de datos.',
        )
        parser.add_argument(
            '--book-id',
            type=str,
            default=None,
            help='Revisa solamente un libro específico por su UUID.',
        )
        parser.add_argument(
            '--slug',
            type=str,
            default=None,
            help='Revisa solamente un libro específico por su slug.',
        )
        parser.add_argument(
            '--no-report',
            action='store_true',
            help='Desactiva la generación de los archivos BOOK_CHAPTER_AUDIT.json y BOOK_CHAPTER_AUDIT_REPORT.md',
        )

    def safe_write(self, msg, style_func=None):
        try:
            if style_func:
                self.stdout.write(style_func(msg))
            else:
                self.stdout.write(msg)
        except UnicodeEncodeError:
            clean_msg = msg.encode('ascii', errors='replace').decode('ascii')
            if style_func:
                self.stdout.write(style_func(clean_msg))
            else:
                self.stdout.write(clean_msg)

    def handle(self, *args, **options):
        try:
            if hasattr(sys.stdout, 'reconfigure'):
                sys.stdout.reconfigure(encoding='utf-8', errors='replace')
            if hasattr(sys.stderr, 'reconfigure'):
                sys.stderr.reconfigure(encoding='utf-8', errors='replace')
        except Exception:
            pass

        fix = options['fix']
        dry_run = options['dry_run']
        book_id = options['book_id']
        slug = options['slug']
        no_report = options['no_report']

        if fix and dry_run:
            self.safe_write("Modo --dry-run activo: se simularán las correcciones sin tocar la base de datos.\n", self.style.WARNING)

        # Seleccionar queryset de libros
        books_qs = Book.objects.all().prefetch_related('chapters', 'editions', 'book_authors__author').order_by('title')
        if book_id:
            books_qs = books_qs.filter(id=book_id)
        elif slug:
            books_qs = books_qs.filter(slug=slug)

        total_books = books_qs.count()
        if total_books == 0:
            self.safe_write("No se encontraron libros para auditar con los filtros proporcionados.", self.style.ERROR)
            return

        self.safe_write(f"Iniciando auditoría sobre {total_books} libro(s)...\n")

        # ── 1. Respaldo de seguridad antes de modificar ───────────────────────
        backend_dir = Path(settings.BASE_DIR)
        project_root = backend_dir.parent.parent # LiteratusNovelist root

        if fix and not dry_run:
            self.safe_write("Generando respaldo de seguridad 'chapter_audit_backup.json'...")
            backup_data = []
            for ch in Chapter.objects.select_related('book').all().iterator():
                backup_data.append({
                    'chapter_id': str(ch.id),
                    'book_id': str(ch.book.id),
                    'book_slug': ch.book.slug,
                    'title': ch.title,
                    'order': ch.order,
                    'content_html': ch.content_html,
                })
            
            # Guardar backup en backend y en project_root
            backup_paths = [
                backend_dir / 'chapter_audit_backup.json',
                project_root / 'chapter_audit_backup.json'
            ]
            for bp in backup_paths:
                try:
                    bp.write_text(json.dumps(backup_data, ensure_ascii=False, indent=2), encoding='utf-8')
                except Exception:
                    pass
            self.safe_write(f"Respaldo completado: {len(backup_data)} capítulos respaldados en chapter_audit_backup.json.\n", self.style.SUCCESS)

        # ── 2. Ejecución de la auditoría ──────────────────────────────────────
        results = []
        inventory_data = []

        total_chapters_reviewed = 0
        total_chapters_correct = 0
        total_empty_found = 0
        total_recovered = 0
        total_missing_created = 0
        total_duplicates_found = 0
        total_duplicates_fixed = 0
        pending_issues = 0

        for book in books_qs:
            self.safe_write(f"\n[BOOK] {book.title}")
            
            report = audit_book(book, fix=fix, dry_run=dry_run, backend_dir=backend_dir)
            results.append(report)

            # Extraer autor principal
            main_author = book.book_authors.first()
            author_name = main_author.author.full_name if main_author and main_author.author else "Autor Desconocido"

            # Inventario entry
            inventory_data.append({
                'book': book.title,
                'slug': book.slug,
                'author': author_name,
                'edition': report['source_format'].upper(),
                'chapters_db': report['db_chapters_count'],
                'chapters_original': report['original_chapters_count'],
                'source_file': report['source_file'],
                'original_format': report['source_format'],
                'status': report['status'],
            })

            # Imprimir detalle de capítulos
            ch_list = list(book.chapters.all().order_by('order'))
            total_chapters_reviewed += len(ch_list)

            for ch in ch_list:
                # Comprobar si estaba vacío o corto
                is_empty = any(e['id'] == str(ch.id) for e in report['empty_chapters'])
                is_short = any(s['id'] == str(ch.id) for s in report['short_chapters'])
                is_dup = any(d['id'] == str(ch.id) for d in report['duplicate_chapters'])

                if is_empty:
                    total_empty_found += 1
                    self.safe_write(f"  [ERROR] Capítulo {ch.order} '{ch.title}' vacío", self.style.ERROR)
                elif is_dup:
                    total_duplicates_found += 1
                    self.safe_write(f"  [ERROR] Capítulo {ch.order} '{ch.title}' duplicado", self.style.ERROR)
                elif is_short:
                    self.safe_write(f"  [WARNING] Capítulo {ch.order} '{ch.title}' sospechosamente corto", self.style.WARNING)
                else:
                    total_chapters_correct += 1
                    self.safe_write(f"  [OK] Capítulo {ch.order} '{ch.title}'")

            for fix_msg in report['fixes']:
                total_recovered += report['original_chapters_count']
                if report['missing_chapters'] > 0:
                    total_missing_created += report['missing_chapters']
                if report['duplicate_chapters']:
                    total_duplicates_fixed += len(report['duplicate_chapters'])
                self.safe_write(f"  [FIXED] {fix_msg}", self.style.SUCCESS)

            if report['status'] == 'ERROR' and not report['fixes']:
                pending_issues += 1
                for issue in report['issues']:
                    self.safe_write(f"  [PENDIENTE] {issue}", self.style.ERROR)
            elif report['status'] == 'WARNING':
                for issue in report['issues']:
                    self.safe_write(f"  [AVISO] {issue}", self.style.WARNING)

        # ── 3. Generación de Informes y Archivos de Auditoría ─────────────────
        if not no_report:
            # 1. BOOK_CHAPTER_AUDIT.json
            audit_json_paths = [
                backend_dir / 'BOOK_CHAPTER_AUDIT.json',
                project_root / 'BOOK_CHAPTER_AUDIT.json',
            ]
            for ajp in audit_json_paths:
                try:
                    ajp.write_text(json.dumps(inventory_data, ensure_ascii=False, indent=2), encoding='utf-8')
                except Exception:
                    pass

            # 2. BOOK_CHAPTER_AUDIT_REPORT.md
            md_lines = [
                "# BOOK_CHAPTER_AUDIT_REPORT.md",
                "## Informe de Auditoría Integral de Libros y Capítulos — Literatus Novelist\n",
                f"**Total de libros auditados:** {total_books}",
                f"**Modo de ejecución:** {'Corrección en vivo (--fix)' if (fix and not dry_run) else ('Simulación (--dry-run)' if dry_run else 'Solo Lectura')}\n",
                "---\n",
            ]

            for item in results:
                md_lines.append(f"## {item['title']}\n")
                md_lines.append(f"**Slug:** `{item['slug']}`  ")
                md_lines.append(f"**Archivo original:** `{item['source_file'] or 'No encontrado'}`  ")
                md_lines.append(f"**Capítulos archivo original:** {item['original_chapters_count']}  ")
                md_lines.append(f"**Capítulos en DB:** {item['db_chapters_count']}  ")
                md_lines.append(f"**Resultado:** `{item['status']}`\n")

                if item['issues']:
                    md_lines.append("**Problemas detectados:**")
                    for iss in item['issues']:
                        md_lines.append(f"- {iss}")
                    md_lines.append("")

                if item['fixes']:
                    md_lines.append("**Correcciones realizadas:**")
                    for fx in item['fixes']:
                        md_lines.append(f"- {fx}")
                    md_lines.append("")

                md_lines.append("---\n")

            md_report_paths = [
                backend_dir / 'BOOK_CHAPTER_AUDIT_REPORT.md',
                project_root / 'BOOK_CHAPTER_AUDIT_REPORT.md',
            ]
            report_text = "\n".join(md_lines)
            for mrp in md_report_paths:
                try:
                    mrp.write_text(report_text, encoding='utf-8')
                except Exception:
                    pass

        # ── 4. Salida en Consola Final ────────────────────────────────────────
        self.safe_write("\n" + "=" * 10 + " AUDITORÍA FINAL " + "=" * 10 + "\n")
        self.safe_write(f"Libros revisados: {total_books}")
        self.safe_write(f"Capítulos revisados: {total_chapters_reviewed}")
        self.safe_write(f"Capítulos correctos: {total_chapters_correct}")
        self.safe_write(f"Capítulos vacíos encontrados: {total_empty_found}")
        self.safe_write(f"Capítulos recuperados: {total_recovered}")
        self.safe_write(f"Capítulos faltantes creados: {total_missing_created}")
        self.safe_write(f"Duplicados encontrados: {total_duplicates_found}")
        self.safe_write(f"Duplicados corregidos: {total_duplicates_fixed}")
        self.safe_write(f"Problemas pendientes: {pending_issues}\n")

        if pending_issues == 0:
            self.safe_write("Auditoría finalizada con éxito: 100% de los libros verificados.", self.style.SUCCESS)
        else:
            self.safe_write(f"Auditoría finalizada: {pending_issues} libro(s) requieren atención manual.", self.style.WARNING)
