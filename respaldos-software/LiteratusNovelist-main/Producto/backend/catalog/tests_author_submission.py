"""Publicar una obra como autor: envío, curaduría y lectura (catalog/author_submission.py y sus vistas)."""
import importlib.util
import io
import json
import re
import shutil
import tempfile
from pathlib import Path
from unittest import skipUnless
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, override_settings
from PIL import Image
from rest_framework.test import APITestCase

from catalog.author_submission import (
    ManuscriptError, chapters_from_blocks, chapters_from_epub, chapters_from_form, chapters_from_pdf, pdf_blocks,
    sanitize_html, text_of,
)
from catalog.models import Author, Book, BookAuthor, Chapter, Edition, Genre
from library.models import UserInventory

User = get_user_model()
SUBMIT_URL = '/api/v1/catalog/author/submit-book/'
SYNOPSIS = 'Una historia de prueba sobre una biblioteca que guarda los sueños de quienes la visitan.'
PARAGRAPH = 'La niebla cubría el puerto cuando Elena abrió la carta que nadie esperaba recibir aquella noche. '
# PDF impreso desde el navegador: portada, dos capítulos en página nueva, sangría de primera línea y diálogos.
MANUSCRIPT_PDF = Path(__file__).parent / 'test_data' / 'manuscrito.pdf'
HAS_PYPDF = importlib.util.find_spec('pypdf') is not None


def image_bytes(fmt='PNG'):
    buffer = io.BytesIO()
    Image.new('RGB', (40, 60), (120, 30, 30)).save(buffer, format=fmt)
    return buffer.getvalue()


def cover_upload(fmt='PNG'):
    ext = 'jpg' if fmt == 'JPEG' else fmt.lower()
    return SimpleUploadedFile(f'portada.{ext}', image_bytes(fmt), content_type=f'image/{ext}')


def epub_bytes(chapters):
    from ebooklib import epub

    book = epub.EpubBook()
    book.set_identifier('prueba-autor')
    book.set_title('Obra de prueba')
    book.set_language('es')
    items = []
    for index, (title, body) in enumerate(chapters, start=1):
        item = epub.EpubHtml(title=title, file_name=f'capitulo_{index}.xhtml', lang='es')
        item.content = f'<html><body><h1>{title}</h1>{body}</body></html>'
        book.add_item(item)
        items.append(item)
    book.toc = items
    book.add_item(epub.EpubNcx())
    book.add_item(epub.EpubNav())
    book.spine = ['nav', *items]
    buffer = io.BytesIO()
    epub.write_epub(buffer, book)
    return buffer.getvalue()


