"""A bounded, anonymous-only DTO shared by the home API and static exports.

Only the fields constructed below are public: never reuse the detailed book or
avatar serializers here, since they also expose protected or expensive data.
"""
from hashlib import sha256
from urllib.parse import urljoin, urlsplit

from django.conf import settings
from django.contrib.auth.models import AnonymousUser
from django.core.cache import cache
from django.db.models import Count, Prefetch, Q, Subquery
from django.utils import timezone

from ai_engine.models import AIAvatar
from .age import visible_books
from .models import Author, Book, BookAuthor, Genre


HOME_CACHE_TTL = 300
STARTER_SLUGS = (
    'la-odisea-homero',
    'la-metamorfosis-kafka-franz',
    'romeo-y-julieta-shakespeare-william',
    'la-casa-de-bernarda-alba-garcia-lorca-federico',
    'las-aventuras-de-alicia-en-el-pais-de-las-maravillas-carroll-lewis',
    'frankenstein-mary-shelley',
    'la-vida-de-lazarillo-de-tormes-anonimo',
    'rimas-gustavo-adolfo-becquer',
    'veinte-mil-leguas-de-viaje-submarino-verne-julio',
    'hamlet-shakespeare-william',
    'la-divina-comedia-dante-alighieri',
    'la-celestina-fernando-de-rojas',
)
CAST = (
    ('Odiseo', 'la-odisea-homero', 'Rey de Ítaca. Tarda veinte años en volver a casa.'),
    ('Aquiles', 'la-iliada-homero', 'El mejor guerrero griego, y el más orgulloso.'),
    ('Virgilio', 'la-divina-comedia-dante-alighieri', 'Guía a Dante por el Infierno y el Purgatorio.'),
    ('Capitán Nemo', 'veinte-mil-leguas-de-viaje-submarino-verne-julio', 'Comandante del Nautilus, en guerra con la superficie.'),
    ('Gregorio Samsa', 'la-metamorfosis-kafka-franz', 'Despierta convertido en insecto y aún piensa en su trabajo.'),
    ('Alicia', 'las-aventuras-de-alicia-en-el-pais-de-las-maravillas-carroll-lewis', 'Cae por la madriguera y discute con todo el que encuentra.'),
    ('El Monstruo', 'frankenstein-mary-shelley', 'Busca respuestas de quien le dio la vida.'),
    ('Julieta', 'romeo-y-julieta-shakespeare-william', 'Desafía a su familia por amor a un Montesco.'),
)


def _origin(base_url):
    parsed = urlsplit(base_url)
    if parsed.scheme not in ('http', 'https') or not parsed.netloc or parsed.username or parsed.password:
        raise ValueError('Home export requires an absolute HTTP(S) base URL.')
    return f'{parsed.scheme}://{parsed.netloc}/'


def _image(field, base_url, fallback=''):
    name = field if isinstance(field, str) else (str(field.name) if field and field.name else fallback)
    if not name:
        return ''
    # Some imported assets store a complete URL instead of a storage key.
    # Preserve original object URLs; the free bucket does not need image transforms.
    if urlsplit(name).scheme in ('http', 'https'):
        return name
    return urljoin(base_url, f"{settings.MEDIA_URL.rstrip('/')}/{name.lstrip('/')}")


def _book_data(book, base_url):
    authors = list(book.book_authors.all())
    primary = next((entry for entry in authors if entry.role in ('primary', 'author')), None)
    primary = primary or (authors[0] if authors else None)
    return {
        'id': str(book.pk),
        'title': book.title,
        'slug': book.slug,
        'synopsis': book.synopsis[:480],
        'is_featured': book.is_featured,
        'cover_image': _image(book.cover_image, base_url) or None,
        'author_name': primary.author.full_name if primary else '',
        'genres': [{'id': str(genre.pk), 'name': genre.name, 'slug': genre.slug}
                   for genre in book.genres.all()],
    }


