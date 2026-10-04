import json
import re
import difflib
from bs4 import BeautifulSoup
import warnings
from bs4 import XMLParsedAsHTMLWarning
warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)

def clean_chapter(title, html):
    """
    Surgically cleans elejandria / alejandria phrases, chapter titles,
    and their enclosing HTML tags without touching any other text.
    """
    orig_title = title
    orig_html = html

    # 1. CLEAN TITLE
    new_title = clean_title(title, html)

    # 2. CLEAN HTML
    new_html = clean_html(html)

    return new_title, new_html

def clean_title(title, html):
    if not title:
        return title

    # Case A: Download prefix/suffix: "Book Title \n\n Libro descargado en www.elejandria.com..."
    if 'libro descargado en' in title.lower() or 'www.elejandria.com' in title.lower():
        lines = [l.strip() for l in title.splitlines() if l.strip()]
        clean_lines = [
            l for l in lines 
            if not re.search(r'elejandr[ií]a|descargado en|podr[aá]s encontrar m[aá]s libros', l, re.IGNORECASE)
        ]
        if clean_lines:
            candidate = clean_lines[0]
            if len(candidate) > 2 and candidate.lower() != 'desconocido':
                return candidate

    # Case B: Title is explicitly the farewell phrase: "¡Gracias por leer este libro de www.elejandria.com!"
    if re.search(r'gracias por leer|acerca del libro.*elejandria|www\.elejandria\.com', title, re.IGNORECASE):
        # Check if the HTML contains a legitimate heading
        soup = BeautifulSoup(html, 'html.parser')
        heading = soup.find(['h1', 'h2', 'h3', 'h4'])
        if not heading:
            # Check for <p> starting with 'Capítulo' or 'Epílogo'
            for p in soup.find_all('p')[:5]:
                p_text = p.get_text(separator=' ', strip=True)
                if re.match(r'^(Cap[ií]tulo|Ep[ií]logo|Parte|Secci[oó]n)', p_text, re.IGNORECASE) and len(p_text) < 100:
                    heading = p
                    break

        if heading:
            h_text = heading.get_text(separator=' ', strip=True)
            # Make sure the heading itself is not elejandria or residual spam
            if h_text and not re.search(r'elejandr[ií]a|castellano\s+en nuestra web', h_text, re.IGNORECASE):
                # Clean multiple whitespaces
                h_text = re.sub(r'\s+', ' ', h_text).strip()
                return h_text[:150]

        # Check html <title> tag
        if soup.title:
            t_text = soup.title.get_text(strip=True)
            if t_text and not re.search(r'elejandr[ií]a|desconocido', t_text, re.IGNORECASE):
                return t_text[:150]

        return "Fin del libro"

    return title

def clean_html(html):
    if not html:
        return html

    cleaned = html

    # Exact surgical replacements
    patterns = [
        # Immediate paragraph containing "gracias por leer" and elejandria (including nested <strong>, <span>, etc.)
        r'<p[^>]*>(?:(?!</p>)[\s\S])*?[¡!¿?]?\s*gracias por leer[\s\S]*?elejandr[ií]a[\s\S]*?</p>\s*',
        # Immediate paragraph containing dmca / wikisource disclaimer with elejandria
        r'<p[^>]*>(?:(?!</p>)[\s\S])*?dmca@elejandr[ií]a\.com[\s\S]*?</p>\s*',
        # The specific div class="also" added by elejandria
        r'<div[^>]*class="[^"]*also[^"]*"[^>]*>[\s\S]*?elejandr[ií]a[\s\S]*?</div>\s*',
        # Heading with "Traducción propia de Elejandría"
        r'<h[1-6][^>]*>(?:(?!</h[1-6]>)[\s\S])*?traducci[oó]n propia de elejandr[ií]a[\s\S]*?</h[1-6]>\s*',
        # Leftover header from truncated farewell page: "castellano en nuestra web"
        r'<h[1-6][^>]*>(?:(?!</h[1-6]>)[\s\S])*?castellano\s+en nuestra web[\s\S]*?</h[1-6]>\s*',
        # Heading with elejandria download note
        r'<h[1-6][^>]*>(?:(?!</h[1-6]>)[\s\S])*?libro descargado en[\s\S]*?elejandr[ií]a[\s\S]*?</h[1-6]>\s*',
        # Specific farewell title tag
        r'<title>\s*elejandr[ií]a(\.com)?\s*</title>\s*',
        # Farewell page content pointer
        r'<content\s+src="elejandria_farewell_page\.xhtml"></content>\s*',
        # Inline attribution: Traducción: Elejandría preserving surrounding lines
        r'(?:<br\s*/?>\s*)?Traducci[oó]n:\s*Elejandr[ií]a(?:\s*<br\s*/?>)?',
    ]

    for pat in patterns:
        cleaned = re.sub(pat, '', cleaned, flags=re.IGNORECASE)

    return cleaned

def test_dry_run():
    with open('backup_chapters_pre_cleaning.json', 'r', encoding='utf-8') as f:
        chapters = json.load(f)

    modified_titles = 0
    modified_contents = 0
    books_touched = set()

    samples_diff = []

    for ch in chapters:
        orig_t = ch['title']
        orig_h = ch['content_html']

        new_t, new_h = clean_chapter(orig_t, orig_h)

        t_changed = (orig_t != new_t)
        h_changed = (orig_h != new_h)

        if t_changed or h_changed:
            books_touched.add(ch['book_title'])
            if t_changed:
                modified_titles += 1
            if h_changed:
                modified_contents += 1

            if len(samples_diff) < 5 and h_changed:
                diff = difflib.unified_diff(
                    orig_h.splitlines(keepends=True)[:30],
                    new_h.splitlines(keepends=True)[:30],
                    fromfile=f"BEFORE (Ch {ch['order']})",
                    tofile=f"AFTER (Ch {ch['order']})"
                )
                samples_diff.append((ch['book_title'], ch['order'], orig_t, new_t, ''.join(diff)))

    print("=== RESULTADOS DEL TEST DE LIMPIEZA QUIRÚRGICA (DRY RUN) ===")
    print(f"Total Libros Afectados y Sanitizados: {len(books_touched)}")
    print(f"Total Títulos de Capítulos Sanitizados: {modified_titles}")
    print(f"Total Contenidos HTML Sanitizados: {modified_contents}")

    print("\n--- EJEMPLOS DE DIFERENCIAS ESPECÍFICAS ---")
    specific_books = ['Viaje al Centro de la Tierra', 'Sandokán: El Rey del Mar', 'Markheim', 'Moby Dick', 'La llamada de Cthulhu']
    for ch in chapters:
        if ch['book_title'] in specific_books:
            new_t, new_h = clean_chapter(ch['title'], ch['content_html'])
            if new_t != ch['title'] or new_h != ch['content_html']:
                print(f"\n==========================================")
                print(f"Libro: {ch['book_title']} (Capítulo {ch['order']})")
                print(f"Título: {repr(ch['title'])} -> {repr(new_t)}")
                diff = difflib.unified_diff(
                    ch['content_html'].splitlines(keepends=True),
                    new_h.splitlines(keepends=True),
                    fromfile="BEFORE",
                    tofile="AFTER"
                )
                print("".join(diff))

if __name__ == '__main__':
    test_dry_run()
