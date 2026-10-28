"""Genera src/assets/fonts/material-symbols-{rounded,outlined}.woff2 con solo los iconos de icons.txt.

Las fuentes completas de Google pesan 5,4 MB y 4 MB. Esta versión conserva los ejes que usa
el sitio (FILL, wght y opsz) y fija GRAD en 0, que es el único valor que se usa.

Uso (desde frontend/):
    pip install fonttools brotli
    node scripts/icon-fonts.mjs --write
    python scripts/icon-fonts/subset_icons.py
"""
import re
import sys
import urllib.request
from io import BytesIO
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

HERE = Path(__file__).resolve().parent
OUT = HERE.parent.parent / 'src' / 'assets' / 'fonts'
FAMILIES = {'rounded': 'Material Symbols Rounded', 'outlined': 'Material Symbols Outlined'}
CSS_URL = 'https://fonts.googleapis.com/css2?family={}:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200'
# Con un navegador moderno Google entrega woff2.
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as res:
        return res.read()


def download(family):
    css = fetch(CSS_URL.format(family.replace(' ', '+'))).decode()
    url = re.search(r'url\((https://[^)]+\.woff2)\)', css).group(1)
    return TTFont(BytesIO(fetch(url)))


def ligatures(font):
    """Nombre del icono (texto que se escribe) -> glifo que lo dibuja."""
    chars = {glyph: chr(code) for code, glyph in font.getBestCmap().items()}
    found = {}
    for lookup in font['GSUB'].table.LookupList.Lookup:
        for st in lookup.SubTable:
            st = getattr(st, 'ExtSubTable', st)
            for first, ligs in getattr(st, 'ligatures', {}).items():
                for lig in ligs:
                    text = ''.join(chars.get(g, '\0') for g in [first, *lig.Component])
                    found[text] = lig.LigGlyph
    return found


def read_icons():
    lines = (HERE / 'icons.txt').read_text(encoding='utf-8').splitlines()
    return sorted({l.strip() for l in lines if l.strip()})


def build(key, family, icons):
    font = download(family)
    glyph_order = set(font.getGlyphOrder())
    lig = ligatures(font)
    missing = [n for n in icons if n not in lig]
    # La variante rellena (FILL=1) es otro glifo: «name.fill».
    glyphs = {lig[n] for n in icons if n in lig}
    glyphs |= {g + '.fill' for g in glyphs if g + '.fill' in glyph_order}
    # Las letras que forman los nombres tienen que seguir en la fuente para que la ligadura funcione.
    letters = {ord(c) for n in icons for c in n}
    cmap = font.getBestCmap()
    codes = letters | {code for code, g in cmap.items() if g in glyphs} | {0x20}

    opts = subset.Options()
    opts.layout_closure = False  # sin esto se quedarían todas las ligaduras posibles con esas letras
    opts.layout_features = ['*']
    opts.notdef_outline = True
    sub = subset.Subsetter(opts)
    sub.populate(glyphs=sorted(glyphs), unicodes=sorted(codes))
    sub.subset(font)
    instancer.instantiateVariableFont(font, {'GRAD': 0}, inplace=True)

    kept = ligatures(font)
    lost = [n for n in icons if n in lig and n not in kept]
    font.flavor = 'woff2'
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f'material-symbols-{key}.woff2'
    font.save(path)
    print(f'{path.name}: {len(icons) - len(missing)} iconos, {path.stat().st_size / 1024:.0f} KB')
    if missing:
        print(f'  no existen en {family}: {", ".join(missing)}')
    if lost:
        sys.exit(f'  se perdieron al recortar: {", ".join(lost)}')


if __name__ == '__main__':
    icons = read_icons()
    for key, family in FAMILIES.items():
        build(key, family, icons)
