"""curate_catalog: deja solo la selección, arregla autores y no borra archivos compartidos."""
import json
import tempfile
from pathlib import Path
from unittest import mock

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from ai_engine.models import AIAvatar
from .management.commands.curate_catalog import Command
from .models import Author, Book, BookAuthor, Chapter, Edition, Genre


def _book(slug, author, genres=(), cover=''):
    book = Book.objects.create(title=slug.title(), slug=slug, cover_image=cover)
    BookAuthor.objects.create(book=book, author=author)
    for genre in genres:
        book.genres.add(genre)
    Chapter.objects.create(book=book, order=1, content_html='<p>uno dos tres</p>')
    edition = Edition.objects.create(book=book, price=0)
    return book, edition


def _avatar(edition, name, image='', is_author=False):
    return AIAvatar.objects.create(edition=edition, name=name, avatar_image=image, is_author=is_author,
                                   system_prompt='prompt', sample_dialogues='')


@mock.patch.object(Command, '_check_references', lambda self, slugs: None)
class CurateCatalogTests(TestCase):
    def setUp(self):
        self.classic = Genre.objects.create(name='Ficción clásica', slug='ficcion-clasica')
        self.tales = Genre.objects.create(name='Cuentos', slug='cuentos')
        self.humor = Genre.objects.create(name='Humor', slug='humor', cover_image='category_covers/humor.webp')

        self.ana = Author.objects.create(full_name='Ana Autora', slug='ana-autora')
        self.ana_dup = Author.objects.create(full_name='Ana Autora(1)', slug='ana-autora-1',
                                             photo='authors/photos/ana-dup.jpg')
        self.bruno = Author.objects.create(full_name='Bruno', slug='bruno', photo='authors/photos/bruno.jpg')
        self.grimm = Author.objects.create(full_name='Hermanos Grimm', slug='hermanos-grimm')
        self.perrault = Author.objects.create(full_name='Charles Perrault', slug='charles-perrault')

        self.k1, k1_ed = _book('k1', self.ana, [self.classic, self.humor], cover='book_covers/k1.jpg')
        self.k2, _ = _book('k2', self.ana_dup, [self.tales])
        self.gato, gato_ed = _book('gato', self.grimm, [self.tales])
        self.drop, drop_ed = _book('d1', self.bruno, [self.humor], cover='book_covers/d1.jpg')
        _, perrault_ed = _book('d2', self.perrault, [self.tales])

        _avatar(k1_ed, 'Héroe', image='ai_avatars/shared.webp')
        _avatar(drop_ed, 'Villano', image='ai_avatars/shared.webp')
        _avatar(drop_ed, 'Secundario', image='ai_avatars/d1-only.webp')
        _avatar(gato_ed, 'Hermanos Grimm', is_author=True)
        self.donor = _avatar(perrault_ed, 'Charles Perrault', image='ai_avatars/perrault.webp', is_author=True)

        self.selection = {
            'categories': {'ficcion-clasica': 'Novela clásica', 'cuentos': 'Cuentos e infantil'},
            'books': {'k1': 'ficcion-clasica', 'k2': 'cuentos', 'gato': 'cuentos'},
            'author_merges': {'ana-autora-1': 'ana-autora'},
            'book_author_fixes': {'gato': {'from': 'hermanos-grimm', 'to': 'charles-perrault'}},
            'min_age': {'k1': 0},
        }

    def _write(self, data):
        tmp = tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, encoding='utf-8')
        json.dump(data, tmp)
        tmp.close()
        self.addCleanup(Path(tmp.name).unlink)
        return tmp.name

    def _run(self, *args):
        call_command('curate_catalog', '--selection', self._write(self.selection), *args, stdout=mock.MagicMock())

    def test_dry_run_changes_nothing(self):
        self._run()
        self.assertEqual(Book.all_objects.count(), 5)
        self.assertTrue(Genre.objects.filter(slug='humor').exists())
        self.assertEqual(Genre.objects.get(slug='ficcion-clasica').name, 'Ficción clásica')

    def test_apply_keeps_only_the_selection(self):
        self._run('--apply', '--skip-storage', '--no-backup')

        self.assertEqual(set(Book.all_objects.values_list('slug', flat=True)), {'k1', 'k2', 'gato'})
        self.assertEqual(list(self.k1.genres.values_list('slug', flat=True)), ['ficcion-clasica'])
        self.assertEqual(Genre.objects.get(slug='ficcion-clasica').name, 'Novela clásica')
        self.assertFalse(Genre.all_objects.filter(slug='humor').exists())
        self.assertFalse(Author.all_objects.filter(slug__in=['bruno', 'ana-autora-1', 'hermanos-grimm']).exists())
        self.assertEqual(list(self.k2.authors.values_list('slug', flat=True)), ['ana-autora'])
        self.assertEqual(Book.objects.get(slug='k1').word_count, 3)

    def test_wrong_author_gets_the_right_author_character(self):
        self._run('--apply', '--skip-storage', '--no-backup')

        self.assertEqual(list(self.gato.authors.values_list('slug', flat=True)), ['charles-perrault'])
        author_avatars = AIAvatar.objects.filter(edition__book=self.gato, is_author=True)
        self.assertEqual([a.pk for a in author_avatars], [self.donor.pk])

    def test_running_twice_is_a_no_op(self):
        self._run('--apply', '--skip-storage', '--no-backup')
        self._run('--apply', '--skip-storage', '--no-backup')
        self.assertEqual(Book.all_objects.count(), 3)
        self.assertEqual(AIAvatar.objects.filter(edition__book__slug='k1').count(), 1)

    def test_storage_list_skips_files_still_in_use(self):
        command = Command()
        data = command._load(self._write(self.selection))
        paths = command._storage_paths(command._plan(data))

        self.assertIn('book_covers/d1.jpg', paths)
        self.assertIn('ai_avatars/d1-only.webp', paths)
        self.assertIn('authors/photos/bruno.jpg', paths)
        self.assertIn('category_covers/humor.webp', paths)
        self.assertNotIn('ai_avatars/shared.webp', paths)
        self.assertNotIn('book_covers/k1.jpg', paths)

    def test_files_named_in_keep_files_are_spared(self):
        self.selection['keep_files'] = ['category_covers/humor.webp']
        command = Command()
        paths = command._storage_paths(command._plan(command._load(self._write(self.selection))))
        self.assertNotIn('category_covers/humor.webp', paths)

    def test_uneven_categories_are_rejected(self):
        self.selection['per_category'] = 1
        with self.assertRaises(CommandError):
            self._run()

    def test_missing_book_is_rejected(self):
        self.selection['books']['no-existe'] = 'cuentos'
        with self.assertRaises(CommandError):
            self._run()


class CurateCatalogReferenceTests(TestCase):
    def test_books_named_in_code_must_stay(self):
        with self.assertRaises(CommandError):
            Command()._check_references(set())
