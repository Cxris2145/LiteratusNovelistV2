"""import_epubs --spine: un capítulo por documento, sin repetir archivos ni publicidad."""
import tempfile
import zipfile
from pathlib import Path

from bs4 import BeautifulSoup
from django.test import SimpleTestCase

from .management.commands.import_epubs import _chapters_spine, _split_by_headings

LONG = 'palabra ' * 80

OPF = """<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf"><manifest>
  <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  <item id="tit" href="Titulo.xhtml" media-type="application/xhtml+xml"/>
  <item id="c1" href="cap%201.xhtml" media-type="application/xhtml+xml"/>
  <item id="c2" href="cap2.xhtml" media-type="application/xhtml+xml"/>
  <item id="ad" href="fin.xhtml" media-type="application/xhtml+xml"/>
  <item id="idx" href="part0099.html" media-type="application/xhtml+xml"/>
</manifest><spine toc="ncx">
  <itemref idref="tit"/><itemref idref="c1"/><itemref idref="c2"/><itemref idref="c1"/><itemref idref="ad"/>
  <itemref idref="idx"/>
</spine></package>"""

NCX = """<?xml version="1.0"?><ncx><navMap>
  <navPoint><navLabel><text>Start</text></navLabel><content src="cap%201.xhtml"/></navPoint>
  <navPoint><navLabel><text>El encuentro</text></navLabel><content src="cap2.xhtml#x"/></navPoint>
</navMap></ncx>"""


def _page(body):
    return f'<html><head><title>t</title></head><body>{body}</body></html>'


class SpineChaptersTests(SimpleTestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.epub = Path(tmp.name) / 'libro.epub'
        with zipfile.ZipFile(self.epub, 'w') as z:
            z.writestr('META-INF/container.xml', '<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>')
            z.writestr('OEBPS/content.opf', OPF)
            z.writestr('OEBPS/toc.ncx', NCX)
            z.writestr('OEBPS/Titulo.xhtml', _page(f'<h1>Portada</h1><p>{LONG}</p>'))
            z.writestr('OEBPS/cap 1.xhtml', _page(f'<p>Uno {LONG}</p>'))
            z.writestr('OEBPS/cap2.xhtml', _page(f'<p>Dos {LONG}</p>'))
            z.writestr('OEBPS/fin.xhtml', _page('<h2>¡Gracias por leer este libro de www.elejandria.com !</h2><p>Visítanos</p>'))
            links = ''.join(f'<p><a href="cap2.xhtml">Capítulo número {n} de la novela</a></p>' for n in range(1, 9))
            z.writestr('OEBPS/part0099.html', _page(f'<p>Table of Contents</p>{links}'))

    def test_one_chapter_per_document_in_spine_order(self):
        chapters = _chapters_spine(self.epub, 'libro')

        self.assertEqual([c['order'] for c in chapters], [1, 2])
        self.assertIn('Uno', chapters[0]['content'])
        self.assertIn('Dos', chapters[1]['content'])
        self.assertNotIn('<head>', chapters[0]['content'])

    def test_titles_come_from_the_toc_when_the_page_has_none(self):
        titles = [c['title'] for c in _chapters_spine(self.epub, 'libro')]
        self.assertEqual(titles, ['Parte 1', 'El encuentro'])

    def test_title_page_source_ad_and_trailing_index_are_left_out(self):
        text = ' '.join(c['content'] for c in _chapters_spine(self.epub, 'libro'))
        self.assertNotIn('Portada', text)
        self.assertNotIn('Visítanos', text)
        self.assertNotIn('Table of Contents', text)


class SplitByHeadingsTests(SimpleTestCase):
    def test_splits_on_chapters_and_folds_part_titles_into_the_next(self):
        body = BeautifulSoup(
            f'<body><div><h2>Primera parte</h2><h3>1. Globo</h3><p>{LONG}</p>'
            f'<h3>2. Isla</h3><p>{LONG}</p><h2>Segunda parte</h2><h3>3. Cueva</h3><p>{LONG}</p></div></body>',
            'html.parser').body

        parts = _split_by_headings(body)

        self.assertEqual([t for t, _ in parts], ['1. Globo', '2. Isla', '3. Cueva'])
        self.assertIn('Primera parte', parts[0][1])
        self.assertIn('Segunda parte', parts[2][1])

    def test_nothing_to_split_without_repeated_headings(self):
        body = BeautifulSoup(f'<body><h2>Único</h2><p>{LONG}</p></body>', 'html.parser').body
        self.assertEqual(_split_by_headings(body), [])
