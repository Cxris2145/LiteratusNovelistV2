from datetime import date

from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework.test import APITestCase

from catalog.models import Author, Book, BookAuthor, Genre, Tag

User = get_user_model()
URL = '/api/v1/catalog/books/'


class CatalogSearchTests(APITestCase):
    """Explorar el catálogo: ?search= encuentra palabras sueltas del título, sin tildes y por autor."""

    def setUp(self):
        cache.clear()
        self.homero = Author.objects.create(full_name='Homero')
        self.stoker = Author.objects.create(full_name='Bram Stoker')
        self.dante = Author.objects.create(full_name='Dante Alighieri')
        self.terror = Genre.objects.create(name='Terror')
        self.book('La Odisea', self.homero)
        self.book('La Ilíada', self.homero)
        self.book('La casa del juez', self.stoker, genre=self.terror)
        self.book('Drácula', self.stoker, genre=self.terror)
        self.book('La Divina Comedia', self.dante)
        self.book('Homero y los dioses')
        self.book('Noches de terror')
        self.book('Deseo prohibido', min_age=18)

    def book(self, title, author=None, min_age=0, genre=None):
        book = Book.objects.create(title=title, min_age=min_age, is_published=True,
                                   status=Book.StatusChoices.PUBLISHED)
        if author:
            BookAuthor.objects.create(book=book, author=author)
        if genre:
            book.genres.add(genre)
        return book

    def titles(self, term, **extra):
        response = self.client.get(URL, {'search': term, **extra})
        self.assertEqual(response.status_code, 200)
        return [book['title'] for book in response.data['results']]

    def test_finds_a_word_in_the_middle_of_the_title(self):
        self.assertEqual(self.titles('Odisea'), ['La Odisea'])
        self.assertEqual(self.titles('comedia'), ['La Divina Comedia'])

    def test_full_title_with_article(self):
        self.assertEqual(self.titles('La Odisea'), ['La Odisea'])
        self.assertEqual(self.titles('casa del juez'), ['La casa del juez'])

    def test_ignores_accents_both_ways(self):
        self.assertEqual(self.titles('iliada'), ['La Ilíada'])
        self.assertEqual(self.titles('Ilíada'), ['La Ilíada'])
        self.assertEqual(self.titles('dracula'), ['Drácula'])

    def test_finds_by_author_surname(self):
        self.assertCountEqual(self.titles('Stoker'), ['La casa del juez', 'Drácula'])

    def test_words_can_mix_title_and_author(self):
        self.assertEqual(self.titles('odisea homero'), ['La Odisea'])

    def test_title_matches_come_before_author_and_genre_matches(self):
        self.assertEqual(self.titles('homero'), ['Homero y los dioses', 'La Ilíada', 'La Odisea'])
        self.assertEqual(self.titles('terror'), ['Noches de terror', 'Drácula', 'La casa del juez'])

    def test_finds_by_tag(self):
        tag = Tag.objects.create(name='Vampiros')
        Book.objects.get(title='Drácula').tags.add(tag)
        cache.clear()
        self.assertEqual(self.titles('vampiros'), ['Drácula'])

    def test_explicit_ordering_wins_over_relevance(self):
        self.assertEqual(self.titles('homero', ordering='title'), ['Homero y los dioses', 'La Ilíada', 'La Odisea'])
        self.assertEqual(self.titles('homero', ordering='-title'), ['La Odisea', 'La Ilíada', 'Homero y los dioses'])

    def test_no_match_returns_nothing(self):
        self.assertEqual(self.titles('inexistente'), [])

    def test_adult_books_stay_hidden_from_minors(self):
        minor = User.objects.create_user(username='menor', email='menor@example.com', password='x')
        minor.profile.birth_date = date.today().replace(year=date.today().year - 12)
        minor.profile.save()
        self.client.force_authenticate(minor)
        self.assertEqual(self.titles('deseo'), [])
