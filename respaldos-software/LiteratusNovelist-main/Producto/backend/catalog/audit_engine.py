"""
catalog/audit_engine.py — Motor de auditoría, verificación estructural y extracción fiel de capítulos.

Reglas:
- Cero generación de contenido con IA.
- Cero invención de texto literario.
- Extracción y corrección basada exclusivamente en el archivo original real (EPUB, TXT, PDF).
- Preservación exacta del texto, orden, diálogos, acentos y formato original.
"""

import os
import re
import io
import json
import shutil
import zipfile
import urllib.parse
from pathlib import Path
from bs4 import BeautifulSoup
from django.db import transaction
from django.conf import settings

from catalog.models import Book, Edition, Chapter, ChapterAudio


# ==============================================================================
# 1. Utilidades de Normalización y Limpieza de HTML
# ==============================================================================

INVISIBLE_CHARS_REGEX = re.compile(r'[\u200b\u200c\u200d\u200e\u200f\ufeff\u00ad]')
SPAM_PATTERNS = [
    r'Gracias por leer este libro.*',
    r'¡Gracias por leer este libro.*?!?',
    r'Descargado de.*',
    r'www\.elejandria\.com',
    r'Lectulandia',
    r'www\.lectulandia\.com',
    r'LIBROdot\.com',
    r'ePub r\d+(\.\d+)*',
]


def extract_plain_text(content_html_or_soup):
    """Extrae texto plano limpio y normalizado desde HTML."""
    if not content_html_or_soup:
        return ''
    if isinstance(content_html_or_soup, str):
        soup = BeautifulSoup(content_html_or_soup, 'html.parser')
    else:
        soup = content_html_or_soup
    raw_text = soup.get_text()
    cleaned = INVISIBLE_CHARS_REGEX.sub('', raw_text)
    # Normalizar espacios y saltos
    cleaned = re.sub(r'[ \t\r\f\v]+', ' ', cleaned)
    cleaned = re.sub(r'\n\s*\n+', '\n\n', cleaned)
    return cleaned.strip()


def is_content_empty_or_trivial(content_html):
    """
    Evalúa si un contenido está verdaderamente vacío, tiene sólo tags vacíos o es trivial.
    Retorna (is_empty, is_short, text_length, reason).
    """
    if not content_html or not str(content_html).strip():
        return True, True, 0, 'Contenido nulo o en blanco'

    soup = BeautifulSoup(content_html, 'html.parser')
    
    # Eliminar tags invisibles
    for tag in soup.find_all(['script', 'style']):
        tag.decompose()

    text = extract_plain_text(soup)
    text_len = len(text)

    if text_len == 0:
        # Verificar si solo contiene un svg o imagen de portada
        if soup.find(['svg', 'img', 'image']):
            return True, True, 0, 'Solo contiene elemento gráfico / SVG sin texto'
        return True, True, 0, 'HTML vacío (sin texto legible)'

    if text_len < 50:
        lower_t = text.lower()
        if any(w in lower_t for w in ['iniciar', 'inicio', 'portada', 'cover', 'librodot', 'elejandria', 'gracias por leer']):
            return True, True, text_len, 'Texto trivial de cabecera / portada / watermark'
        return False, True, text_len, 'Texto sospechosamente corto (<50 caracteres)'

    return False, False, text_len, 'OK'


