"""
catalog/management/commands/curate_characters.py

Corrige los personajes de IA de cada libro según `catalog/data/personajes_correcciones.json`:
personajes genéricos («Protagonista», «Narrador»), de otro libro o duplicados, y personajes
de autor con nombre equivocado («Unknown», «Autor Desconocido»).

Por libro (clave = slug) acepta:
    author   campos del personaje de autor (is_author=True) que se reemplazan
    rename   {"nombre viejo": "nombre nuevo"}; el nombre se cambia también en sus textos
    replace  {"nombre viejo": {campos}}: el mismo registro pasa a ser otro personaje
    delete   ["nombre", ...]
    add      [{campos}, ...]
`unlock_ratio` (0-1) fija unlock_at_chapter como fracción de los capítulos del libro.

Por defecto solo informa; --apply escribe. Volver a correrlo no cambia nada.
"""

import json
from decimal import Decimal
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from ai_engine.models import AIAvatar
from catalog.models import Book

SPEC = Path(__file__).resolve().parents[2] / 'data' / 'personajes_correcciones.json'
TEXT_FIELDS = ('description', 'system_prompt', 'greeting_message', 'behavioral_context', 'sample_dialogues')
IMAGE_FIELDS = ('avatar_image', 'image_speaking_1', 'image_speaking_2', 'image_speaking_3', 'image_thinking')
NEW_DEFAULTS = {'temperature': Decimal('0.70'), 'model_name': 'gemini-2.0-flash', 'kokoro_voice_id': 'af_bella'}


class Command(BaseCommand):
    help = "Corrige personajes de IA según personajes_correcciones.json. Dry-run por defecto; --apply para escribir."

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Escribe los cambios. Sin esto solo informa.')
        parser.add_argument('--spec', default=str(SPEC), help='JSON con las correcciones.')

    def handle(self, *args, **opts):
        try:
            spec = json.loads(Path(opts['spec']).read_text(encoding='utf-8'))
        except (OSError, ValueError) as exc:
            raise CommandError(f'No se pudo leer {opts["spec"]}: {exc}')

        self.apply = opts['apply']
        self.changes = 0
        with transaction.atomic():
            for slug, changes in spec.items():
                book = Book.objects.filter(slug=slug).first()
                if not book:
                    self.stdout.write(self.style.WARNING(f'  ! {slug}: no existe'))
                    continue
                edition = book.editions.first()
                if not edition:
                    self.stdout.write(self.style.WARNING(f'  ! {slug}: sin edición'))
                    continue
                self._book(book, edition, changes)

        verb = 'aplicados' if self.apply else 'pendientes (dry-run, usa --apply)'
        self.stdout.write(self.style.SUCCESS(f'\n{self.changes} cambios {verb}.'))

    # ── Por libro ───────────────────────────────────────────────────────────

    def _log(self, book, text):
        self.changes += 1
        self.stdout.write(f'  {book.title[:40]}: {text}')

    def _unlock(self, book, fields):
        ratio = fields.get('unlock_ratio')
        if not ratio:
            return 0
        return max(1, round(book.chapters.count() * ratio))

    def _fill(self, avatar, book, fields):
        """Copia los campos del JSON al personaje. Devuelve True si algo cambió."""
        values = {k: v for k, v in fields.items() if k != 'unlock_ratio'}
        values.setdefault('is_major_character', True)
        values['unlock_at_chapter'] = self._unlock(book, fields)
        changed = False
        for field, value in values.items():
            if getattr(avatar, field) != value:
                setattr(avatar, field, value)
                changed = True
        return changed

    def _book(self, book, edition, changes):
        avatars = {a.name: a for a in AIAvatar.objects.filter(edition=edition)}

        if 'author' in changes:
            author = AIAvatar.objects.filter(edition=edition, is_author=True).first()
            if author:
                diff = {k: v for k, v in changes['author'].items() if getattr(author, k) != v}
                if diff:
                    self._log(book, f'autor «{author.name}» → «{changes["author"].get("name", author.name)}»')
                    if self.apply:
                        for field, value in diff.items():
                            setattr(author, field, value)
                        author.save()

        for old, new in changes.get('rename', {}).items():
            avatar = avatars.get(old)
            if not avatar or new in avatars:
                continue
            self._log(book, f'renombrar «{old}» → «{new}»')
            if self.apply:
                avatar.name = new
                for field in TEXT_FIELDS:
                    setattr(avatar, field, (getattr(avatar, field) or '').replace(old, new))
                avatar.save()
            avatars[new] = avatars.pop(old)

        for old, fields in changes.get('replace', {}).items():
            avatar = avatars.get(old)
            if not avatar or fields['name'] in avatars:
                continue
            self._log(book, f'reemplazar «{old}» por «{fields["name"]}»')
            if self.apply:
                self._fill(avatar, book, fields)
                for field in IMAGE_FIELDS:  # el retrato era del personaje anterior
                    setattr(avatar, field, '')
                avatar.save()
            avatars[fields['name']] = avatars.pop(old)

        for name in changes.get('delete', []):
            avatar = avatars.pop(name, None)
            if avatar:
                self._log(book, f'borrar «{name}»')
                if self.apply:
                    AIAvatar.all_objects.filter(pk=avatar.pk).delete()

        for fields in changes.get('add', []):
            if fields['name'] in avatars:
                continue
            self._log(book, f'agregar «{fields["name"]}»')
            if self.apply:
                avatar = AIAvatar(edition=edition, is_author=False, **NEW_DEFAULTS)
                self._fill(avatar, book, fields)
                avatar.save()
                avatars[fields['name']] = avatar
