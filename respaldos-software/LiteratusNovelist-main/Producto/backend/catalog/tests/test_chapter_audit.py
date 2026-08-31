"""
catalog/tests/test_chapter_audit.py

Suite de pruebas automatizadas para auditoría, validación de integridad y prevención de capítulos vacíos.
"""

from django.test import TestCase
from catalog.models import Book, Author, Edition, Chapter
from catalog.audit_engine import (
    is_content_empty_or_trivial,
    clean_chapter_title,
    clean_html_content,
    extract_plain_text,
    audit_book,
)


class ChapterIntegrityTests(TestCase):
    def setUp(self):
        self.author = Author.objects.create(full_name='Franz Kafka')
        self.book = Book.objects.create(
            title='La metamorfosis',
            slug='la-metamorfosis-test',
            status=Book.StatusChoices.PUBLISHED,
            is_published=True,
        )
        self.chapter1 = Chapter.objects.create(
            book=self.book,
            order=1,
            title='Capítulo 1',
            content_html='<p>Una mañana, tras un sueño intranquilo, Gregorio Samsa se despertó convertido en un monstruoso insecto.</p>',
        )
        self.chapter2 = Chapter.objects.create(
            book=self.book,
            order=2,
            title='Capítulo 2',
            content_html='<p>La herida de Gregorio tardó más de un mes en curar.</p>',
        )

    def test_valid_chapters_pass_integrity_check(self):
        """Verifica que capítulos válidos no sean marcados como vacíos ni sospechosos."""
        is_empty, is_short, text_len, reason = is_content_empty_or_trivial(self.chapter1.content_html)
        self.assertFalse(is_empty)
        self.assertFalse(is_short)
        self.assertGreater(text_len, 50)
        self.assertEqual(reason, 'OK')

    def test_empty_and_whitespace_content_detection(self):
        """Verifica que cadenas vacías, espacios o saltos de línea sean detectados como vacíos."""
        empty_cases = [
            '',
            '   ',
            '\n\n\t',
            '<p></p>',
            '<div>   </div>',
            '<br/>',
            '<p><br></p>',
            '\u200b\ufeff',
        ]
        for content in empty_cases:
            is_empty, _, _, _ = is_content_empty_or_trivial(content)
            self.assertTrue(is_empty, f"Falló al detectar como vacío: {repr(content)}")

    def test_svg_and_image_only_detection(self):
        """Verifica que portadas SVG o etiquetas de solo imagen sean detectadas como vacías de texto narrativo."""
        svg_content = '<div><svg width="100" height="200"><image href="cover.jpg"/></svg></div>'
        is_empty, _, _, reason = is_content_empty_or_trivial(svg_content)
        self.assertTrue(is_empty)
        self.assertIn('SVG', reason)

    def test_clean_chapter_title_normalization(self):
        """Verifica que títulos inválidos, nulos o con spam sean normalizados adecuadamente."""
        self.assertEqual(clean_chapter_title(None, order=1), 'Capítulo 1')
        self.assertEqual(clean_chapter_title('', order=2), 'Capítulo 2')
        self.assertEqual(clean_chapter_title('   ', order=3), 'Capítulo 3')
        self.assertEqual(clean_chapter_title('(Sin título)', order=4), 'Capítulo 4')
        self.assertEqual(clean_chapter_title('undefined', order=5), 'Capítulo 5')
        self.assertEqual(clean_chapter_title('¡Gracias por leer este libro de www.elejandria.com!', book_title='El talento', order=1), 'El talento')
        self.assertEqual(clean_chapter_title('Capítulo V — La llegada', order=5), 'Capítulo V — La llegada')

    def test_clean_html_content_preserves_literary_formatting(self):
        """Verifica que se preserven intactos párrafos, citas y diálogos literarios."""
        raw_html = '<body><p>—¿Quién anda ahí? —preguntó él con voz temblorosa.</p><script>alert("hack");</script></body>'
        cleaned = clean_html_content(raw_html, 'mi-libro')
        self.assertIn('—¿Quién anda ahí? —preguntó él con voz temblorosa.', cleaned)
        self.assertNotIn('script', cleaned)

    def test_chapter_ordering_and_sequentiality(self):
        """Verifica que los capítulos mantengan un orden secuencial 1..N sin huecos ni duplicados."""
        orders = list(self.book.chapters.values_list('order', flat=True).order_by('order'))
        self.assertEqual(orders, [1, 2])
        self.assertEqual(len(orders), len(set(orders)))

    def test_all_chapters_have_valid_book_association(self):
        """Verifica que todo capítulo esté vinculado a un libro válido."""
        for chapter in Chapter.objects.all():
            self.assertIsNotNone(chapter.book)
            self.assertTrue(Book.objects.filter(pk=chapter.book_id).exists())