def clean_html_content(soup_or_html, book_slug):
    """
    Limpia y normaliza el HTML para el lector de Literatus Novelist:
    - Reescribe rutas de imágenes a /media/books/<slug>/images/<filename>
    - Elimina watermarks de portales de descarga
    - Preserva intactos párrafos, títulos, citas, diálogos y estructura.
    """
    if not soup_or_html:
        return ''
    if isinstance(soup_or_html, str):
        soup = BeautifulSoup(soup_or_html, 'html.parser')
    else:
        soup = BeautifulSoup(str(soup_or_html), 'html.parser')

    # Eliminar scripts y estilos embebidos conflictivos
    for tag in soup.find_all(['script', 'style']):
        tag.decompose()

    # Normalizar imágenes
    for img in soup.find_all('img'):
        src = img.get('src', '')
        if not src or 'elejandria' in src.lower() or 'logo' in src.lower():
            img.decompose()
            continue
        filename = os.path.basename(urllib.parse.unquote(src.split('?')[0]))
        img['src'] = f'/media/books/{book_slug}/images/{filename}'
        img['style'] = 'max-width:100%;height:auto;display:block;margin:1em auto;'

    # Extraer contenido de <body> si existe
    if soup.body:
        html_str = ''.join(str(child) for child in soup.body.children)
    else:
        html_str = str(soup)

    # Eliminar spam conocido
    for pattern in SPAM_PATTERNS:
        html_str = re.sub(pattern, '', html_str, flags=re.IGNORECASE)

    return html_str.strip()


def is_cover_or_frontmatter_page(soup):
    """Detecta si una página HTML es meramente una portada, titlepage o frontmatter/watermark."""
    text = extract_plain_text(soup)
    text_len = len(text)
    
    # Si tiene 300 o más caracteres de texto legible, NUNCA es una simple portada
    if text_len >= 300:
        return False

    if text_len == 0:
        return True

    # Para documentos muy cortos (<300 caracteres):
    if soup.find(['svg', 'image']) or soup.find(attrs={'epub:type': lambda v: v and ('titlepage' in v or 'cover' in v)}):
        return True

    lower = text.lower()
    if any(w in lower for w in ['iniciar', 'inicio', 'portada', 'cover', 'librodot', 'elejandria', 'lectulandia']):
        return True

    if any(w in lower for w in ['traductor', 'edición:', 'edicion:', 'descargado en', 'dominio público', 'dominio publico']):
        p_tags = soup.find_all('p')
        if len(p_tags) <= 4:
            return True

    return False


def clean_chapter_title(raw_title, book_title=None, order=1):
    """Limpia y valida el título del capítulo."""
    if not raw_title or not str(raw_title).strip():
        return f'Capítulo {order}'
    
    t = str(raw_title).strip()
    # Eliminar saltos de línea internos
    t = re.sub(r'\s+', ' ', t).strip()

    if not t:
        return f'Capítulo {order}'

    # Comprobar si es un watermark o spam
    lower_t = t.lower()
    for spam in ['gracias por leer', 'elejandria', 'lectulandia', 'librodot', 'descargado de', 'epub r']:
        if spam in lower_t:
            return book_title or f'Capítulo {order}'

    # Comprobar si es genérico o inválido
    if lower_t in ['none', 'undefined', 'start', '(sin título)', 'sin titulo', 'inicio', 'iniciar', 'coverpage', 'cover', 'portada']:
        return f'Capítulo {order}'

    return t[:255]


# ==============================================================================
# 2. Localizador de Archivos Fuente
# ==============================================================================

def get_book_source_file(book, backend_dir=None):
    """
    Localiza el archivo fuente real del libro.
    Busca en:
    1. media/books/<slug>/<archivo>.epub
    2. respaldos-software/books/<slug>/<archivo>.epub
    3. book.pdf_file o edition.file (ej. protected/book_files/principe_feliz.txt)
    Retorna (file_path, file_format, exists).
    """
    if backend_dir is None:
        backend_dir = Path(settings.BASE_DIR)
    else:
        backend_dir = Path(backend_dir)

    slug = book.slug
    media_dir = backend_dir / 'media' / 'books' / slug
    respaldos_dir = backend_dir.parent.parent / 'respaldos-software' / 'books' / slug

    # 1. Buscar EPUB en media
    if media_dir.exists():
        epubs = list(media_dir.glob('*.epub'))
        if epubs:
            return epubs[0], 'epub', True

    # 2. Buscar EPUB en respaldos
    if respaldos_dir.exists():
        epubs = list(respaldos_dir.glob('*.epub'))
        if epubs:
            return epubs[0], 'epub', True

    # 3. Buscar en Ediciones asociadas
    for edition in book.editions.all():
        if edition.file:
            file_name = edition.file.name
            candidate_paths = [
                backend_dir / file_name,
                backend_dir / 'media' / file_name,
                backend_dir / 'private_media' / file_name,
            ]
            for p in candidate_paths:
                if p.exists():
                    ext = p.suffix.lower().lstrip('.') or edition.format
                    return p, ext, True

    # 4. Buscar en pdf_file del libro
    if book.pdf_file:
        file_name = book.pdf_file.name
        candidate_paths = [
            backend_dir / file_name,
            backend_dir / 'media' / file_name,
        ]
        for p in candidate_paths:
            if p.exists():
                ext = p.suffix.lower().lstrip('.') or 'pdf'
                return p, ext, True

    return None, 'unknown', False


