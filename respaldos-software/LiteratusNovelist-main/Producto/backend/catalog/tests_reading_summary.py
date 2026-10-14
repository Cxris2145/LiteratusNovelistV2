import json
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from catalog import reading_summary
from catalog.models import Author, Book, BookAuthor, Chapter, ChapterProgressSummary, Edition
from library.models import UserInventory


GOOD_SUMMARY = json.dumps({
    'title': 'Resumen: Capítulos 1 al 2',
    'overview': 'El narrador investiga cómo enseñar a Yzur.',
    'plot_recap': ['El narrador presenta a Yzur.', 'Empieza a enseñarle a hablar.'],
    'key_events': ['La investigación comienza.'],
    'characters_status': [{'name': 'Yzur', 'status': 'Recibe las primeras lecciones.'}],
    'current_cliffhanger': 'La enseñanza sigue en curso.',
})


@override_settings(GOOGLE_API_KEY='first', GOOGLE_API_KEY_2='second', AI_SUBSCRIPTION_MODEL='gemini-2.5-flash')
class ReadingSummaryProviderTests(SimpleTestCase):
    def test_content_rejects_shapes_that_would_break_the_modal(self):
        for field, value in (('plot_recap', 'párrafo'), ('key_events', {}),
                             ('characters_status', ['Yzur']), ('characters_status', [{'name': 'Yzur'}])):
            with self.subTest(field=field, value=value):
                data = json.loads(GOOD_SUMMARY)
                data[field] = value
                with self.assertRaises(ValueError):
                    reading_summary._clean_content(data)

    def test_gemini_has_explicit_timeout_and_only_one_attempt_per_key(self):
        first = mock.MagicMock()
        first.__enter__.return_value.models.generate_content.side_effect = TimeoutError('timeout')
        second = mock.MagicMock()
        second.__enter__.return_value.models.generate_content.return_value.text = GOOD_SUMMARY
        with mock.patch('google.genai.Client', side_effect=[first, second]) as client:
            raw = reading_summary._call_gemini('Capítulos leídos')
        self.assertEqual(raw, GOOD_SUMMARY)
        self.assertEqual(client.call_count, 2)
        for call in client.call_args_list:
            self.assertEqual(call.kwargs['http_options'].timeout, 20_000)
            self.assertEqual(call.kwargs['http_options'].retry_options.attempts, 1)
        self.assertEqual(first.__enter__.return_value.models.generate_content.call_count, 1)

    @override_settings(DEEPSEEK_API_KEY='deepseek-test')
    def test_deepseek_has_connection_and_read_timeouts(self):
        with mock.patch('requests.post') as post:
            post.return_value.json.return_value = {'choices': [{'message': {'content': GOOD_SUMMARY}}]}
            self.assertEqual(reading_summary._call_deepseek('Texto leído'), GOOD_SUMMARY)
        self.assertEqual(post.call_args.kwargs['timeout'], (5, 25))


