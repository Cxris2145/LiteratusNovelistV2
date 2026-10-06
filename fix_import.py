with open('respaldos-software/LiteratusNovelist-main/Producto/backend/catalog/management/commands/import_epubs.py', 'r', encoding='utf-8') as f:
    py = f.read()

import re
py = re.sub(
    r"def _extract_images\(epub_path, dest_folder\):\s*img_dir = Path\(dest_folder\) / 'images'",
    '''def _extract_images(epub_path, book_slug):
    from django.conf import settings
    img_dir = Path(settings.MEDIA_ROOT) / "books" / book_slug / "images"''',
    py
)
py = re.sub(
    r'def _extract_images\(epub_path, dest_folder\):\s*img_dir = Path\(dest_folder\) / "images"',
    '''def _extract_images(epub_path, book_slug):
    from django.conf import settings
    img_dir = Path(settings.MEDIA_ROOT) / "books" / book_slug / "images"''',
    py
)
py = py.replace("_extract_images(epub_path, folder)", "_extract_images(epub_path, slug)")

with open('respaldos-software/LiteratusNovelist-main/Producto/backend/catalog/management/commands/import_epubs.py', 'w', encoding='utf-8') as f:
    f.write(py)