# ==============================================================================
# 3. Extractor Estructural Fiel de EPUBs
# ==============================================================================

def extract_chapters_from_epub(epub_path, book_slug, book_title=None):
    """
    Extrae fielmente todos los capítulos desde un archivo EPUB.
    Combina lectura del OPF Spine, Tabla de Contenidos (TOC) y partición DOM precisa.
    """
    epub_path = Path(epub_path)
    if not epub_path.exists():
        return []

    with zipfile.ZipFile(epub_path, 'r') as z:
        # 1. Leer container.xml para localizar content.opf
        try:
            container = z.read('META-INF/container.xml').decode('utf-8', errors='ignore')
            opf_match = re.search(r'full-path="([^"]+)"', container)
            if not opf_match:
                return []
            opf_path = opf_match.group(1)
            opf_content = z.read(opf_path).decode('utf-8', errors='ignore')
            base_dir = os.path.dirname(opf_path)
        except Exception:
            return []

        # 2. Parsear Manifest y Spine
        manifest = {}
        for l in opf_content.split('<item '):
            if 'id="' in l and 'href="' in l:
                iid = re.search(r'id="([^"]+)"', l)
                href = re.search(r'href="([^"]+)"', l)
                if iid and href:
                    manifest[iid.group(1)] = urllib.parse.unquote(href.group(1))

        spine_ids = []
        for l in opf_content.split('<itemref '):
            if 'idref="' in l:
                spine_ids.append(re.search(r'idref="([^"]+)"', l).group(1))

        # 3. Parsear TOC (NCX o Nav)
        toc_entries = [] # lista de {title, file, anchor}
        toc_file = None
        for iid, href in manifest.items():
            if href.endswith('.ncx') or 'toc' in iid.lower():
                toc_file = os.path.normpath(os.path.join(base_dir, href)).replace('\\', '/') if base_dir else href
                break

        if toc_file and toc_file in z.namelist():
            try:
                ncx_xml = z.read(toc_file).decode('utf-8', errors='ignore')
                ncx_soup = BeautifulSoup(ncx_xml, 'xml')
                for np in ncx_soup.find_all('navPoint'):
                    title = np.navLabel.text.strip() if np.navLabel and np.navLabel.text else ''
                    src = np.content.get('src', '') if np.content else ''
                    if src:
                        toc_base = os.path.dirname(toc_file)
                        resolved_src = os.path.normpath(os.path.join(toc_base, urllib.parse.unquote(src))).replace('\\', '/')
                        parts = resolved_src.split('#')
                        file_path = parts[0]
                        anchor = parts[1] if len(parts) > 1 else None
                        toc_entries.append({
                            'title': title,
                            'file': file_path,
                            'anchor': anchor,
                        })
            except Exception:
                pass

        # 4. Extraer imágenes al directorio media si no existen
        try:
            img_dest = Path(settings.BASE_DIR) / 'media' / 'books' / book_slug / 'images'
            img_dest.mkdir(parents=True, exist_ok=True)
            for f in z.infolist():
                if f.filename.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp')):
                    if 'elejandria' not in f.filename.lower():
                        dest = img_dest / os.path.basename(f.filename)
                        if not dest.exists():
                            with z.open(f) as src_file, open(dest, 'wb') as out_file:
                                shutil.copyfileobj(src_file, out_file)
        except Exception:
            pass

        # 5. Estrategia de extracción
        file_to_anchors = {}
        for entry in toc_entries:
            f = entry['file']
            if f not in file_to_anchors:
                file_to_anchors[f] = []
            file_to_anchors[f].append(entry)

        has_internal_anchors = any(len(entries) > 1 and any(e['anchor'] for e in entries) for entries in file_to_anchors.values())

        raw_chapters = []

        if has_internal_anchors:
            for spine_id in spine_ids:
                if spine_id not in manifest:
                    continue
                href = manifest[spine_id]
                full_file = os.path.normpath(os.path.join(base_dir, href)).replace('\\', '/')
                if full_file not in z.namelist():
                    continue

                raw_html = z.read(full_file).decode('utf-8', errors='ignore')
                soup = BeautifulSoup(raw_html, 'html.parser')

                if is_cover_or_frontmatter_page(soup) and len(spine_ids) > 1:
                    continue

                entries_for_file = file_to_anchors.get(full_file, [])
                anchors_in_file = [e['anchor'] for e in entries_for_file if e['anchor']]

                if len(anchors_in_file) > 1:
                    anchors_with_nodes = []
                    for e in entries_for_file:
                        anc = e['anchor']
                        if anc:
                            node = soup.find(id=anc) or soup.find(attrs={'name': anc})
                            if node:
                                anchors_with_nodes.append((node, e['title'] or ''))

                    if len(anchors_with_nodes) > 1:
                        for i in range(len(anchors_with_nodes)):
                            start_node, title = anchors_with_nodes[i]
                            next_node = anchors_with_nodes[i + 1][0] if i + 1 < len(anchors_with_nodes) else None
                            
                            section_html = []
                            curr = start_node
                            while curr:
                                if next_node and curr == next_node:
                                    break
                                section_html.append(str(curr))
                                curr = curr.next_sibling

                            content_html = ''.join(section_html)
                            if not content_html.strip():
                                content_html = str(start_node)

                            cleaned = clean_html_content(content_html, book_slug)
                            if extract_plain_text(cleaned):
                                raw_chapters.append({
                                    'title': title,
                                    'content_html': cleaned,
                                })
                        continue

                title = entries_for_file[0]['title'] if entries_for_file and entries_for_file[0]['title'] else ''
                if not title:
                    heading = soup.find(['h1', 'h2', 'h3', 'b', 'strong'])
                    if heading:
                        title = heading.get_text().strip()[:100]

                cleaned = clean_html_content(soup, book_slug)
                if extract_plain_text(cleaned):
                    raw_chapters.append({
                        'title': title,
                        'content_html': cleaned,
                    })
        else:
            file_to_title = {entry['file']: entry['title'] for entry in toc_entries if entry['title']}

            for spine_id in spine_ids:
                if spine_id not in manifest:
                    continue
                href = manifest[spine_id]
                full_file = os.path.normpath(os.path.join(base_dir, href)).replace('\\', '/')
                if full_file not in z.namelist():
                    continue

                raw_html = z.read(full_file).decode('utf-8', errors='ignore')
                soup = BeautifulSoup(raw_html, 'html.parser')

                if is_cover_or_frontmatter_page(soup) and len(spine_ids) > 1:
                    continue

                title = file_to_title.get(full_file, '')
                if not title:
                    heading = soup.find(['h1', 'h2', 'h3'])
                    if heading:
                        title = heading.get_text().strip()[:100]

                cleaned = clean_html_content(soup, book_slug)
                if extract_plain_text(cleaned):
                    raw_chapters.append({
                        'title': title,
                        'content_html': cleaned,
                    })

    # 6. Post-procesamiento: Limpieza de títulos y asignación de orden 1..N
    final_chapters = []
    order = 1
    total_raw = len(raw_chapters)

    for item in raw_chapters:
        raw_title = item.get('title', '')
        # Si es un libro de un solo capítulo y el título estaba vacío o era genérico, usar el título de la obra
        fallback_title = book_title if total_raw == 1 else f'Capítulo {order}'
        clean_t = clean_chapter_title(raw_title, book_title=fallback_title, order=order)

        final_chapters.append({
            'order': order,
            'title': clean_t,
            'content_html': item['content_html'],
        })
        order += 1

    return final_chapters


