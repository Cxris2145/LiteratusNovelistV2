import csv
import importlib
import io
import tempfile
from datetime import date
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from urllib.parse import urlparse, parse_qs
from uuid import uuid4

from django.apps import apps
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.management import call_command
from django.test import SimpleTestCase
from django.utils import timezone
from rest_framework.test import APITestCase

from ai_engine.models import AIAvatar, BlindInterrogationSession, ChatSession, ChatMessage
from catalog import narration
from catalog.age import age_on
from catalog.age_classification import adult_rating_reason
from catalog.models import Author, Book, BookAuthor, Chapter, ChapterAudio, Edition, Genre
from library.models import ReadingSession, UserFavorite, UserInventory

User = get_user_model()
TODAY = date(2026, 10, 8)


class BirthdayTests(SimpleTestCase):
    def test_eighteen_only_on_the_birthday(self):
        self.assertEqual(age_on(date(2008, 10, 8), TODAY), 18)
        self.assertEqual(age_on(date(2008, 10, 9), TODAY), 17)
        self.assertEqual(age_on(date(2008, 10, 7), TODAY), 18)

    def test_leap_day(self):
        self.assertEqual(age_on(date(2008, 2, 29), date(2026, 2, 28)), 17)
        self.assertEqual(age_on(date(2008, 2, 29), date(2026, 3, 1)), 18)

    def test_educational_topics_do_not_make_a_book_adult(self):
        self.assertEqual(adult_rating_reason('totem-y-tabu', 'Tótem y tabú', ['Psicología']), '')
        self.assertEqual(adult_rating_reason('sodoma-y-gomorra', 'Sodoma y Gomorra', ['Ficción contemporánea']), '')
        self.assertTrue(adult_rating_reason('otra-obra', 'Otra obra', ['Ficción erótica']))