class ReadingSummaryAPITests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username='summary-reader', email='summary-reader@example.com', password='x-pass-123')
        self.book = Book.objects.create(title='Yzur', is_published=True, status=Book.StatusChoices.PUBLISHED)
        BookAuthor.objects.create(book=self.book, author=Author.objects.create(full_name='Leopoldo Lugones'))
        for order, text in ((1, 'El narrador presenta a Yzur.'), (2, 'Comienzan las primeras lecciones.'),
                            (3, 'SECRETO DEL CAPÍTULO FUTURO.')):
            Chapter.objects.create(book=self.book, order=order, title=f'Capítulo {order}',
                                   content_html=f'<p>{text}</p>')
        self.inventory = UserInventory.objects.create(
            user=self.user, edition=Edition.objects.create(book=self.book, price=0))
        self.url = f'/api/v1/library/inventory/{self.inventory.pk}/reading-summary/'
        self.catalog_url = f'/api/v1/catalog/books/{self.book.slug}/reading-summary/'
        self.client.force_authenticate(self.user)

    def test_request_returns_generating_without_waiting_and_polling_reuses_one_job(self):
        with mock.patch.object(reading_summary, '_start_background') as start, \
                mock.patch.object(reading_summary, '_call_gemini') as gemini:
            with self.captureOnCommitCallbacks(execute=True):
                requested = self.client.post(self.url, {'up_to_chapter': 2}, format='json')
                polled = self.client.get(self.url, {'up_to_chapter': 2})
                catalog = self.client.get(self.catalog_url, {'up_to_chapter': 2})
        self.assertEqual(requested.status_code, 200)
        self.assertEqual(requested.data['status'], 'generating')
        self.assertEqual(polled.data['status'], 'generating')
        self.assertEqual(catalog.data['status'], 'generating')
        self.assertEqual(start.call_count, 1)
        gemini.assert_not_called()
        self.assertEqual(ChapterProgressSummary.objects.count(), 1)

    def test_generated_summary_is_cached_and_never_sends_future_chapters(self):
        with mock.patch.object(reading_summary, '_start_background'):
            self.client.post(self.url, {'up_to_chapter': 2}, format='json')
        stored = ChapterProgressSummary.objects.get(book=self.book)
        with mock.patch.object(reading_summary, '_call_gemini', return_value=GOOD_SUMMARY) as gemini:
            reading_summary.generate_reading_summary(stored.pk)
            ready = self.client.get(self.url, {'up_to_chapter': 2})
            again = self.client.post(self.catalog_url, {'up_to_chapter': 2}, format='json')
        self.assertEqual(ready.data['status'], 'ready')
        self.assertEqual(again.data['summary'], ready.data['summary'])
        self.assertEqual(gemini.call_count, 1)
        prompt = gemini.call_args.args[0]
        self.assertIn('Comienzan las primeras lecciones.', prompt)
        self.assertIn('Leopoldo Lugones', prompt)
        self.assertNotIn('SECRETO DEL CAPÍTULO FUTURO', prompt)

    def test_provider_failure_returns_safe_fallback_instead_of_leaving_generating(self):
        with mock.patch.object(reading_summary, '_call_gemini', side_effect=TimeoutError('timeout')), \
                mock.patch.object(reading_summary, '_call_deepseek', side_effect=TimeoutError('timeout')):
            result = reading_summary.get_or_create_reading_summary(self.book, 2, run_async=False)
        self.assertEqual(result['status'], 'ready')
        self.assertNotIn('SECRETO DEL CAPÍTULO FUTURO', json.dumps(result, ensure_ascii=False))
        self.assertIn('Leopoldo Lugones', result['summary']['overview'])
        self.assertEqual(ChapterProgressSummary.objects.get(book=self.book).model_name, 'extractive_fallback')

    def test_zero_based_and_sparse_chapter_orders_use_reader_position_without_spoilers(self):
        for orders in ((0, 1, 2), (10, 30, 60)):
            with self.subTest(orders=orders):
                # Usar otra obra evita las restricciones únicas de filas borradas lógicamente.
                book = Book.objects.create(title=f'Orden {orders[0]}')
                for order, text in zip(orders, ('PRIMER CAPÍTULO.', 'SEGUNDO CAPÍTULO.', 'SECRETO FUTURO.')):
                    Chapter.objects.create(book=book, order=order, content_html=f'<p>{text}</p>')
                with mock.patch.object(reading_summary, '_call_gemini', return_value=GOOD_SUMMARY) as gemini:
                    result = reading_summary.get_or_create_reading_summary(book, 2, run_async=False)
                self.assertEqual(result['status'], 'ready')
                self.assertIn('PRIMER CAPÍTULO.', gemini.call_args.args[0])
                self.assertIn('SEGUNDO CAPÍTULO.', gemini.call_args.args[0])
                self.assertNotIn('SECRETO FUTURO.', gemini.call_args.args[0])
                self.assertIn('### CAPÍTULO 1:', gemini.call_args.args[0])

    def test_malformed_provider_response_uses_other_provider_and_corrupt_cache_is_replaced(self):
        ChapterProgressSummary.objects.create(
            book=self.book, up_to_chapter=2, status=ChapterProgressSummary.Status.READY,
            content={'overview': 'Texto', 'plot_recap': 'Esto no es una lista.',
                     'reading_summary_version': reading_summary.SUMMARY_VERSION})
        malformed = json.loads(GOOD_SUMMARY)
        malformed['characters_status'] = ['Yzur']
        with mock.patch.object(reading_summary, '_call_gemini', return_value=json.dumps(malformed)), \
                mock.patch.object(reading_summary, '_call_deepseek', return_value=GOOD_SUMMARY) as deepseek:
            result = reading_summary.get_or_create_reading_summary(self.book, 2, run_async=False)
        self.assertEqual(result['status'], 'ready')
        deepseek.assert_called_once()
        self.assertEqual(ChapterProgressSummary.objects.get(book=self.book).model_name, 'deepseek')

    def test_previous_version_cache_is_regenerated_once_to_remove_possible_spoilers(self):
        legacy = json.loads(GOOD_SUMMARY)
        legacy['plot_recap'] = ['SECRETO DEL CAPÍTULO FUTURO.']
        ChapterProgressSummary.objects.create(
            book=self.book, up_to_chapter=2, status=ChapterProgressSummary.Status.READY, content=legacy)
        with mock.patch.object(reading_summary, '_call_gemini', return_value=GOOD_SUMMARY) as gemini:
            result = reading_summary.get_or_create_reading_summary(self.book, 2, run_async=False)
            cached = reading_summary.get_or_create_reading_summary(self.book, 2)
        self.assertEqual(gemini.call_count, 1)
        self.assertEqual(cached, result)
        self.assertNotIn('SECRETO DEL CAPÍTULO FUTURO', json.dumps(result))

    def test_stale_generation_can_restart_and_old_job_cannot_overwrite_retry(self):
        stored = ChapterProgressSummary.objects.create(book=self.book, up_to_chapter=2)
        old_claim = timezone.now() - reading_summary.STALE_AFTER
        ChapterProgressSummary.objects.filter(pk=stored.pk).update(updated_at=old_claim)
        with mock.patch.object(reading_summary, '_start_background') as start:
            with self.captureOnCommitCallbacks(execute=True):
                response = self.client.post(self.url, {'up_to_chapter': 2}, format='json')
        self.assertEqual(response.data['status'], 'generating')
        self.assertEqual(start.call_count, 1)
        with mock.patch.object(reading_summary, '_call_gemini') as gemini:
            reading_summary.generate_reading_summary(stored.pk, old_claim)
        gemini.assert_not_called()

    def test_failed_worker_is_reported_and_empty_chapters_do_not_start_jobs(self):
        failed = ChapterProgressSummary.objects.create(
            book=self.book, up_to_chapter=2, status=ChapterProgressSummary.Status.FAILED,
            error='No se pudo generar el resumen. Intenta de nuevo.')
        with mock.patch.object(reading_summary, '_start_background') as start:
            response = self.client.get(self.url, {'up_to_chapter': 2})
        self.assertEqual(response.data['status'], 'unavailable')
        self.assertEqual(response.data['message'], failed.error)
        start.assert_not_called()
        self.book.chapters.update(content_html='')
        with mock.patch.object(reading_summary, '_start_background') as start:
            response = self.client.post(self.url, {'up_to_chapter': 1}, format='json')
        self.assertEqual(response.data['status'], 'unavailable')
        start.assert_not_called()
