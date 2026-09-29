import gzip
import json
from dataclasses import dataclass
from io import StringIO
from unittest import mock, skipUnless

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import SimpleTestCase, TestCase
from rest_framework import status
from rest_framework.test import APITestCase

from catalog import vocabulary
from catalog.models import Book, BookVocabulary, Chapter, Edition
from library.models import UserInventory

User = get_user_model()

try:
    import spacy
    spacy.load(vocabulary.SPACY_MODEL)
    HAS_SPACY = True
except Exception:
    HAS_SPACY = False


@dataclass
class FakeToken:
    text: str
    lemma_: str
    pos_: str

    @property
    def is_alpha(self):
        return self.text.isalpha()


class FakeNLP:
    """Analizador de mentira: cada palabra conocida trae su lema y tipo; el resto es puntuación."""

    meta = {'name': 'core_news_fake', 'version': '0.0'}

    def __init__(self, analysis):
        self.analysis = analysis

    def pipe(self, texts, batch_size=1):
        for text in texts:
            yield [FakeToken(word, *self.analysis.get(word, (word, 'PUNCT')))
                   for word in text.replace('.', ' . ').replace(',', ' , ').split()]


class BuildEntriesTests(SimpleTestCase):
    ANALYSIS = {
        'Rosa': ('Rosa', 'PROPN'), 'rosa': ('rosa', 'NOUN'), 'rosas': ('rosa', 'NOUN'),
        'Pudo': ('poder', 'AUX'), 'puede': ('poder', 'AUX'), 'había': ('haber', 'AUX'),
        'abría': ('aber', 'VERB'), 'buen': ('buen', 'ADJ'), 'día': ('día', 'NOUN'),
        'decirle': ('decir él', 'VERB'), 'Nela': ('Nela', 'PROPN'), 'nela': ('nela', 'PROPN'),
        'la': ('el', 'DET'),
    }

    def build(self, *chapters):
        return vocabulary.build_entries(list(chapters), FakeNLP(self.ANALYSIS))

    def test_groups_forms_by_lemma_and_orders_by_frequency(self):
        entries, counted = self.build('<p>Pudo decirle. Nela puede. Nela.</p>')
        self.assertEqual(entries[0], ['nela', 'N', 2, ['nela']])
        self.assertIn(['poder', 'V', 2, ['pudo', 'puede']], entries)
        self.assertIn(['decir', 'V', 1, ['decirle']], entries)  # sin el pronombre enclítico
        self.assertEqual(counted, 5)

    def test_skips_auxiliary_haber_and_fixes_known_lemma_errors(self):
        entries, _ = self.build('<p>había abría buen día</p>')
        lemmas = {(lemma, kind) for lemma, kind, *_ in entries}
        self.assertNotIn(('haber', 'V'), lemmas)
        self.assertIn(('abrir', 'V'), lemmas)
        self.assertIn(('bueno', 'A'), lemmas)

    def test_capitalized_common_word_is_not_a_proper_noun(self):
        # "Rosa" al comenzar un verso sale como nombre propio, pero el libro la usa como flor.
        entries, _ = self.build('<p>Rosa</p><p>rosas rosa</p>')
        self.assertEqual(entries, [['rosa', 'S', 3, ['rosa', 'rosas']]])

    def test_lowercase_proper_nouns_are_model_errors(self):
        entries, _ = self.build('<p>nela Nela</p>')
        self.assertEqual(entries, [['nela', 'N', 1, ['nela']]])

    def test_reads_the_same_text_the_reader_shows(self):
        entries, _ = self.build('<p>Nela<script>Rosa</script></p>')
        self.assertEqual([e[0] for e in entries], ['nela'])