class ParentalControlAPITests(APITestCase):
    def setUp(self):
        cache.clear()
        clock = patch('catalog.age.timezone.localdate', return_value=TODAY)
        clock.start()
        self.addCleanup(clock.stop)
        self.minor = self.make_user('menor', date(2008, 10, 9))
        self.adult = self.make_user('adulta', date(2008, 10, 8))
        self.unknown = self.make_user('sinfecha', None)
        self.general = self.make_book('Obra para todos')
        self.teen = self.make_book('Obra desde trece', min_age=13)
        self.adult_book = self.make_book('Obra para adultos', min_age=18, is_featured=True)
        self.author = Author.objects.create(full_name='Autora de prueba', recommended_book=self.adult_book)
        for book in (self.general, self.teen, self.adult_book):
            BookAuthor.objects.create(book=book, author=self.author)
        self.genre = Genre.objects.create(name='Ficción de prueba')
        self.general.genres.add(self.genre)
        self.adult_book.genres.add(self.genre)
        self.adult_edition = Edition.objects.create(book=self.adult_book, price=0)
        self.general_edition = Edition.objects.create(book=self.general, price=0)
        # Simula una biblioteca antigua cuyo libro fue reclasificado posteriormente.
        self.inventory = UserInventory.objects.create(user=self.minor, edition=self.adult_edition)
        UserInventory.objects.create(user=self.minor, edition=self.general_edition)
        self.chapter = Chapter.objects.create(book=self.adult_book, order=1, content_html='<p>Contenido adulto.</p>')
        self.avatar = AIAvatar.objects.create(edition=self.adult_edition, name='Personaje adulto',
                                             is_major_character=True, system_prompt='Prueba')
        self.safe_avatar = AIAvatar.objects.create(edition=self.general_edition, name='Personaje para todos',
                                                  is_major_character=True, system_prompt='Prueba')

    def make_user(self, name, birth_date):
        user = User.objects.create_user(username=name, email=f'{name}@example.com', password='StrongPassword123!')
        user.profile.birth_date = birth_date
        user.profile.save(update_fields=['birth_date'])
        return user

    def make_book(self, title, **kwargs):
        return Book.objects.create(title=title, is_published=True, status=Book.StatusChoices.PUBLISHED, **kwargs)

    def titles(self, response):
        return {b['title'] for b in response.data['results']}

    def test_catalog_pagination_and_cache_do_not_share_adult_results(self):
        for user, expected in ((self.adult, 3), (self.minor, 2), (self.unknown, 1), (None, 1), (self.adult, 3)):
            with self.subTest(user=user):
                self.client.force_authenticate(user)
                response = self.client.get('/api/v1/catalog/books/?page_size=1')
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.data['count'], expected)
                self.assertIn('no-store', response['Cache-Control'])
                if user != self.adult:
                    self.assertNotIn(self.adult_book.title, self.titles(response))

    def test_search_and_genre_filters_hide_adult_books(self):
        self.client.force_authenticate(self.minor)
        for query in ('search=adultos', f'genres__slug={self.genre.slug}', 'has_ai_avatars=true', 'is_featured=true'):
            with self.subTest(query=query):
                response = self.client.get(f'/api/v1/catalog/books/?{query}')
                self.assertEqual(response.status_code, 200)
                self.assertNotIn(self.adult_book.title, self.titles(response))

    def test_recommendations_hide_adult_books_for_all_restricted_audiences(self):
        for user in (self.minor, self.unknown, None):
            self.client.force_authenticate(user)
            response = self.client.get('/api/v1/catalog/books/recommendations/')
            self.assertEqual(response.status_code, 200)
            self.assertNotIn(self.adult_book.title, {b['title'] for b in response.data})

    def test_author_books_counts_and_recommendations_are_filtered(self):
        self.client.force_authenticate(self.minor)
        response = self.client.get(f'/api/v1/catalog/authors/{self.author.slug}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual({b['title'] for b in response.data['books']}, {self.general.title, self.teen.title})
        self.assertIsNone(response.data['recommended_book'])
        self.assertIsNone(response.data['recommended_book_slug'])
        listed = self.client.get('/api/v1/catalog/authors/')
        self.assertEqual(listed.data['results'][0]['books_count'], 2)

    def test_details_and_purchase_cannot_be_opened_by_url(self):
        self.client.force_authenticate(self.minor)
        path = f'/api/v1/catalog/books/{self.adult_book.slug}/'
        for endpoint in (path, path + 'details/', path + 'summary/'):
            with self.subTest(endpoint=endpoint):
                response = self.client.get(endpoint)
                self.assertEqual(response.status_code, 403)
                self.assertEqual(response.data['error'], 'AGE_RESTRICTED')
        for action in ('purchase/', 'purchase_narration/', 'add_review/'):
            self.assertEqual(self.client.post(path + action, {}, format='json').status_code, 403)

    def test_adult_can_open_the_book_on_eighteenth_birthday(self):
        self.client.force_authenticate(self.adult)
        path = f'/api/v1/catalog/books/{self.adult_book.slug}/'
        self.assertEqual(self.client.get(path).status_code, 200)
        self.assertEqual(self.client.get(path + 'details/').status_code, 200)

    def test_legacy_inventory_is_hidden_and_chapters_are_blocked(self):
        self.client.force_authenticate(self.minor)
        response = self.client.get('/api/v1/library/inventory/')
        self.assertEqual({item['book_title'] for item in response.data}, {self.general.title})
        path = f'/api/v1/library/inventory/{self.inventory.pk}/'
        for action in ('', 'chapters/', 'download/', 'vocabulary/'):
            self.assertEqual(self.client.get(path + action).status_code, 403)
        self.assertEqual(self.client.post(path + f'chapters/{self.chapter.pk}/narration/').status_code, 403)
        ownership = self.client.get('/api/v1/library/inventory/check/', {'slug': self.adult_book.slug})
        self.assertEqual(ownership.data, {'owned': False})

    def test_adult_legacy_inventory_remains_readable(self):
        inventory = UserInventory.objects.create(user=self.adult, edition=self.adult_edition)
        self.client.force_authenticate(self.adult)
        response = self.client.get(f'/api/v1/library/inventory/{inventory.pk}/chapters/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['chapters'][0]['id'], self.chapter.pk)

    def test_favorites_hide_legacy_adult_books_and_reject_new_ones(self):
        UserFavorite.objects.create(user=self.minor, book=self.adult_book)
        UserFavorite.objects.create(user=self.minor, book=self.general)
        self.client.force_authenticate(self.minor)
        response = self.client.get('/api/v1/library/favorites/')
        self.assertEqual({f['book']['title'] for f in response.data}, {self.general.title})
        blocked = self.client.post('/api/v1/library/favorites/', {'book_id': str(self.adult_book.pk)}, format='json')
        self.assertEqual(blocked.status_code, 403)

    def test_statistics_and_genre_cache_are_filtered(self):
        for user, count in ((self.adult, 3), (self.minor, 2), (None, 1)):
            self.client.force_authenticate(user)
            stats = self.client.get('/api/v1/catalog/stats/')
            self.assertEqual(stats.status_code, 200)
            self.assertEqual(stats.data['total_books'], count)
            genres = self.client.get('/api/v1/catalog/genres/')
            self.assertEqual(genres.status_code, 200)
            self.assertEqual(genres.data['results'][0]['book_count'], 2 if user == self.adult else 1)

    def test_hub_recent_chats_and_direct_avatar_access_are_protected(self):
        session = ChatSession.objects.create(user=self.minor, avatar=self.avatar)
        ChatMessage.objects.create(session=session, role='assistant', content='Contenido adulto')
        self.client.force_authenticate(self.minor)
        hub = self.client.get('/api/v1/ai/hub/avatars/')
        self.assertEqual(hub.status_code, 200)
        self.assertEqual({a['name'] for a in hub.data['results']}, {self.safe_avatar.name})
        self.assertEqual(self.client.get('/api/v1/ai/hub/recent/').data, [])
        for endpoint in (f'/api/v1/ai/avatars/{self.avatar.pk}/',
                         f'/api/v1/ai/sessions/?avatar_id={self.avatar.pk}',
                         f'/api/v1/ai/sessions/{session.pk}/messages/',
                         f'/api/v1/ai/avatars/?inventory_id={self.inventory.pk}'):
            self.assertEqual(self.client.get(endpoint).status_code, 403)
        self.assertEqual(self.client.post('/api/v1/ai/chat/', {
            'session_id': str(session.pk), 'request_id': str(uuid4()), 'message': 'Hola'
        }, format='json').status_code, 403)
        self.assertEqual(self.client.post('/api/v1/ai/chat/quote/', {
            'session_id': str(session.pk), 'message': 'Hola'
        }, format='json').status_code, 403)

    def test_public_demo_cannot_select_an_adult_avatar(self):
        self.assertEqual(self.client.get('/api/v1/ai/demo-chat/', {'avatar_id': str(self.avatar.pk)}).status_code, 404)
        self.assertEqual(self.client.post('/api/v1/ai/demo-chat/', {
            'avatar_id': str(self.avatar.pk), 'message': 'Hola'
        }, format='json').status_code, 404)

    def test_reading_sessions_reject_adult_books(self):
        self.client.force_authenticate(self.minor)
        response = self.client.post('/api/v1/library/sessions/', {
            'book_id': str(self.adult_book.pk)
        }, format='json')
        self.assertEqual(response.status_code, 403)
        self.assertFalse(ReadingSession.objects.filter(user=self.minor).exists())

    def test_friend_activity_hides_adult_titles_from_minor_viewers(self):
        from community.services import presence_statuses
        ReadingSession.objects.create(user=self.adult, book=self.adult_book, started_at=timezone.now())
        minor_view = presence_statuses([self.adult.profile], viewer=self.minor)[self.adult.pk]
        adult_view = presence_statuses([self.adult.profile], viewer=self.adult)[self.adult.pk]
        self.assertIsNone(minor_view['book_title'])
        self.assertNotIn(self.adult_book.title, minor_view['label'])
        self.assertEqual(adult_view['book_title'], self.adult_book.title)

    def test_existing_interrogation_cannot_generate_or_charge_for_an_adult_book(self):
        game = BlindInterrogationSession.objects.create(user=self.minor, avatar=self.avatar,
            candidate_order=[str(self.avatar.pk), str(self.safe_avatar.pk)])
        self.client.force_authenticate(self.minor)
        with patch('ai_engine.views.BlindInterrogationAIService.generate_reply') as reply:
            response = self.client.post('/api/v1/ai/games/interrogation/ask/', {
                'session_id': str(game.pk), 'question': '¿Quién eres?'
            }, format='json')
            self.assertEqual(response.status_code, 403)
            reply.assert_not_called()

    def test_metadata_recommendations_also_hide_adult_books(self):
        self.assertNotIn(self.adult_book.pk, [b.pk for b in Book.get_recommended_for_user(self.minor)])
        self.assertIn(self.adult_book.pk, [b.pk for b in Book.get_recommended_for_user(self.adult)])

    def test_local_adult_audio_uses_a_signed_permission_and_rechecks_age(self):
        audio = ChapterAudio.objects.create(chapter=self.chapter, voice_name='Azure',
            audio_file='protected/test.mp3', alignment_data={'meta': {'engine': 'azure', 'storage': 'local'}})
        request = SimpleNamespace(user=self.adult, build_absolute_uri=lambda url: 'http://testserver' + url)
        url = narration.audio_url(request, audio)
        self.assertIn('access', parse_qs(urlparse(url).query))
        path = urlparse(url).path
        self.assertEqual(self.client.get(path).status_code, 403)
        with patch('catalog.narration.default_storage.exists', return_value=True), patch(
                'library.views.default_storage.size', return_value=3), patch(
                'library.views.default_storage.open', return_value=io.BytesIO(b'mp3')):
            response = self.client.get(url)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response['Cache-Control'], 'private, no-store')
            self.assertEqual(b''.join(response.streaming_content), b'mp3')
        self.adult.profile.birth_date = date(2010, 1, 1)
        self.adult.profile.save(update_fields=['birth_date'])
        self.assertEqual(self.client.get(url).status_code, 403)


class AgeClassificationTests(APITestCase):
    def setUp(self):
        cache.clear()

    def test_known_adult_book_and_new_erotic_genre_are_classified(self):
        known = Book.objects.create(title='Los 120 días de Sodoma')
        self.assertEqual(known.min_age, 18)
        other = Book.objects.create(title='Nueva obra erótica')
        erotic = Genre.objects.create(name='Ficción erótica', slug='ficcion-erotica')
        other.genres.add(erotic)
        other.refresh_from_db()
        self.assertEqual(other.min_age, 18)
        other.genres.clear()
        other.refresh_from_db()
        self.assertEqual(other.min_age, 18)

    def test_reverse_genre_assignment_also_classifies(self):
        book = Book.objects.create(title='Obra nueva')
        erotic = Genre.objects.create(name='Erótica')
        erotic.books.add(book)
        book.refresh_from_db()
        self.assertEqual(book.min_age, 18)

    def test_audit_report_covers_every_book_and_apply_is_idempotent(self):
        safe = Book.objects.create(title='Texto para todos')
        adult = Book.objects.create(title='Historia de Aline y Valcour')
        strict = Book.objects.create(title='Restricción editorial existente', min_age=21)
        Book.objects.filter(pk=adult.pk).update(min_age=0)  # Registro anterior a la clasificación.
        with tempfile.TemporaryDirectory() as directory:
            report = Path(directory) / 'ages.csv'
            call_command('classify_book_ages', report=str(report), stdout=io.StringIO())
            with report.open(encoding='utf-8-sig') as file:
                rows = list(csv.DictReader(file))
            self.assertEqual(len(rows), 3)
            adult.refresh_from_db()
            self.assertEqual(adult.min_age, 0)  # Simulación, sin escrituras.
            call_command('classify_book_ages', apply=True, stdout=io.StringIO())
            call_command('classify_book_ages', apply=True, stdout=io.StringIO())
        adult.refresh_from_db()
        strict.refresh_from_db()
        safe.refresh_from_db()
        self.assertEqual((adult.min_age, strict.min_age, safe.min_age), (18, 21, 0))

    def test_migration_classifies_existing_genres_without_lowering_ages(self):
        book = Book.objects.create(title='Obra antigua')
        strict = Book.objects.create(title='Los 120 días de Sodoma', min_age=21)
        erotic = Genre.objects.create(name='Ficción erótica', slug='ficcion-erotica')
        book.genres.add(erotic)
        Book.objects.filter(pk=book.pk).update(min_age=0)
        migration = importlib.import_module('catalog.migrations.0027_classify_adult_books')
        migration.classify_adult_books(apps, SimpleNamespace(connection=SimpleNamespace(alias='default')))
        book.refresh_from_db()
        strict.refresh_from_db()
        self.assertEqual((book.min_age, strict.min_age), (18, 21))