class ManuscriptParsingTests(SimpleTestCase):
    def test_sanitize_drops_scripts_images_and_attributes(self):
        html = sanitize_html('<p onclick="x()" style="color:red">Hola <script>alert(1)</script>'
                             '<img src="x.png"><a href="javascript:x()">enlace</a></p><!-- nota -->')
        self.assertEqual(html, '<p>Hola enlace</p>')

    def test_form_chapters_are_escaped_paragraphs(self):
        chapters = chapters_from_form([
            {'title': 'Capítulo 1: Inicio', 'content': f'{PARAGRAPH}\n\n<b>Segundo</b> párrafo con suficiente texto.'},
            {'title': '', 'content': '   '},
        ])
        self.assertEqual(len(chapters), 1)
        self.assertEqual(chapters[0]['order'], 1)
        self.assertIn('<h2>Capítulo 1: Inicio</h2>', chapters[0]['content_html'])
        self.assertIn('<p>&lt;b&gt;Segundo&lt;/b&gt; párrafo', chapters[0]['content_html'])
        self.assertEqual(chapters[0]['content_html'].count('<p>'), 2)

    def test_form_without_text_is_rejected(self):
        with self.assertRaises(ManuscriptError):
            chapters_from_form([{'title': 'Vacío', 'content': 'corto'}])
        with self.assertRaises(ManuscriptError):
            chapters_from_form('no es una lista')

    def test_epub_chapters_follow_the_spine_and_are_sanitized(self):
        data = epub_bytes([
            ('Capítulo 1', f'<p>{PARAGRAPH * 2}</p><script>alert(1)</script>'),
            ('Capítulo 2', f'<p onclick="x()">{PARAGRAPH * 3}</p>'),
        ])
        chapters = chapters_from_epub(data)
        self.assertEqual([c['title'] for c in chapters], ['Capítulo 1', 'Capítulo 2'])
        joined = ''.join(c['content_html'] for c in chapters)
        self.assertNotIn('script', joined)
        self.assertNotIn('onclick', joined)

    def test_broken_epub_is_rejected(self):
        with self.assertRaises(ManuscriptError):
            chapters_from_epub(b'esto no es un zip')

    def test_pdf_text_rebuilds_paragraphs_and_cuts_at_headings(self):
        line = 'La niebla cubría el puerto cuando Elena abrió la carta que nadie'
        pages = [
            'Mi novela\n1',
            f'Capítulo 1\n{line}\nesperaba recibir aquella noche de invier-\nno tan larga.\n—¿Quién la trajo?\n{line}\nfinal del párrafo.\nMi novela 2',
            f'{line}\ncontinúa en esta página sin cortar.\nMi novela 3',
            f'CAPÍTULO II\n{line}\notra vez al puerto.\nMi novela 4',
        ]
        blocks = pdf_blocks(pages)
        self.assertIn(('h', 'Capítulo 1'), blocks)
        self.assertIn(('h', 'CAPÍTULO II'), blocks)
        paragraphs = [text for kind, text in blocks if kind == 'p']
        self.assertTrue(any('de invierno tan larga.' in p for p in paragraphs))  # guion de corte unido
        self.assertIn('—¿Quién la trajo?', paragraphs)                            # diálogo aparte
        self.assertFalse(any(re.search(r'Mi novela \d', p) for p in paragraphs))  # pie repetido fuera
        self.assertIn('Mi novela', paragraphs)                                     # la portada se queda
        chapters = chapters_from_blocks(blocks)
        self.assertEqual([c['title'] for c in chapters], ['Capítulo 1', 'CAPÍTULO II'])
        self.assertIn('continúa en esta página', chapters[0]['content_html'])

    def test_pdf_layout_indent_starts_paragraphs_and_margin_blanks_do_not(self):
        body = 'texto de relleno que ocupa el ancho completo de la línea en esta página'
        pages = ['\n'.join(lines) for lines in (
            ['Encabezado de la obra', '',
             f'      Primer párrafo con {body}', f'  y sigue igual de largo, con {body}.',
             f'      Segundo párrafo con {body}', f'  y continúa en la página siguiente sin {body}', ''],
            ['Encabezado de la obra', '', f'  terminar todavía, hasta que por fin {body} acaba.', ''],
            ['Encabezado de la obra', '', f'      Tercer párrafo con {body}.'],
        )]
        paragraphs = [text for kind, text in pdf_blocks(pages) if kind == 'p']
        self.assertEqual(len(paragraphs), 3, paragraphs)
        self.assertIn('sin texto de relleno', paragraphs[1])
        self.assertTrue(paragraphs[1].endswith('acaba.'))

    def test_double_spaced_pdf_blank_lines_do_not_split_paragraphs(self):
        line = 'una línea larga de un manuscrito escrito a doble espacio que no termina aquí'
        page = '\n\n'.join([f'Comienza {line}', line, line, 'y aquí termina el párrafo.', f'Otro {line}', 'fin.'])
        paragraphs = [text for kind, text in pdf_blocks([page]) if kind == 'p']
        self.assertEqual(len(paragraphs), 2, paragraphs)

    @skipUnless(HAS_PYPDF, 'pypdf no instalado')
    def test_real_pdf_becomes_chapters(self):
        chapters = chapters_from_pdf(MANUSCRIPT_PDF.read_bytes(), skip_lines=('El faro de los sueños', 'Ana Pluma'))
        self.assertEqual([c['title'] for c in chapters], ['Capítulo 1: La carta', 'Capítulo 2: El escalón de más'])
        paragraphs = [re.findall(r'<p>(.*?)</p>', c['content_html']) for c in chapters]
        self.assertEqual([len(p) for p in paragraphs], [4, 3])
        self.assertEqual(paragraphs[0][1], '—¿Quién la trajo? —preguntó Elena, sin apartar la vista del horizonte.')
        self.assertEqual(paragraphs[1][1], 'Eran ciento doce: uno más que el día anterior.')
        self.assertNotIn('Ana Pluma', ' '.join(text_of(c['content_html']) for c in chapters))

    def test_pdf_without_headings_is_split_into_parts(self):
        blocks = [('p', PARAGRAPH * 30) for _ in range(30)]  # ~13.500 palabras
        chapters = chapters_from_blocks(blocks)
        self.assertGreater(len(chapters), 1)
        self.assertEqual(chapters[0]['title'], 'Parte 1')

    def test_table_of_contents_is_not_a_chapter_list(self):
        blocks = [('h', 'Capítulo 1'), ('h', 'Capítulo 2'), ('h', 'Capítulo 3'),
                  ('h', 'Capítulo 1'), ('p', PARAGRAPH * 3), ('h', 'Capítulo 2'), ('p', PARAGRAPH * 3)]
        self.assertEqual([c['title'] for c in chapters_from_blocks(blocks)], ['Capítulo 1', 'Capítulo 2'])


