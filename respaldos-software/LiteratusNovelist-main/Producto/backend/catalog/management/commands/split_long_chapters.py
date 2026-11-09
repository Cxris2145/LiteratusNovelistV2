"""
Vuelve a dividir en sus capítulos reales los libros con capítulos gigantes (ver catalog/rechapter.py).

Por defecto solo SIMULA: lee, planifica e informa, dentro de una transacción de solo lectura que se
descarta al final (en Postgres cualquier escritura fallaría). Para escribir hay que pasar --apply.

  manage.py split_long_chapters                         # informe de todos los libros con capítulos > 80 KB
  manage.py split_long_chapters --book los-tres-mosqueteros --show 20
  manage.py split_long_chapters --report informe.json   # el informe completo en JSON
  manage.py split_long_chapters --book huck --apply     # aplica (un libro = una transacción)

--apply omite los libros con advertencias (capítulos muy cortos, alguno que sigue gigante) salvo que
también se pase --include-flagged.
"""
import json
import time

from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction
from django.db.models import Max
from django.db.models.functions import Length

from catalog.models import Book
from catalog.rechapter import DEFAULT_MIN_CHARS, plan_book
from catalog.rechapter_db import apply_plan, reference_counts


class Command(BaseCommand):
    help = 'Divide en sus capítulos reales los libros con capítulos gigantes (simula salvo --apply).'

    def add_arguments(self, parser):
        parser.add_argument('--book', action='append', default=[], help='Slug del libro (se puede repetir).')
        parser.add_argument('--min-kb', type=int, default=DEFAULT_MIN_CHARS // 1024,
                            help='Un capítulo es gigante desde este tamaño (KB de HTML). Por defecto 80.')
        parser.add_argument('--show', type=int, default=5, help='Títulos nuevos de ejemplo por libro.')
        parser.add_argument('--report', help='Guarda el informe completo en este archivo JSON.')
        parser.add_argument('--apply', action='store_true', help='Escribe en la base (si no, solo simula).')
        parser.add_argument('--include-flagged', action='store_true',
                            help='Con --apply, aplica también los libros con advertencias.')

    def handle(self, *args, **options):
        min_chars = options['min_kb'] * 1024
        books = self._books(options['book'], min_chars)
        if not books:
            raise CommandError('No hay libros que revisar.')
        mode = 'APLICANDO' if options['apply'] else 'SIMULACIÓN (no se escribe nada)'
        self.stdout.write(f'{mode}: {len(books)} libro(s), capítulo gigante = {options["min_kb"]} KB o más\n')

        report = []
        if options['apply']:
            for book in books:
                report.append(self._one(book, min_chars, options, apply=True))
        else:
            with transaction.atomic():
                if connection.vendor == 'postgresql':
                    with connection.cursor() as cursor:
                        cursor.execute('SET TRANSACTION READ ONLY')
                for book in books:
                    report.append(self._one(book, min_chars, options, apply=False))
                transaction.set_rollback(True)

        self._summary(report, options['apply'])
        if options['report']:
            with open(options['report'], 'w', encoding='utf-8') as handle:
                json.dump(report, handle, ensure_ascii=False, indent=1)
            self.stdout.write(f'Informe guardado en {options["report"]}')

    def _books(self, slugs, min_chars):
        if slugs:
            found = list(Book.objects.filter(slug__in=slugs).order_by('title'))
            missing = set(slugs) - {book.slug for book in found}
            if missing:
                raise CommandError(f'No existen: {", ".join(sorted(missing))}')
            return found
        book_ids = (Book.objects.annotate(biggest=Max(Length('chapters__content_html')))
                    .filter(biggest__gte=min_chars).values_list('id', flat=True))
        return list(Book.objects.filter(id__in=list(book_ids)).order_by('title'))

    def _one(self, book, min_chars, options, apply):
        started = time.monotonic()
        rows = list(book.chapters.order_by('order').only('id', 'title', 'order', 'content_html'))
        plan = plan_book(rows, min_chars)
        refs = reference_counts(book, rows)
        entry = {
            'libro': book.title, 'slug': book.slug, 'ok': plan.ok, 'motivo': plan.reason, 'avisos': plan.flags,
            'capitulos_antes': len(rows), 'capitulos_despues': len(plan.chapters) if plan.ok else len(rows),
            'kb_mayor_antes': plan.old_max_chars // 1024,
            'kb_mayor_despues': (max(plan.new_sizes) // 1024) if plan.ok else plan.old_max_chars // 1024,
            'palabras': plan.total_words, 'referencias': refs,
            'titulos': [chapter.title for chapter in plan.chapters] if plan.ok else [],
            'segundos': round(time.monotonic() - started, 1),
        }
        status = 'OK ' if plan.ok else '-- '
        self.stdout.write(f'{status}{book.title[:48]:48} {entry["capitulos_antes"]:>3} → {entry["capitulos_despues"]:>3} caps'
                          f'   mayor {entry["kb_mayor_antes"]:>4} → {entry["kb_mayor_despues"]:>4} KB'
                          + (f'   ({plan.reason})' if not plan.ok else ''))
        for flag in plan.flags:
            self.stdout.write(f'      aviso: {flag}')
        if plan.ok and options['show']:
            sample = entry['titulos'][:options['show']]
            self.stdout.write('      ' + ' | '.join(title[:40] for title in sample)
                              + (' | …' if len(entry['titulos']) > len(sample) else ''))
        busy = {key: value for key, value in refs.items() if value}
        if busy:
            self.stdout.write('      guardado por usuarios: ' + ', '.join(f'{k} {v}' for k, v in busy.items()))

        if apply and plan.ok:
            if plan.flags and not options['include_flagged']:
                entry['aplicado'] = False
                self.stdout.write('      no se aplica: tiene avisos (usar --include-flagged)')
            else:
                stats = apply_plan(book, rows, plan)
                entry['aplicado'] = True
                entry['cambios'] = dict(stats)
                self.stdout.write('      aplicado: ' + ', '.join(f'{k} {v}' for k, v in sorted(stats.items())))
        return entry

    def _summary(self, report, applied):
        ok = [entry for entry in report if entry['ok']]
        flagged = [entry for entry in ok if entry['avisos']]
        self.stdout.write('\n' + '─' * 70)
        self.stdout.write(f'{len(ok)} de {len(report)} libros se pueden dividir'
                          f' ({len(flagged)} con avisos para revisar a mano).')
        self.stdout.write(f'Capítulos: {sum(e["capitulos_antes"] for e in ok)} → {sum(e["capitulos_despues"] for e in ok)}'
                          f' en esos libros.')
        if not applied:
            self.stdout.write('Simulación: no se escribió nada.')
