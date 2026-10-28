"""curate_characters: corrige personajes de IA según el JSON, sin repetir cambios."""
import json
import tempfile
from pathlib import Path
from unittest import mock

from django.core.management import call_command
from django.test import TestCase

from ai_engine.models import AIAvatar
from .models import Book, Chapter, Edition


class CurateCharactersTests(TestCase):
    def setUp(self):
        self.book = Book.objects.create(title='Libro', slug='libro')
        for order in range(1, 11):
            Chapter.objects.create(book=self.book, order=order, content_html='<p>texto</p>')
        self.edition = Edition.objects.create(book=self.book, price=0)
        common = {'edition': self.edition, 'system_prompt': 'p', 'sample_dialogues': ''}
        self.author = AIAvatar.objects.create(name='Unknown', is_author=True, **common)
        AIAvatar.objects.create(name='Protagonista', avatar_image='ai_avatars/viejo.webp', **common)
        AIAvatar.objects.create(name='Capitan Ahab', description='Soy Capitan Ahab.', **common)
        AIAvatar.objects.create(name='Duplicado', **common)
        spec = {
            'libro': {
                'author': {'name': 'Herman Melville', 'system_prompt': 'Soy Melville.'},
                'rename': {'Capitan Ahab': 'Capitán Ahab'},
                'replace': {'Protagonista': {'name': 'Ishmael', 'description': 'Narrador.',
                                             'system_prompt': 'Soy Ishmael.', 'greeting_message': 'Hola',
                                             'behavioral_context': '', 'sample_dialogues': ''}},
                'delete': ['Duplicado'],
                'add': [{'name': 'Queequeg', 'description': 'Arponero.', 'system_prompt': 'Soy Queequeg.',
                         'greeting_message': 'Hola', 'behavioral_context': '', 'sample_dialogues': '',
                         'is_major_character': False, 'unlock_ratio': 0.5}],
            },
            'no-existe': {'delete': ['X']},
        }
        tmp = tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, encoding='utf-8')
        json.dump(spec, tmp)
        tmp.close()
        self.addCleanup(Path(tmp.name).unlink)
        self.spec = tmp.name

    def _run(self, *args):
        call_command('curate_characters', '--spec', self.spec, *args, stdout=mock.MagicMock())

    def _names(self):
        return set(AIAvatar.objects.filter(edition=self.edition).values_list('name', flat=True))

    def test_dry_run_changes_nothing(self):
        self._run()
        self.assertEqual(self._names(), {'Unknown', 'Protagonista', 'Capitan Ahab', 'Duplicado'})

    def test_apply_fixes_the_characters(self):
        self._run('--apply')

        self.assertEqual(self._names(), {'Herman Melville', 'Ishmael', 'Capitán Ahab', 'Queequeg'})
        ishmael = AIAvatar.objects.get(edition=self.edition, name='Ishmael')
        self.assertEqual(ishmael.avatar_image, '')
        self.assertTrue(ishmael.is_major_character)
        self.assertEqual(AIAvatar.objects.get(name='Capitán Ahab').description, 'Soy Capitán Ahab.')
        queequeg = AIAvatar.objects.get(name='Queequeg')
        self.assertEqual((queequeg.unlock_at_chapter, queequeg.is_author, queequeg.model_name), (5, False, 'gemini-2.0-flash'))
        self.assertFalse(AIAvatar.all_objects.filter(name='Duplicado').exists())

    def test_running_twice_is_a_no_op(self):
        self._run('--apply')
        before = list(AIAvatar.objects.order_by('id').values_list('id', 'name', 'updated_at'))
        self._run('--apply')
        self.assertEqual(list(AIAvatar.objects.order_by('id').values_list('id', 'name', 'updated_at')), before)
