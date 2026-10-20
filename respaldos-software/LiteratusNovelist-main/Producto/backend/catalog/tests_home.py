"""Public home metadata: bounded queries, no authentication or protected payloads."""
from datetime import date

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import connection
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APITestCase

from ai_engine.models import AIAvatar
from .home import STARTER_SLUGS, build_home_payload
from .models import Author, Book, BookAuthor, Chapter, Edition, Genre


@override_settings(MEDIA_URL='/media/')
class CatalogHomeTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.author = Author.objects.create(full_name='Autora pública', bio='BIO_PRIVATE_MARKER')
        cls.genre = Genre.objects.create(name='Aventura', cover_image='category_covers/aventura.webp')
        cls.general = Book.objects.create(
            title='La Odisea', slug=STARTER_SLUGS[0], cover_image='book_covers/odisea.webp',
            synopsis='Una aventura. ' * 100, word_count=1000, is_featured=True,
        )
        cls.general.genres.add(cls.genre)
        BookAuthor.objects.create(book=cls.general, author=cls.author)
        cls.edition = Edition.objects.create(book=cls.general, price=0, file='protected/book.epub')
        cls.avatar = AIAvatar.objects.create(
            edition=cls.edition, name='Odiseo', avatar_image='ai_avatars/odiseo.webp',
            system_prompt='SYSTEM_PROMPT_PRIVATE_MARKER', sample_dialogues='DIALOGUE_PRIVATE_MARKER',
        )
        Chapter.objects.create(book=cls.general, order=1, content_html='CHAPTER_PRIVATE_MARKER')
        cls.adult = Book.objects.create(
            title='Obra para adultos', slug=STARTER_SLUGS[1], min_age=18, is_featured=True,
            cover_image='book_covers/adult.webp',
        )
        cls.adult.genres.add(cls.genre)
        adult_edition = Edition.objects.create(book=cls.adult, price=0)
        AIAvatar.objects.create(edition=adult_edition, name='Gregorio Samsa', system_prompt='SECRET_ADULT')
        cls.teen = Book.objects.create(title='Desde trece', min_age=13)
        cls.unpublished = Book.objects.create(title='Libro despublicado', is_published=False)
        cls.unpublished.genres.add(cls.genre)
        unpublished_edition = Edition.objects.create(book=cls.unpublished, price=0)
        AIAvatar.objects.create(edition=unpublished_edition, name='No exportar', system_prompt='SECRET_UNPUBLISHED')
        cls.deleted = Book.objects.create(title='Eliminado')
        cls.deleted.delete()
        for i in range(55):
            Book.objects.create(title=f'Libro {i:02d}', cover_image=f'book_covers/{i}.webp')
        cls.user = get_user_model().objects.create_user(
            username='adult-home', email='PRIVATE_EMAIL@example.com', password='password',
        )
        cls.user.profile.birth_date = date(1990, 1, 1)
        cls.user.profile.save(update_fields=['birth_date'])

    def setUp(self):
        cache.clear()

    def test_public_contract_is_identical_with_invalid_or_adult_authentication(self):
        self.client.credentials(HTTP_AUTHORIZATION='Bearer invalid-token')
        visitor = self.client.get('/api/v1/catalog/home/')
        self.assertEqual(visitor.status_code, 200)
        self.assertEqual(visitor['Cache-Control'], 'public, max-age=60, s-maxage=300, stale-while-revalidate=300')
        self.assertEqual(visitor['Vercel-Cache-Tag'], 'public-home')
        self.client.force_authenticate(self.user)
        adult = self.client.get('/api/v1/catalog/home/')
        self.assertEqual(visitor.data, adult.data)
        self.assertEqual(set(visitor.data), {
            'version', 'generated_at', 'audience', 'stats', 'books', 'starter_books', 'genres', 'cast',
        })
        self.assertEqual(visitor.data['version'], 1)
        self.assertEqual(visitor.data['audience'], 'public')
        self.assertEqual(visitor.data['stats'], {
            'total_books': 56, 'total_characters': 1, 'total_authors': 1, 'total_genres': 1,
        })
        self.assertEqual(len(visitor.data['books']), 50)
        self.assertEqual(visitor.data['starter_books'][0]['slug'], self.general.slug)
        self.assertEqual(len(visitor.data['starter_books']), 1)
        self.assertEqual(len(visitor.data['cast']), 1)
        self.assertEqual(visitor.data['genres'][0]['bookCount'], 1)
        for marker in ('PRIVATE_MARKER', 'PRIVATE_EMAIL', 'SECRET_ADULT', 'SECRET_UNPUBLISHED', 'protected/book.epub'):
            self.assertNotIn(marker, visitor.content.decode())
        self.assertNotIn(self.adult.slug, {book['slug'] for book in visitor.data['books']})
        for book in visitor.data['books']:
            self.assertEqual(set(book), {
                'id', 'title', 'slug', 'synopsis', 'is_featured', 'cover_image', 'author_name', 'genres',
            })
            self.assertLessEqual(len(book['synopsis']), 480)

    def test_cold_home_has_constant_query_budget_and_cached_home_has_zero(self):
        with CaptureQueriesContext(connection) as queries:
            response = self.client.get('/api/v1/catalog/home/')
        self.assertEqual(response.status_code, 200)
        self.assertLessEqual(len(queries), 9)
        sql = ' '.join(query['sql'].lower() for query in queries)
        for protected_column in ('content_html', 'system_prompt', 'sample_dialogues', 'ink_balance'):
            self.assertNotIn(protected_column, sql)
        with self.assertNumQueries(0):
            cached = self.client.get('/api/v1/catalog/home/')
        self.assertEqual(cached.data, response.data)

    def test_curated_books_outside_first_fifty_still_have_shelf_and_cast(self):
        Book.objects.filter(min_age=0).exclude(pk=self.general.pk).update(is_featured=True)
        Book.objects.filter(pk=self.general.pk).update(is_featured=False)
        payload = build_home_payload('https://api.example.test/')
        self.assertEqual(len(payload['books']), 50)
        self.assertNotIn(self.general.slug, {book['slug'] for book in payload['books']})
        self.assertEqual(payload['starter_books'][0]['slug'], self.general.slug)
        self.assertEqual(payload['cast'][0]['bookSlug'], self.general.slug)

    def test_genre_tiles_are_limited_to_thirteen_public_genres(self):
        for i in range(14):
            self.general.genres.add(Genre.objects.create(name=f'Género {i:02d}'))
        private_genre = Genre.objects.create(name='Solo adultos')
        self.adult.genres.add(private_genre)
        payload = build_home_payload('https://api.example.test/')
        self.assertEqual(len(payload['genres']), 13)
        self.assertNotIn(private_genre.slug, {genre['slug'] for genre in payload['genres']})

    def test_age_change_invalidates_all_public_collections_on_commit(self):
        initial = self.client.get('/api/v1/catalog/home/').data
        self.assertEqual(len(initial['cast']), 1)
        with self.captureOnCommitCallbacks(execute=True):
            self.general.min_age = 18
            self.general.save(update_fields=['min_age'])
        after = self.client.get('/api/v1/catalog/home/').data
        self.assertEqual(after['stats']['total_books'], 55)
        self.assertEqual(after['stats']['total_characters'], 0)
        self.assertEqual(after['starter_books'], [])
        self.assertEqual(after['cast'], [])
        self.assertEqual(after['genres'], [])

    def test_avatar_and_genre_changes_invalidate_metadata(self):
        self.client.get('/api/v1/catalog/home/')
        with self.captureOnCommitCallbacks(execute=True):
            self.avatar.avatar_image = 'ai_avatars/new.webp'
            self.avatar.save(update_fields=['avatar_image'])
        updated = self.client.get('/api/v1/catalog/home/').data
        self.assertTrue(updated['cast'][0]['image'].endswith('/ai_avatars/new.webp'))
        with self.captureOnCommitCallbacks(execute=True):
            self.general.genres.clear()
        self.assertEqual(self.client.get('/api/v1/catalog/home/').data['genres'], [])

    def test_media_are_absolute_original_object_urls_and_cache_varies_by_origin(self):
        payload = build_home_payload('https://api.example.test/')
        self.assertEqual(payload['cast'][0]['image'], 'https://api.example.test/media/ai_avatars/odiseo.webp')
        self.assertEqual(payload['starter_books'][0]['cover'], 'https://api.example.test/media/book_covers/odisea.webp')
        self.assertNotIn('/render/image/', str(payload))
        with override_settings(MEDIA_URL='https://storage.example.test/storage/v1/object/public/media/'):
            remote = build_home_payload('https://api.example.test/')
        self.assertEqual(remote['cast'][0]['image'], 'https://storage.example.test/storage/v1/object/public/media/ai_avatars/odiseo.webp')
        with self.captureOnCommitCallbacks(execute=True):
            self.general.cover_image = 'https://external.example.test/original.webp'
            self.general.save(update_fields=['cover_image'])
        self.assertEqual(build_home_payload('https://api.example.test/')['starter_books'][0]['cover'],
                         'https://external.example.test/original.webp')

    def test_details_keep_prefetch_and_do_not_fetch_stored_chapter_html(self):
        with CaptureQueriesContext(connection) as queries:
            response = self.client.get(f'/api/v1/catalog/books/{self.general.slug}/details/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['view_count'], 1)
        self.general.refresh_from_db()
        self.assertEqual(self.general.view_count, 1)
        self.assertFalse(any('"catalog_chapter"' in query['sql'] for query in queries))
        # Both detailed serializers share the original book relation cache.
        self.assertEqual(sum('FROM "catalog_genre"' in query['sql'] for query in queries), 1)
