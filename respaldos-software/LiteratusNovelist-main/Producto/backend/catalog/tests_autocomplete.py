from datetime import date

from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework.test import APITestCase

from catalog.models import Author, Book, BookAuthor, Genre
from catalog.search_suggest import fold

User = get_user_model()
URL = '/api/v1/catalog/autocomplete/'


class FoldTests(APITestCase):
    def test_matches_the_frontend_fold(self):
        self.assertEqual(fold('  Cien Años de Soledad!  '), 'cien años de soledad')
        self.assertEqual(fold('Pingüino—Ártico'), 'pinguino artico')


class AutocompleteTests(APITestCase):
    """Buscador del header: sugerencias desde la primera letra, sin tildes y por edad."""

    def setUp(self):
        cache.clear()
        self.gabo = Author.objects.create(full_name='Gabriel García Márquez')
        self.borges = Author.objects.create(full_name='Jorge Luis Borges')
        self.fantasy = Genre.objects.create(name='Fantasía')
        self.erotic = Genre.objects.create(name='Erótica')
        self.book('Cien años de soledad', self.gabo)
        self.book('El otoño del patriarca', self.gabo)
        self.book('Ficciones', self.borges, genre=self.fantasy)
        self.book('El Aleph', self.borges, genre=self.fantasy)
        self.book('La casa de los espíritus')
        self.book('Casa tomada')
        self.book('Una casa en el árbol')
        self.book('Deseo prohibido', min_age=18, genre=self.erotic)

    def book(self, title, author=None, min_age=0, genre=None):
        book = Book.objects.create(title=title, min_age=min_age, is_published=True,
                                   status=Book.StatusChoices.PUBLISHED)
        if author:
            BookAuthor.objects.create(book=book, author=author)
        if genre:
            book.genres.add(genre)
        return book

    def search(self, term):
        response = self.client.get(URL, {'search': term})
        self.assertEqual(response.status_code, 200)
        return response.data

    def titles(self, term, group='books'):
        return [item['title'] for item in self.search(term)[group]]

    def test_empty_query_returns_nothing(self):
        self.assertEqual(self.search('   '), {'books': [], 'authors': [], 'genres': []})

    def test_one_letter_suggests_word_starts_only(self):
        # "c" no trae "El Aleph" ni "Ficciones" aunque tengan una c dentro.
        self.assertEqual(self.titles('c'), ['Casa tomada', 'Cien años de soledad',
                                            'Una casa en el árbol', 'La casa de los espíritus'])

    def test_title_start_ranks_before_word_start(self):
        self.assertEqual(self.titles('casa'), ['Casa tomada', 'Una casa en el árbol', 'La casa de los espíritus'])

    def test_ignores_accents_both_ways(self):
        self.assertEqual(self.titles('arbol'), ['Una casa en el árbol'])
        self.assertEqual(self.titles('GARCÍA', 'authors'), ['Gabriel García Márquez'])
        self.assertEqual(self.titles('fantasia', 'genres'), ['Fantasía'])

    def test_ñ_is_not_n(self):
        self.assertEqual(self.titles('años'), ['Cien años de soledad'])
        self.assertEqual(self.titles('anos'), [])

    def test_books_also_appear_by_author_after_title_matches(self):
        data = self.search('borges')
        self.assertEqual([a['title'] for a in data['authors']], ['Jorge Luis Borges'])
        self.assertEqual(sorted(b['title'] for b in data['books']), ['El Aleph', 'Ficciones'])
        self.assertEqual(data['books'][0]['author_name'], 'Jorge Luis Borges')

    def test_contains_needs_three_letters(self):
        self.assertEqual(self.titles('ci'), ['Cien años de soledad'])
        self.assertIn('Ficciones', self.titles('cci'))

    def test_adult_books_hidden_from_visitors_and_minors(self):
        self.assertEqual(self.titles('deseo'), [])
        self.assertEqual(self.titles('erot', 'genres'), [])
        minor = self.make_user('menor', date(date.today().year - 15, 1, 1))
        self.client.force_authenticate(minor)
        self.assertEqual(self.titles('deseo'), [])

        adult = self.make_user('adulta', date(1990, 5, 1))
        self.client.force_authenticate(adult)
        self.assertEqual(self.titles('deseo'), ['Deseo prohibido'])
        self.assertEqual(self.titles('erot', 'genres'), ['Erótica'])

    def test_limits_and_payload(self):
        for i in range(8):
            self.book(f'Crónica {i}')
        data = self.search('cr')
        self.assertEqual(len(data['books']), 5)
        self.assertEqual(set(data['books'][0]), {'type', 'id', 'slug', 'title', 'author_name', 'cover'})
        self.assertEqual(self.search('fic')['genres'], [])
        genre = self.search('fan')['genres'][0]
        self.assertEqual((genre['type'], genre['slug'], genre['book_count']), ('genre', self.fantasy.slug, 2))

    def test_responses_are_not_shared_between_readers(self):
        response = self.client.get(URL, {'search': 'c'})
        self.assertEqual(response['Cache-Control'], 'private, no-store')

    def make_user(self, name, birth_date):
        user = User.objects.create_user(username=name, email=f'{name}@example.com', password='StrongPassword123!')
        user.profile.birth_date = birth_date
        user.profile.save(update_fields=['birth_date'])
        return user