def build_home_payload(base_url):
    """Build fresh public metadata with a constant number of database queries.

    The caller supplies only a media origin, never a user. This keeps builds and
    authenticated visitors on the same anonymous age policy.
    """
    base_url = _origin(base_url)
    anonymous = AnonymousUser()
    public_books = visible_books(Book.objects.filter(is_published=True), anonymous)
    order = ('-is_featured', '-created_at', 'id')
    feed_ids = public_books.order_by(*order).values('pk')[:50]
    curated_slugs = set(STARTER_SLUGS) | {member[1] for member in CAST}
    authors = BookAuthor.objects.filter(author__deleted_at__isnull=True).select_related('author').only(
        'id', 'book_id', 'role', 'author__id', 'author__full_name'
    ).order_by('id')
    books = list(public_books.filter(
        Q(pk__in=Subquery(feed_ids)) | Q(slug__in=curated_slugs)
    ).only('id', 'title', 'slug', 'synopsis', 'is_featured', 'cover_image').order_by(*order).prefetch_related(
        Prefetch('genres', queryset=Genre.objects.only('id', 'name', 'slug').order_by('name', 'id')),
        Prefetch('book_authors', queryset=authors),
    ))
    book_data = [_book_data(book, base_url) for book in books]
    by_slug = {book['slug']: book for book in book_data}

    genres = list(Genre.objects.annotate(book_count=Count(
        'books', filter=Q(books__pk__in=Subquery(public_books.values('pk'))), distinct=True
    )).filter(book_count__gt=0).only('name', 'slug', 'cover_image').order_by('-book_count', 'name', 'id')[:13])

    public_avatars = visible_books(AIAvatar.objects.filter(
        edition__deleted_at__isnull=True, edition__book__deleted_at__isnull=True,
        edition__book__is_published=True,
    ), anonymous, 'edition__book__')
    cast_filter = Q(pk__in=[])
    for name, slug, _ in CAST:
        cast_filter |= Q(name__iexact=name, edition__book__slug=slug)
    # values() never reads prompts, dialogues, chapter text or user data.
    avatars = public_avatars.filter(cast_filter).order_by('id').values(
        'id', 'name', 'avatar_image', 'edition__book__slug'
    )
    cast_by_key = {}
    for avatar in avatars:
        key = (avatar['name'].casefold(), avatar['edition__book__slug'])
        cast_by_key.setdefault(key, avatar)
    cast = []
    for name, slug, role in CAST:
        avatar = cast_by_key.get((name.casefold(), slug))
        book = by_slug.get(slug)
        if avatar is None or book is None:
            continue
        image_name = avatar['avatar_image']
        # Use the same URL resolver for value rows and file fields.
        image = _image(image_name, base_url)
        cast.append({
            'id': str(avatar['id']), 'name': name, 'role': role,
            'bookTitle': book['title'], 'bookSlug': slug,
            'image': image or book['cover_image'] or '', 'isPortrait': bool(image),
        })

    return {
        'version': 1,
        'generated_at': timezone.now().isoformat(),
        'audience': 'public',
        'stats': {
            'total_books': public_books.count(),
            'total_characters': public_avatars.count(),
            'total_authors': Author.objects.count(),
            'total_genres': Genre.objects.count(),
        },
        'books': book_data[:50],
        'starter_books': [{
            'slug': book['slug'], 'title': book['title'], 'author': book['author_name'],
            'genre': book['genres'][0]['name'] if book['genres'] else '', 'cover': book['cover_image'],
        } for slug in STARTER_SLUGS if (book := by_slug.get(slug)) and book['cover_image']],
        'genres': [{
            'name': genre.name, 'slug': genre.slug, 'bookCount': genre.book_count,
            'image': _image(genre.cover_image, base_url, f'category_covers/{genre.slug}.webp'),
        } for genre in genres],
        'cast': cast,
    }


def cached_home_payload(base_url):
    base_url = _origin(base_url)
    revision = cache.get('catalog:age:revision', 'initial')
    origin_key = sha256(base_url.encode()).hexdigest()[:16]
    key = f'catalog:home:v1:{revision}:{origin_key}'
    payload = cache.get(key)
    if payload is None:
        payload = build_home_payload(base_url)
        cache.set(key, payload, HOME_CACHE_TTL)
    return payload