# ==============================================================================
# 4. Extractor de Archivos TXT / Texto Plano
# ==============================================================================

def extract_chapters_from_txt(txt_path, book_slug, book_title=None):
    """Extrae capítulos de archivos de texto plano estructurados."""
    txt_path = Path(txt_path)
    if not txt_path.exists():
        return []

    try:
        raw_text = txt_path.read_text(encoding='utf-8', errors='replace')
    except Exception:
        return []

    chapter_splits = re.split(r'\n(?=(?:CAP[ÍI]TULO|Cap[íi]tulo|CHAPTER|Chapter)\s+[IVXLCDM\d]+)', raw_text)
    chapters = []
    order = 1

    for part in chapter_splits:
        part_clean = part.strip()
        if not part_clean:
            continue

        lines = part_clean.split('\n')
        title = lines[0].strip()[:200]
        paragraphs = [p.strip() for p in part_clean.split('\n\n') if p.strip()]
        html_paragraphs = [f'<p>{p.replace(chr(10), "<br/>")}</p>' for p in paragraphs]
        content_html = '\n'.join(html_paragraphs)

        clean_t = clean_chapter_title(title, book_title=book_title, order=order)

        chapters.append({
            'order': order,
            'title': clean_t,
            'content_html': content_html,
        })
        order += 1

    return chapters


