from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from rest_framework.test import APIClient

from catalog.models import Book, Chapter, Edition
from library.models import UserInventory


class InventoryChaptersEndpointTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username='reader',
            email='reader@example.com',
            password='safe-test-password',
        )
        self.book = Book.objects.create(
            title='Libro de prueba',
            slug='libro-de-prueba',
            is_published=True,
            status=Book.StatusChoices.PUBLISHED,
        )
        self.edition = Edition.objects.create(
            book=self.book,
            language='es',
            format=Edition.FormatChoices.EPUB,
            price=Decimal('0.00'),
            file='protected/book_files/test.epub',
        )
        self.inventory = UserInventory.objects.create(user=self.user, edition=self.edition)
        self.chapter_1 = Chapter.objects.create(
            book=self.book,
            title='Capitulo 1',
            order=1,
            content_html='<p>' + ('contenido pesado ' * 100) + '</p>',
        )
        Chapter.objects.create(
            book=self.book,
            title='Capitulo 2',
            order=2,
            content_html='<p>' + ('segundo capitulo ' * 100) + '</p>',
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_chapter_toc_omits_content_html_when_requested(self):
        url = reverse('inventory-chapters', kwargs={'pk': self.inventory.pk})

        with CaptureQueriesContext(connection) as queries:
            response = self.client.get(url, {'include_content': 'false'})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['chapters']), 2)
        self.assertNotIn('content_html', response.data['chapters'][0])
        self.assertNotIn('audios', response.data['chapters'][0])
        chapter_selects = [
            query['sql']
            for query in queries.captured_queries
            if 'FROM "catalog_chapter"' in query['sql']
        ]
        self.assertTrue(chapter_selects)
        self.assertNotIn('"content_html"', chapter_selects[0])

    def test_specific_chapter_request_returns_only_requested_content(self):
        url = reverse('inventory-chapters', kwargs={'pk': self.inventory.pk})

        response = self.client.get(url, {'chapter_id': self.chapter_1.pk})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['chapter']['id'], self.chapter_1.pk)
        self.assertIn('content_html', response.data['chapter'])
        self.assertIn('contenido pesado', response.data['chapter']['content_html'])
        self.assertNotIn('chapters', response.data)
