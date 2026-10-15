"""catalog/search_suggest.py — Sugerencias del buscador del header (GET catalog/autocomplete/).

El buscador pide sugerencias con cada letra. Consultar Supabase en cada tecla costaría varios
viajes de red, así que se arma una vez un índice liviano (títulos, autores y géneros ya
plegados) y se filtra en Python: con mil obras cada consulta toma 1-4 ms. Armarlo cuesta
~1 s contra Supabase; se renueva al instante cuando cambia una obra (catalog:age:revision, ver
signals.py) y, para autores y géneros, a los 30 minutos. El buscador lo precalienta al
enfocarse con una consulta vacía.
"""
import heapq
import unicodedata

from django.core.cache import cache

from .models import Book, BookAuthor, Genre

INDEX_TTL = 1800  # segundos
LIMITS = {'books': 5, 'authors': 3, 'genres': 3}
MAX_QUERY = 60
# Con una o dos letras "contiene" trae medio catálogo: solo cuentan inicios de palabra.
CONTAINS_FROM = 3


def fold(text):
    """Minúsculas y sin tildes ni diéresis (la ñ se conserva); signos y rayas pasan a espacio.

    Es el mismo plegado que foldChar del frontend (core/utils/book-search.util.ts), así el
    resaltado de la coincidencia cae en las mismas letras que encontró el servidor.
    """
    chars = []
    for ch in text or '':
        if unicodedata.category(ch)[0] not in 'LNM':
            chars.append(' ')
            continue
        lower = ch.lower()
        chars.append('ñ' if lower == 'ñ' else unicodedata.normalize('NFD', lower)[0])
    return ' '.join(''.join(chars).split())


def match_rank(folded, query):
    """0 = empieza igual, 1 = alguna palabra empieza igual, 2 = aparece dentro; None = no sirve."""
    if folded.startswith(query):
        return 0
    if f' {query}' in folded:
        return 1
    if len(query) >= CONTAINS_FROM and query in folded:
        return 2
    return None


def _visible_count(counts_by_age, age):
    return sum(count for min_age, count in counts_by_age.items() if min_age <= age)


def _build_index():
    books, authors, genres = [], {}, {}
    queryset = (
        Book.objects.filter(status=Book.StatusChoices.PUBLISHED)
        .only('id', 'slug', 'title', 'cover_image', 'min_age', 'is_featured')
        .prefetch_related('book_authors__author', 'genres')
    )
    for book in queryset:
        credits = list(book.book_authors.all())
        main = next((c for c in credits if c.role == BookAuthor.RoleChoices.PRIMARY), credits[0] if credits else None)
        author_name = main.author.full_name if main else ''
        books.append({
            'id': str(book.id),
            'slug': book.slug,
            'title': book.title,
            'author_name': author_name,
            'cover': book.cover_image.url if book.cover_image else None,
            'min_age': book.min_age,
            'featured': book.is_featured,
            'folded': fold(book.title),
            'folded_author': fold(author_name),
        })
        for credit in credits:
            author = credit.author
            entry = authors.setdefault(author.id, {
                'id': str(author.id),
                'slug': author.slug,
                'title': author.full_name,
                'photo': author.photo.url if author.photo else None,
                'folded': fold(author.full_name),
                'ages': {},
            })
            entry['ages'][book.min_age] = entry['ages'].get(book.min_age, 0) + 1
        for genre in book.genres.all():
            entry = genres.setdefault(genre.id, {
                'id': str(genre.id),
                'slug': genre.slug,
                'title': genre.name,
                'folded': fold(genre.name),
                'ages': {},
            })
            entry['ages'][book.min_age] = entry['ages'].get(book.min_age, 0) + 1
    return {'books': books, 'authors': list(authors.values()), 'genres': list(genres.values())}


def get_index():
    revision = cache.get('catalog:age:revision', 'initial')
    return cache.get_or_set(f'catalog:suggest-index:v1:{revision}', _build_index, INDEX_TTL)


def suggest(raw_query, age, absolute_url=lambda url: url):
    """Hasta 5 obras, 3 autores y 3 géneros para `raw_query`, solo con lo que `age` puede ver."""
    query = fold(raw_query[:MAX_QUERY])
    index = get_index()
    if not query:
        return {'books': [], 'authors': [], 'genres': []}

    ranked_books = []
    for book in index['books']:
        if book['min_age'] > age:
            continue
        rank = match_rank(book['folded'], query)
        if rank is None and match_rank(book['folded_author'], query) in (0, 1):
            rank = 3  # La obra aparece por su autor ("borges" → Ficciones), después de los títulos.
        if rank is not None:
            ranked_books.append(((rank, not book['featured'], len(book['title']), book['folded']), book))

    def ranked_people(entries):
        found = []
        for entry in entries:
            rank = match_rank(entry['folded'], query)
            if rank is None:
                continue
            count = _visible_count(entry['ages'], age)
            if count:
                found.append(((rank, -count, entry['folded']), entry, count))
        return found

    top_books = heapq.nsmallest(LIMITS['books'], ranked_books, key=lambda item: item[0])
    top_authors = heapq.nsmallest(LIMITS['authors'], ranked_people(index['authors']), key=lambda item: item[0])
    top_genres = heapq.nsmallest(LIMITS['genres'], ranked_people(index['genres']), key=lambda item: item[0])

    return {
        'books': [{
            'type': 'book', 'id': b['id'], 'slug': b['slug'], 'title': b['title'],
            'author_name': b['author_name'], 'cover': absolute_url(b['cover']) if b['cover'] else None,
        } for _, b in top_books],
        'authors': [{
            'type': 'author', 'id': a['id'], 'slug': a['slug'], 'title': a['title'], 'book_count': count,
            'photo': absolute_url(a['photo']) if a['photo'] else None,
        } for _, a, count in top_authors],
        'genres': [{
            'type': 'genre', 'id': g['id'], 'slug': g['slug'], 'title': g['title'], 'book_count': count,
        } for _, g, count in top_genres],
    }