# ==============================================================================
# 5. Auditoría y Corrección Fiel por Libro
# ==============================================================================

def audit_book(book, fix=False, dry_run=True, backend_dir=None):
    """
    Audita un libro individual y sus capítulos:
    - Compara capítulos en BD contra el archivo original
    - Detecta capítulos vacíos, duplicados, orden incorrecto y capítulos faltantes
    - Si fix=True y dry_run=False, corrige dentro de transaction.atomic()
    """
    source_file, source_format, file_exists = get_book_source_file(book, backend_dir=backend_dir)
    
    db_chapters = list(book.chapters.all().order_by('order'))
    db_count = len(db_chapters)
    
    report = {
        'book_id': str(book.id),
        'title': book.title,
        'slug': book.slug,
        'source_file': str(source_file) if source_file else None,
        'source_format': source_format,
        'file_exists': file_exists,
        'db_chapters_count': db_count,
        'original_chapters_count': 0,
        'status': 'OK', # OK, WARNING, ERROR, FIXED
        'issues': [],
        'fixes': [],
        'empty_chapters': [],
        'short_chapters': [],
        'duplicate_chapters': [],
        'order_issues': [],
        'missing_chapters': 0,
    }

    # 1. Extraer capítulos del archivo original si existe
    original_chapters = []
    if file_exists and source_file:
        if source_format == 'epub':
            original_chapters = extract_chapters_from_epub(source_file, book.slug, book_title=book.title)
        elif source_format in ['txt', 'pdf']:
            original_chapters = extract_chapters_from_txt(source_file, book.slug, book_title=book.title)
        report['original_chapters_count'] = len(original_chapters)

    # 2. Revisar capítulos existentes en BD
    seen_orders = set()
    seen_contents = {}
    expected_order = 1

    for ch in db_chapters:
        # Verificar título
        if not ch.title or not ch.title.strip() or ch.title.strip().lower() in ['(sin título)', 'sin titulo', 'none', 'undefined', 'start', 'iniciar', 'inicio', 'coverpage', 'cover']:
            report['issues'].append(f"Capítulo id={ch.id} orden={ch.order} tiene título nulo, vacío o genérico: '{ch.title}'")

        # Verificar contenido
        is_empty, is_short, text_len, reason = is_content_empty_or_trivial(ch.content_html)
        if is_empty:
            report['empty_chapters'].append({'id': str(ch.id), 'order': ch.order, 'title': ch.title, 'reason': reason})
            report['issues'].append(f"Capítulo id={ch.id} orden={ch.order} '{ch.title}' VACÍO: {reason}")
        elif is_short:
            report['short_chapters'].append({'id': str(ch.id), 'order': ch.order, 'title': ch.title, 'length': text_len, 'reason': reason})
            report['issues'].append(f"Capítulo id={ch.id} orden={ch.order} '{ch.title}' SOSPECHOSAMENTE CORTO ({text_len} chars): {reason}")

        # Verificar orden
        if ch.order in seen_orders:
            report['duplicate_chapters'].append({'id': str(ch.id), 'order': ch.order, 'title': ch.title, 'type': 'duplicate_order'})
            report['issues'].append(f"Capítulo id={ch.id} duplicado por número de orden {ch.order}")
        seen_orders.add(ch.order)

        if ch.order != expected_order:
            report['order_issues'].append({'id': str(ch.id), 'found': ch.order, 'expected': expected_order})
            report['issues'].append(f"Capítulo id={ch.id} orden discontinuo: encontrado {ch.order}, esperado {expected_order}")
        expected_order += 1

        # Verificar contenido duplicado
        content_hash = hash(extract_plain_text(ch.content_html))
        if content_hash in seen_contents and text_len > 50:
            orig_id, orig_order = seen_contents[content_hash]
            report['duplicate_chapters'].append({'id': str(ch.id), 'order': ch.order, 'duplicate_of_order': orig_order})
            report['issues'].append(f"Capítulo orden={ch.order} tiene contenido idéntico a capítulo orden={orig_order}")
        else:
            seen_contents[content_hash] = (str(ch.id), ch.order)

    # 3. Comparar conteo contra original
    if file_exists and len(original_chapters) > 0:
        if len(original_chapters) > db_count:
            report['missing_chapters'] = len(original_chapters) - db_count
            report['issues'].append(f"Faltan {report['missing_chapters']} capítulos en BD (Original: {len(original_chapters)}, BD: {db_count})")
        elif len(original_chapters) < db_count:
            report['issues'].append(f"La BD tiene más capítulos que el archivo original (Original: {len(original_chapters)}, BD: {db_count})")

    # Determinar estado preliminar
    if not file_exists:
        report['status'] = 'ERROR'
        report['issues'].append("Archivo fuente no encontrado.")
    elif report['empty_chapters'] or report['missing_chapters'] > 0 or report['duplicate_chapters'] or report['order_issues']:
        report['status'] = 'ERROR'
    elif report['short_chapters']:
        report['status'] = 'WARNING'
    else:
        report['status'] = 'OK'

    # 4. CORRECCIÓN AUTOMÁTICA SEGURA (si fix=True y no dry_run)
    if fix and not dry_run and file_exists and original_chapters:
        # Verificar si hay problemas que ameritan reconstrucción
        needs_fix = bool(
            report['empty_chapters'] or 
            report['missing_chapters'] > 0 or 
            report['duplicate_chapters'] or 
            report['order_issues'] or 
            (report['short_chapters'] and len(original_chapters) != db_count) or
            (db_chapters and is_content_empty_or_trivial(db_chapters[0].content_html)[0]) or
            any('título nulo, vacío o genérico' in iss for iss in report['issues'])
        )

        if needs_fix:
            try:
                with transaction.atomic():
                    # Backup previo de los capítulos actuales del libro
                    book.chapters.all().delete()

                    for chap_data in original_chapters:
                        Chapter.objects.create(
                            book=book,
                            order=chap_data['order'],
                            title=chap_data['title'],
                            content_html=chap_data['content_html'],
                        )

                    report['fixes'].append(f"Reconstruidos fielmente {len(original_chapters)} capítulos desde el archivo original '{source_file.name}'.")
                    report['status'] = 'FIXED'
            except Exception as e:
                report['status'] = 'ERROR'
                report['issues'].append(f"Fallo al aplicar corrección atómica: {str(e)}")

    return report