class BuildBookVocabularyTests(TestCase):
    def setUp(self):
        self.book = Book.objects.create(title='Marianela', status=Book.StatusChoices.PUBLISHED, is_published=True)
        Chapter.objects.create(book=self.book, order=1, title='I', content_html='<p>Nela puede.</p>')
        self.nlp = FakeNLP(BuildEntriesTests.ANALYSIS)

    def test_saves_compressed_document_and_rebuild_reuses_the_row(self):
        saved = vocabulary.build_book_vocabulary(self.book, self.nlp)
        document = json.loads(gzip.decompress(bytes(saved.data)))
        self.assertEqual(document['status'], 'ready')
        self.assertEqual(document['entries'], [['nela', 'N', 1, ['nela']], ['poder', 'V', 1, ['puede']]])
        self.assertEqual((saved.lemma_count, saved.word_count), (2, 2))
        self.assertEqual(saved.engine, 'spacy-core_news_fake-0.0')

        saved.delete()  # borrado lógico
        again = vocabulary.build_book_vocabulary(self.book, self.nlp)
        self.assertEqual(again.pk, saved.pk)
        self.assertIsNone(again.deleted_at)
        self.assertEqual(BookVocabulary.all_objects.count(), 1)

    def test_command_builds_missing_books_only(self):
        vocabulary.build_book_vocabulary(self.book, self.nlp)
        other = Book.objects.create(title='María', status=Book.StatusChoices.PUBLISHED, is_published=True)
        Chapter.objects.create(book=other, order=1, title='I', content_html='<p>Nela.</p>')

        with mock.patch('catalog.vocabulary.load_nlp', return_value=self.nlp):
            out = StringIO()
            call_command('build_vocabulary', '--missing', stdout=out)
        self.assertIn('[1/1]', out.getvalue())
        self.assertTrue(BookVocabulary.objects.filter(book=other).exists())

    @skipUnless(HAS_SPACY, 'spaCy y es_core_news_sm no están instalados')
    def test_real_spanish_model(self):
        entries, _ = vocabulary.build_entries(
            ['<p>Nela murió en el puerto. Pudo haberla amado, pero murió sola.</p>'], vocabulary.load_nlp())
        by_lemma = {lemma: (kind, count) for lemma, kind, count, _ in entries}
        self.assertEqual(by_lemma['morir'], ('V', 2))
        self.assertEqual(by_lemma['puerto'], ('S', 1))
        self.assertEqual(by_lemma['nela'][0], 'N')


class VocabularyAPITests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='lector', email='lector@example.com', password='x-pass-123')
        self.book = Book.objects.create(title='Marianela', status=Book.StatusChoices.PUBLISHED, is_published=True)
        self.edition = Edition.objects.create(book=self.book, price=0)
        Chapter.objects.create(book=self.book, order=1, title='I', content_html='<p>Nela puede.</p>')
        self.inventory = UserInventory.objects.create(user=self.user, edition=self.edition)
        self.url = f'/api/v1/library/inventory/{self.inventory.pk}/vocabulary/'
        self.client.force_authenticate(self.user)

    def test_not_generated_yet(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.data['status'], 'unavailable')

    def test_returns_the_saved_vocabulary(self):
        vocabulary.build_book_vocabulary(self.book, FakeNLP(BuildEntriesTests.ANALYSIS))

        plain = self.client.get(self.url)
        self.assertEqual(plain.status_code, status.HTTP_200_OK)
        self.assertNotIn('Content-Encoding', plain)
        self.assertEqual(json.loads(plain.content)['lemma_count'], 2)

        compressed = self.client.get(self.url, HTTP_ACCEPT_ENCODING='gzip, deflate, br')
        self.assertEqual(compressed['Content-Encoding'], 'gzip')
        self.assertEqual(json.loads(gzip.decompress(compressed.content))['entries'][0][0], 'nela')

    def test_other_readers_cannot_use_this_inventory(self):
        stranger = User.objects.create_user(username='otro', email='otro@example.com', password='x-pass-123')
        self.client.force_authenticate(stranger)
        self.assertEqual(self.client.get(self.url).status_code, status.HTTP_404_NOT_FOUND)
