import json
from datetime import date
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from catalog import summary
from catalog.models import Book, BookSummary, Chapter

User = get_user_model()

GOOD_SUMMARY = json.dumps({
    'overview': 'Una novela sobre la ceguera y la belleza.',
    'plot': ['Pablo, ciego, recorre las minas con Marianela.', 'La operación le devuelve la vista.'],
    'characters': [{'name': 'Marianela', 'role': 'La lazarilla.'}, {'name': '', 'role': 'sin nombre'}],
    'themes': ['La belleza', '  '],
})


class SummaryHelpersTests(SimpleTestCase):
    def test_parts_keep_whole_chapters_and_cut_only_oversized_ones(self):
        parts = summary.split_parts(['a' * 4, 'b' * 4, 'c' * 11], limit=10)
        self.assertEqual(parts, ['aaaa\n\nbbbb', 'c' * 10, 'c'])

    def test_clean_content_trims_and_requires_overview_and_plot(self):
        content = summary.clean_content(GOOD_SUMMARY)
        self.assertEqual(content['characters'], [{'name': 'Marianela', 'role': 'La lazarilla.'}])
        self.assertEqual(content['themes'], ['La belleza'])
        with self.assertRaises(ValueError):
            summary.clean_content(json.dumps({'overview': 'Algo', 'plot': []}))


@override_settings(GOOGLE_API_KEY='test-key', GOOGLE_API_KEY_2=None, BOOK_SUMMARY_USER_DAILY=5)
class BookSummaryAPITests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='lectora', email='lectora@example.com', password='x-pass-123')
        self.book = self.make_book('Marianela')
        # La generación corre en un hilo; en los tests corre en la misma petición.
        patcher = mock.patch.object(summary, '_start_background', side_effect=summary.generate_summary)
        patcher.start()
        self.addCleanup(patcher.stop)

    def make_book(self, title, **fields):
        book = Book.objects.create(title=title, status=Book.StatusChoices.PUBLISHED, is_published=True, **fields)
        Chapter.objects.create(book=book, order=1, title='I', content_html='<p>Pablo era ciego.</p>')
        Chapter.objects.create(book=book, order=2, title='II', content_html='<p>Marianela lo guiaba.</p>')
        return book

    def url(self, book=None):
        return f'/api/v1/catalog/books/{(book or self.book).slug}/summary/'

    def test_generates_once_and_reuses_it_for_every_reader(self):
        other = User.objects.create_user(username='otro', email='otro@example.com', password='x-pass-123')
        with mock.patch.object(summary, '_call_gemini', return_value=(GOOD_SUMMARY, 1200, 300)) as gemini:
            missing = self.client.get(self.url())
            self.client.force_authenticate(self.user)
            requested = self.client.post(self.url())
            self.client.force_authenticate(other)
            again = self.client.post(self.url())
            self.client.force_authenticate(None)
            public = self.client.get(self.url())

        self.assertEqual(missing.data, {'status': 'missing'})
        self.assertEqual(requested.data['status'], 'generating')
        self.assertEqual(again.data['status'], 'ready')
        self.assertEqual(public.data['summary']['overview'], 'Una novela sobre la ceguera y la belleza.')
        self.assertEqual(gemini.call_count, 1)
        prompt_text = gemini.call_args.args[1]
        self.assertIn('Obra: «Marianela»', prompt_text)
        self.assertIn('Pablo era ciego.', prompt_text)
        stored = BookSummary.objects.get(book=self.book)
        self.assertEqual((stored.input_tokens, stored.output_tokens, stored.requested_by), (1200, 300, self.user))

    def test_long_books_are_summarized_by_parts(self):
        self.client.force_authenticate(self.user)
        replies = [('Resumen parte uno', 10, 5), ('Resumen parte dos', 10, 5), (GOOD_SUMMARY, 10, 5)]
        with mock.patch.object(summary, 'MAX_SINGLE_PASS_CHARS', 30), mock.patch.object(summary, 'PART_CHARS', 30), \
                mock.patch.object(summary, '_call_gemini', side_effect=replies) as gemini:
            self.client.post(self.url())

        self.assertEqual(gemini.call_count, 3)
        self.assertIn('Resumen parte dos', gemini.call_args.args[1])
        self.assertEqual(BookSummary.objects.get(book=self.book).status, 'ready')

    def test_failure_is_reported_and_can_be_retried_later(self):
        self.client.force_authenticate(self.user)
        with mock.patch.object(summary, '_call_gemini', side_effect=RuntimeError('cuota')):
            self.client.post(self.url())
        failed = self.client.get(self.url())

        BookSummary.objects.filter(book=self.book).update(updated_at=summary.timezone.now() - summary.RETRY_FAILED_AFTER)
        with mock.patch.object(summary, '_call_gemini', return_value=(GOOD_SUMMARY, 10, 5)):
            self.client.post(self.url())

        self.assertEqual((failed.data['status'], failed.data['reason']), ('unavailable', 'failed'))
        self.assertEqual(self.client.get(self.url()).data['status'], 'ready')

    @override_settings(BOOK_SUMMARY_USER_DAILY=1)
    def test_daily_limit_only_counts_new_books(self):
        second = self.make_book('Doña Perfecta')
        self.client.force_authenticate(self.user)
        with mock.patch.object(summary, '_call_gemini', return_value=(GOOD_SUMMARY, 10, 5)):
            self.client.post(self.url())
            blocked = self.client.post(self.url(second))
            cached = self.client.post(self.url())

        self.assertEqual((blocked.data['status'], blocked.data['reason']), ('unavailable', 'daily_limit'))
        self.assertEqual(cached.data['status'], 'ready')

    def test_requires_login_to_ask_and_respects_age_restriction(self):
        adult_book = self.make_book('Obra para mayores', min_age=18)
        anonymous = self.client.post(self.url())
        self.client.force_authenticate(self.user)
        without_birth_date = self.client.get(self.url(adult_book))
        self.user.profile.birth_date = date(date.today().year - 15, 1, 1)
        self.user.profile.save()
        minor = self.client.post(self.url(adult_book))

        self.assertEqual(anonymous.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(without_birth_date.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(minor.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(BookSummary.objects.exists())

    @override_settings(GOOGLE_API_KEY=None)
    def test_unavailable_without_gemini_keys(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(self.url())
        self.assertEqual((response.data['status'], response.data['reason']), ('unavailable', 'not_configured'))
