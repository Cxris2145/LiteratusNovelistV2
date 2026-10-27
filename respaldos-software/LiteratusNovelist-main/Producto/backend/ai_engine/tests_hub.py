from datetime import timedelta
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from ai_engine.models import AIAvatar, ChatSession
from catalog.models import Author, Book, BookAuthor, Edition
from users.models import User


class HubIdentityTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def book(self, title, author=None, min_age=0):
        book = Book.objects.create(title=title, min_age=min_age)
        if author:
            creator, _ = Author.objects.get_or_create(full_name=author)
            BookAuthor.objects.create(book=book, author=creator)
        return book

    def avatar(self, book, name, **kwargs):
        return AIAvatar.objects.create(edition=Edition.objects.create(book=book, price=0),
                                      name=name, system_prompt='private', **kwargs)

    def hub(self, **params):
        response = self.client.get('/api/v1/ai/hub/avatars/', params)
        self.assertEqual(response.status_code, 200)
        return response.data

    def test_editions_group_before_pagination_and_prefer_portrait(self):
        book = self.book('La Ilíada')
        self.avatar(book, 'Aquiles', chat_count=5)
        portrait = self.avatar(book, ' aquiles ', avatar_image='ai_avatars/aquiles.webp')
        self.avatar(book, 'Héctor')
        first = self.hub(page_size=1, sort='name')
        second = self.hub(page_size=1, page=2, sort='name')
        self.assertEqual(first['count'], 2)
        self.assertEqual(first['results'][0]['id'], str(portrait.pk))
        self.assertEqual(first['results'][0]['chat_count'], 5)
        self.assertEqual(first['results'][0]['book_count'], 1)
        self.assertNotEqual(first['results'][0]['group_key'], second['results'][0]['group_key'])

    def test_same_author_once_with_all_books_and_book_search(self):
        for title in ('Obra uno', 'Obra dos', 'Obra tres'):
            self.avatar(self.book(title, 'Julio Verne'), 'Julio Verne', is_author=True)
        result = self.hub()['results'][0]
        self.assertEqual(self.hub()['count'], 1)
        self.assertEqual(result['book_count'], 3)
        self.assertEqual(len({work['avatar_id'] for work in result['works']}), 3)
        found = self.hub(q='Obra dos')
        self.assertEqual(found['count'], 1)
        self.assertEqual(found['results'][0]['works'][0]['book_title'], 'Obra dos')

    def test_recurring_character_aliases_require_correct_author(self):
        self.avatar(self.book('La banda de lunares', 'Arthur Conan Doyle'), 'Dr. John H. Watson')
        self.avatar(self.book('Otro misterio', 'Arthur Conan Doyle'), 'John Watson')
        self.avatar(self.book('Un homónimo', 'Otro autor'), 'John Watson')
        result = self.hub()
        self.assertEqual(result['count'], 2)
        self.assertEqual(sorted(row['book_count'] for row in result['results']), [1, 2])

    def test_homonyms_and_authors_are_not_merged_with_characters(self):
        first = self.book('Primer libro', 'Un autor')
        second = self.book('Segundo libro', 'Un autor')
        self.avatar(first, 'Alberto')
        self.avatar(second, 'Alberto')
        self.avatar(first, 'Un autor', is_author=True)
        self.avatar(first, 'Un autor', is_author=False)
        self.assertEqual(self.hub()['count'], 4)

    def test_restricted_works_are_not_disclosed_in_group_or_count(self):
        self.avatar(self.book('Visible', 'Julio Verne'), 'Julio Verne', is_author=True)
        self.avatar(self.book('Restringida', 'Julio Verne', min_age=18), 'Julio Verne', is_author=True)
        result = self.hub()
        self.assertEqual(result['count'], 1)
        self.assertEqual(result['results'][0]['book_count'], 1)
        self.assertNotIn('Restringida', str(result))

    def test_recent_sessions_show_one_card_and_keep_latest_avatar(self):
        user = User.objects.create_user(username='hub-reader', email='hub@example.test', password='test-password')
        first = self.avatar(self.book('Una aventura', 'Arthur Conan Doyle'), 'Sherlock Holmes')
        latest = self.avatar(self.book('Otra aventura', 'Arthur Conan Doyle'), 'Sherlock Holmes')
        ChatSession.objects.create(user=user, avatar=first)
        ChatSession.objects.create(user=user, avatar=first)
        newest = ChatSession.objects.create(user=user, avatar=latest)
        ChatSession.objects.filter(pk=newest.pk).update(updated_at=timezone.now() + timedelta(seconds=1))
        self.client.force_authenticate(user)
        response = self.client.get('/api/v1/ai/hub/recent/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id'], str(latest.pk))

    def test_search_field_limits_where_the_query_matches(self):
        self.avatar(self.book('Veinte mil leguas', 'Julio Verne'), 'Capitán Nemo')
        self.avatar(self.book('Don Quijote', 'Miguel de Cervantes'), 'Sancho Panza')
        names = lambda **params: [row['name'] for row in self.hub(**params)['results']]
        self.assertEqual(names(q='Verne', field='author'), ['Capitán Nemo'])
        self.assertEqual(names(q='Verne'), ['Capitán Nemo'])
        self.assertEqual(names(q='Quijote', field='book'), ['Sancho Panza'])
        self.assertEqual(names(q='Quijote', field='name'), [])
        self.assertEqual(names(q='Sancho', field='name'), ['Sancho Panza'])

    def test_with_photo_keeps_every_work_of_the_group(self):
        self.avatar(self.book('Estudio en escarlata', 'Arthur Conan Doyle'), 'Sherlock Holmes',
                    avatar_image='ai_avatars/holmes.webp')
        self.avatar(self.book('El signo de los cuatro', 'Arthur Conan Doyle'), 'Sherlock Holmes')
        self.avatar(self.book('Otro libro'), 'Sin retrato')
        result = self.hub(with_photo=1)
        self.assertEqual(result['count'], 1)
        self.assertEqual(result['results'][0]['book_count'], 2)

    def test_featured_puts_portraits_first(self):
        book = self.book('Un libro')
        self.avatar(book, 'Alfa', chat_count=9)
        self.avatar(book, 'Omega', avatar_image='ai_avatars/omega.webp')
        self.assertEqual([row['name'] for row in self.hub(sort='featured')['results']], ['Omega', 'Alfa'])

    def test_daily_selection_is_stable_and_shows_characters_before_authors(self):
        for index in range(4):
            book = self.book(f'Libro {index}', f'Autor {index}')
            self.avatar(book, f'Autor {index}', is_author=True)
            self.avatar(book, f'Personaje {index}')
        first = self.hub(sort='daily')['results']
        self.assertEqual([row['id'] for row in first], [row['id'] for row in self.hub(sort='daily')['results']])
        self.assertEqual([row['name'].startswith('Personaje') for row in first], [True] * 4 + [False] * 4)

    def test_stable_popularity_pages_with_ties(self):
        for index in range(5):
            self.avatar(self.book(f'Libro {index}'), 'Mismo nombre')
        ids = [self.hub(page_size=1, page=page, sort='popularity')['results'][0]['id'] for page in range(1, 6)]
        self.assertEqual(len(set(ids)), 5)
        self.assertEqual(self.hub(page_size=1, page=1, sort='popularity')['results'][0]['id'], ids[0])