class AuthorSubmissionFlowTests(APITestCase):
    def setUp(self):
        cache.clear()
        media = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, media, ignore_errors=True)
        settings_override = override_settings(MEDIA_ROOT=media)
        settings_override.enable()
        self.addCleanup(settings_override.disable)
        upload = patch('catalog.views.upload_to_supabase_if_configured', return_value=True)
        self.upload = upload.start()
        self.addCleanup(upload.stop)

        self.writer = User.objects.create_user(username='escritora', email='e@example.com', password='Clave12345!')
        self.reader = User.objects.create_user(username='lector', email='l@example.com', password='Clave12345!')
        self.admin = User.objects.create_user(username='curador', email='c@example.com', password='Clave12345!',
                                              is_staff=True)
        self.genre = Genre.objects.create(name='Aventura y viajes')

    def submit(self, user=None, **overrides):
        payload = {
            'title': 'El faro de los sueños',
            'author_name': 'Ana Pluma',
            'author_bio': 'Escribe de noche.',
            'synopsis': SYNOPSIS,
            'difficulty_level': 'intermediate',
            'genres': json.dumps([self.genre.name]),
            'tags': 'mar, misterio',
            'submission_declaration': 'true',
            'cover': cover_upload(),
            'chapters': json.dumps([
                {'title': 'Capítulo 1: Inicio', 'order': 1, 'content': f'{PARAGRAPH}\n{PARAGRAPH}'},
                {'title': 'Capítulo 2', 'order': 2, 'content': PARAGRAPH * 2},
            ]),
        }
        payload.update(overrides)
        payload = {k: v for k, v in payload.items() if v is not None}
        self.client.force_authenticate(user or self.writer)
        return self.client.post(SUBMIT_URL, payload, format='multipart')

    def test_manual_submission_creates_a_readable_pending_book(self):
        response = self.submit()
        self.assertEqual(response.status_code, 201, response.data)
        book = Book.objects.get(pk=response.data['book']['id'])
        self.assertEqual(book.status, Book.StatusChoices.PENDING_REVIEW)
        self.assertFalse(book.is_published)
        self.assertEqual(book.submitted_by, self.writer)
        self.assertEqual(response.data['book']['chapters_count'], 2)
        self.assertEqual(list(book.chapters.values_list('order', flat=True)), [1, 2])
        self.assertGreater(book.word_count, 30)
        self.assertEqual(book.editions.count(), 1)
        self.assertEqual(book.editions.first().price, 0)
        self.assertTrue(book.cover_image.name.endswith('.png'))
        self.upload.assert_called_once()
        self.assertEqual(self.upload.call_args.args[1], book.cover_image.name)
        author = book.authors.get()
        self.assertEqual((author.full_name, author.bio), ('Ana Pluma', 'Escribe de noche.'))
        self.assertEqual(set(book.tags.values_list('name', flat=True)), {'mar', 'misterio'})

    def test_epub_submission_extracts_chapters(self):
        data = epub_bytes([('Uno', f'<p>{PARAGRAPH * 2}</p>'), ('Dos', f'<p>{PARAGRAPH * 2}</p>')])
        response = self.submit(chapters=None, epub=SimpleUploadedFile('obra.epub', data, 'application/epub+zip'))
        self.assertEqual(response.status_code, 201, response.data)
        book = Book.objects.get(pk=response.data['book']['id'])
        self.assertEqual(list(book.chapters.values_list('title', flat=True)), ['Uno', 'Dos'])
        self.assertTrue(book.editions.get().file.name.endswith('.epub'))

    def test_unreadable_manuscript_is_rejected_without_creating_anything(self):
        response = self.submit(chapters=None, epub=SimpleUploadedFile('obra.epub', b'basura', 'application/epub+zip'))
        self.assertEqual(response.status_code, 400)
        self.assertIn('EPUB', response.data['message'])
        self.assertFalse(Book.objects.exists())
        self.assertFalse(Author.objects.exists())

    def test_requirements_are_checked_on_the_server(self):
        cases = {
            'cover': {'cover': SimpleUploadedFile('portada.png', b'no es imagen', 'image/png')},
            'genres': {'genres': json.dumps(['Género que no existe'])},
            'synopsis': {'synopsis': 'Muy corta'},
            'difficulty_level': {'difficulty_level': 'imposible'},
            'submission_declaration': {'submission_declaration': 'false'},
            'file': {'chapters': json.dumps([{'title': 'x', 'content': 'corto'}])},
        }
        for field, overrides in cases.items():
            with self.subTest(field=field):
                response = self.submit(**overrides)
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.data['details'])
                self.assertEqual(response.data['message'], response.data['details'][field])
        self.assertFalse(Book.objects.exists())

    @skipUnless(not HAS_PYPDF, 'pypdf instalado')
    def test_pdf_without_pypdf_explains_how_to_send_it(self):
        response = self.submit(chapters=None, pdf_file=SimpleUploadedFile('obra.pdf', b'%PDF-1.4', 'application/pdf'))
        self.assertEqual(response.status_code, 400)
        self.assertIn('EPUB', response.data['message'])

    @skipUnless(HAS_PYPDF, 'pypdf no instalado')
    def test_pdf_submission_extracts_chapters(self):
        pdf = SimpleUploadedFile('obra.pdf', MANUSCRIPT_PDF.read_bytes(), 'application/pdf')
        response = self.submit(title='El faro de los sueños', chapters=None, pdf_file=pdf)
        self.assertEqual(response.status_code, 201, response.data)
        book = Book.objects.get(pk=response.data['book']['id'])
        self.assertEqual(book.chapters.count(), 2)
        self.assertTrue(book.pdf_file.name.endswith('.pdf'))
        self.assertEqual(book.editions.get().format, Edition.FormatChoices.PDF)

    @skipUnless(HAS_PYPDF, 'pypdf no instalado')
    def test_scanned_pdf_without_text_is_rejected(self):
        from pypdf import PdfWriter

        writer, buffer = PdfWriter(), io.BytesIO()
        writer.add_blank_page(width=300, height=400)
        writer.write(buffer)
        response = self.submit(chapters=None, pdf_file=SimpleUploadedFile('obra.pdf', buffer.getvalue(), 'application/pdf'))
        self.assertEqual(response.status_code, 400)
        self.assertIn('escaneado', response.data['message'])

    def test_pen_name_of_a_catalog_author_does_not_take_over_that_author(self):
        classic = Author.objects.create(full_name='Ana Pluma', bio='Autora clásica del catálogo.')
        response = self.submit()
        book = Book.objects.get(pk=response.data['book']['id'])
        author = book.authors.get()
        self.assertNotEqual(author.pk, classic.pk)
        self.assertNotEqual(author.slug, classic.slug)
        classic.refresh_from_db()
        self.assertEqual(classic.bio, 'Autora clásica del catálogo.')
        # La misma autora vuelve a firmar igual: se reutiliza su autor, no se duplica.
        second = self.submit(title='Segunda obra', cover=cover_upload('JPEG'))
        self.assertEqual(Book.objects.get(pk=second.data['book']['id']).authors.get().pk, author.pk)

    def test_pending_book_is_hidden_from_the_catalog_until_approved(self):
        book = Book.objects.get(pk=self.submit().data['book']['id'])
        detail = f'/api/v1/catalog/books/{book.slug}/'

        for user in (None, self.reader):
            self.client.force_authenticate(user)
            listing = self.client.get('/api/v1/catalog/books/')
            self.assertNotIn(book.slug, [b['slug'] for b in listing.data['results']])
            self.assertEqual(self.client.get(detail).status_code, 404)
            self.assertEqual(self.client.get(f'{detail}details/').status_code, 404)
            self.assertEqual(self.client.get('/api/v1/catalog/authors/').data['count'], 0)
        self.assertEqual(self.client.post(f'{detail}purchase/').status_code, 404)

        self.client.force_authenticate(self.writer)
        self.assertEqual(self.client.get(detail).status_code, 200)  # su autora sí la ve
        self.assertEqual(self.client.post(f'{detail}purchase/').status_code, 400)  # pero aún no se adquiere

        self.client.force_authenticate(self.admin)
        with self.captureOnCommitCallbacks(execute=True):  # al confirmar se renueva la caché del catálogo
            approved = self.client.post(f'/api/v1/dashboard/books/{book.pk}/approve/', {'editorial_notes': 'Bien.'}, format='json')
        self.assertEqual(approved.status_code, 200, approved.data)

        self.client.force_authenticate(self.reader)
        listing = self.client.get('/api/v1/catalog/books/')
        self.assertIn(book.slug, [b['slug'] for b in listing.data['results']])
        self.assertEqual(self.client.get('/api/v1/catalog/authors/').data['count'], 1)
        bought = self.client.post(f'{detail}purchase/')
        self.assertEqual(bought.status_code, 201, bought.data)
        inventory = UserInventory.objects.get(user=self.reader, edition__book=book)
        chapters = self.client.get(f'/api/v1/library/inventory/{inventory.pk}/chapters/')
        self.assertEqual(chapters.status_code, 200, chapters.data)

        mine = self.client.get('/api/v1/catalog/author/my-submissions/')
        self.assertEqual(mine.data['count'], 0)  # el lector no envió nada
        self.client.force_authenticate(self.writer)
        mine = self.client.get('/api/v1/catalog/author/my-submissions/')
        self.assertEqual(mine.data['submissions'][0]['status'], 'published')
        self.assertEqual(mine.data['submissions'][0]['editorial_notes'], 'Bien.')

    def test_book_without_chapters_cannot_be_approved(self):
        book = Book.objects.create(title='Solo un PDF', synopsis=SYNOPSIS, is_published=False,
                                   status=Book.StatusChoices.PENDING_REVIEW, submitted_by=self.writer)
        self.client.force_authenticate(self.admin)
        curation = self.client.get('/api/v1/dashboard/curation/')
        row = next(b for b in curation.data['books'] if b['id'] == str(book.pk))
        self.assertFalse(row['requirements_checklist']['content'])
        response = self.client.post(f'/api/v1/dashboard/books/{book.pk}/approve/', {}, format='json')
        self.assertEqual(response.status_code, 400)
        book.refresh_from_db()
        self.assertFalse(book.is_published)

    def test_approval_adds_a_free_edition_when_missing(self):
        book = Book.objects.create(title='Sin edición', synopsis=SYNOPSIS, is_published=False,
                                   status=Book.StatusChoices.PENDING_REVIEW, submitted_by=self.writer)
        BookAuthor.objects.create(book=book, author=Author.objects.create(full_name='Alguien'))
        Chapter.objects.create(book=book, order=1, title='Uno', content_html=f'<p>{PARAGRAPH}</p>')
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(f'/api/v1/dashboard/books/{book.pk}/approve/', {}, format='json').status_code, 200)
        self.assertEqual(Edition.objects.get(book=book).price, 0)
