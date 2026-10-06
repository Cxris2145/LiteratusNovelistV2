"""
catalog/views.py — Vistas de listado y consultas para libros.
"""
from rest_framework import viewsets, filters, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny
from django.shortcuts import get_object_or_404
from django.db import transaction
from django.db.models import Count
from django.core.cache import cache
from django_filters.rest_framework import DjangoFilterBackend
from library.models import UserInventory
from .models import Book, Author, Genre, Tag, Review
from .serializers import (
    BookListSerializer, BookDetailSerializer, BookDetailFullSerializer, 
    AuthorDetailSerializer, AuthorReadSerializer, GenreSerializer
)
from core.pagination import StandardResultsSetPagination

# Los listados públicos del catálogo (libros, géneros, stats) cambian con muy
# poca frecuencia (altas/bajas de libros desde el Dashboard), pero la base de
# datos vive en el pooler remoto de Supabase: cada consulta agregada (Count,
# prefetch_related) cuesta varios round-trips de red. Cacheamos la respuesta
# ya serializada (`response.data`, aún sin renderizar) por unos minutos para
# que la home y el catálogo dejen de esperar ~2s en cada carga/recarga.
CATALOG_CACHE_TTL = 300  # segundos


class GenreViewSet(viewsets.ModelViewSet):
    """
    ViewSet para gestionar géneros (Genre).
    Permite listar, crear y editar géneros desde el Dashboard.
    """
    queryset = Genre.objects.annotate(book_count=Count('books')).order_by('-book_count', 'name')
    serializer_class = GenreSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    lookup_field = 'slug'
    filter_backends = [filters.SearchFilter]
    search_fields = ['name']

    def list(self, request, *args, **kwargs):
        cache_key = f"catalog:genres:{request.get_full_path()}"
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        response = super().list(request, *args, **kwargs)
        cache.set(cache_key, response.data, CATALOG_CACHE_TTL)
        return response


class AuthorViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Vista de Lectura del Catálogo de Autores.
    select_related: ninguna FK directa en Author, pero se deja preparado.
    prefetch_related: books con sus géneros (evita N+1 al serializar la lista de obras).
    """
    queryset = (
        Author.objects
        .prefetch_related('author_books__book__genres', 'author_books__book__editions')
        .order_by('full_name')
    )
    pagination_class = StandardResultsSetPagination
    lookup_field = 'slug'
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['full_name', 'bio', 'nationality']
    ordering_fields = ['full_name', 'birth_year']
    ordering = ['full_name']

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return AuthorDetailSerializer
        return AuthorReadSerializer

class BookViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Vista de Lectura del Catálogo.
    Permite listar libros usando BookListSerializer (ligero)
    y detallar el libro uniendo autores y géneros (BookDetailSerializer).
    """
    queryset = Book.objects.prefetch_related('genres', 'book_authors__author', 'editions', 'tags')
    pagination_class = StandardResultsSetPagination
    # Filtros exactos: ?genres__name=Cuentos
    filterset_fields = {
        'genres__name': ['exact', 'icontains'],
        'genres__slug': ['exact'],
        'is_featured': ['exact'],
    }
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    lookup_field = 'slug'

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.min_age > 0:
            if not request.user.is_authenticated:
                from rest_framework.response import Response
                from rest_framework import status
                return Response({'error': 'AGE_RESTRICTED', 'message': 'Debes iniciar sesión y registrar tu edad para ver este libro.'}, status=status.HTTP_403_FORBIDDEN)
            profile = getattr(request.user, 'profile', None)
            if not profile or not profile.birth_date:
                from rest_framework.response import Response
                from rest_framework import status
                return Response({'error': 'AGE_RESTRICTED', 'message': 'Por favor, registra tu fecha de nacimiento en tu perfil para ver este libro.'}, status=status.HTTP_403_FORBIDDEN)
            from datetime import date
            today = date.today()
            born = profile.birth_date
            age = today.year - born.year - ((today.month, today.day) < (born.month, born.day))
            if age < instance.min_age:
                from rest_framework.response import Response
                from rest_framework import status
                return Response({'error': 'AGE_RESTRICTED', 'message': f'Este libro está restringido para mayores de {instance.min_age} años.'}, status=status.HTTP_403_FORBIDDEN)
        return super().retrieve(request, *args, **kwargs)
    
    # Búsqueda múltiple DRF: ?search=garcia
    search_fields = ['title', 'synopsis', 'book_authors__author__full_name', 'genres__name']
    
    # Ordenamiento DRF: ?ordering=-created_at
    ordering_fields = ['title', 'created_at', 'is_featured', 'ai_character_count']
    ordering = ['-is_featured', '-created_at', 'id'] # Orden determinístico y estático

    def get_queryset(self):
        qs = Book.objects.prefetch_related('genres', 'book_authors__author', 'editions', 'tags')
        qs = qs.annotate(ai_character_count=Count('editions__avatars', distinct=True))

        has_ai = self.request.query_params.get('has_ai_avatars', None)
        if has_ai and has_ai.lower() == 'true':
            qs = qs.filter(ai_character_count__gt=0)
        
        genre_name = self.request.query_params.get('genres__name', None)
        if genre_name:
            qs = qs.filter(genres__name__iexact=genre_name).distinct()
            
        genre_slug = self.request.query_params.get('genres__slug', None)
        if genre_slug:
            qs = qs.filter(genres__slug__iexact=genre_slug).distinct()
            
        return qs

    def get_serializer_class(self):
        """Usa el serializador detallado si es GET /books/{id}/, o el ligero en list"""
        if self.action == 'retrieve':
            return BookDetailSerializer
        return BookListSerializer

    def list(self, request, *args, **kwargs):
        """
        Listado estático y determinístico del catálogo.
        Garantiza que en cada refresco de página siempre se devuelvan los mismos
        libros iniciales con máximo rendimiento de caché.
        """
        cache_key = f"catalog:books:{request.get_full_path()}"
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        response = super().list(request, *args, **kwargs)
        cache.set(cache_key, response.data, CATALOG_CACHE_TTL)
        return response

    @action(detail=False, methods=['GET'])
    def recommendations(self, request):
        """
        SERVICIO DE RECOMENDACIONES INTELIGENTE.
        Calcula el perfil del usuario basado en sus preferencias del Onboarding
        (géneros preferidos y autores seguidos) y en los géneros/tags de sus compras.
        Devuelve hasta 6 libros recomendados para el carrusel de Explorar.
        """
        if not request.user.is_authenticated:
            qs = self.get_queryset().filter(is_featured=True)[:6]
            if not qs.exists():
                qs = self.get_queryset()[:6]
            serializer = self.get_serializer(qs, many=True)
            return Response(serializer.data)

        # 1. Obtener libros ya adquiridos por el usuario (inventario)
        owned_book_ids = list(UserInventory.objects.filter(
            user=request.user
        ).values_list('edition__book_id', flat=True))

        # 2. Obtener preferencias explícitas del Onboarding
        profile = getattr(request.user, 'profile', None)
        pref_genre_ids = list(profile.favorite_genres.values_list('id', flat=True)) if profile else []
        pref_author_ids = list(profile.followed_authors.values_list('id', flat=True)) if profile else []

        # 3. Obtener intereses implícitos de compras previas
        from django.db.models import Count, Q

        purchased_genre_ids = list(Genre.objects.filter(
            books__id__in=owned_book_ids
        ).values_list('id', flat=True)) if owned_book_ids else []

        user_tag_ids = list(Tag.objects.filter(
            books__id__in=owned_book_ids
        ).values_list('id', flat=True)) if owned_book_ids else []

        all_target_genre_ids = list(set(pref_genre_ids + purchased_genre_ids))

        # Si el usuario no tiene preferencias ni compras registradas, mostrar destacados
        if not owned_book_ids and not all_target_genre_ids and not pref_author_ids:
            qs = self.get_queryset().filter(is_featured=True)[:6]
            if not qs.exists():
                qs = self.get_queryset()[:6]
            return Response(self.get_serializer(qs, many=True).data)

        # 4. Candidatos a recomendar (excluyendo obras que ya posee)
        candidates = self.get_queryset().exclude(id__in=owned_book_ids)

        annotations = {}
        order_by_fields = []

        if pref_author_ids:
            annotations['matching_author'] = Count('authors', filter=Q(authors__id__in=pref_author_ids), distinct=True)
            order_by_fields.append('-matching_author')

        if all_target_genre_ids:
            annotations['matching_genres'] = Count('genres', filter=Q(genres__id__in=all_target_genre_ids), distinct=True)
            order_by_fields.append('-matching_genres')

        if user_tag_ids:
            annotations['matching_tags'] = Count('tags', filter=Q(tags__id__in=user_tag_ids), distinct=True)
            order_by_fields.append('-matching_tags')

        order_by_fields.extend(['-is_featured', '-view_count', '-id'])

        if annotations:
            candidates = candidates.annotate(**annotations)

        # Priorizar candidatos con al menos 1 coincidencia en autores seguidos o géneros favoritos
        match_q = Q()
        if pref_author_ids:
            match_q |= Q(authors__id__in=pref_author_ids)
        if all_target_genre_ids:
            match_q |= Q(genres__id__in=all_target_genre_ids)

        if match_q:
            matched_candidates = candidates.filter(match_q).order_by(*order_by_fields).distinct()
            if matched_candidates.count() >= 3:
                candidates = matched_candidates
            else:
                candidates = candidates.order_by(*order_by_fields).distinct()
        else:
            candidates = candidates.order_by(*order_by_fields).distinct()

        serializer = self.get_serializer(candidates[:6], many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['GET'])
    def details(self, request, slug=None):
        """
        Ficha Detallada de Obra (Fase 7.5).
        Devuelve información "nutricional" completa: avatares, tiempo de lectura, reseñas.
        """
        # Añadir prefetch adicionales para optimizar queries anidadas en el Full Serializer
        queryset = self.get_queryset().prefetch_related(
            'editions__avatars', 
            'reviews__user__profile',
            'chapters'
        )
        book = get_object_or_404(queryset, slug=slug)

        # Incrementar contador de visitas de forma atómica
        from django.db.models import F
        Book.objects.filter(pk=book.pk).update(view_count=F('view_count') + 1)
        book.refresh_from_db()

        serializer = BookDetailFullSerializer(book, context={'request': request})
        return Response(serializer.data)

    @action(detail=True, methods=['POST'])
    def purchase(self, request, slug=None):
        """
        Compra de una obra usando Tinta (ink_balance).
        """
        if not request.user.is_authenticated:
            return Response({'error': 'Debes iniciar sesión para comprar.'}, status=status.HTTP_401_UNAUTHORIZED)
            
        book = self.get_object()
        

        if book.min_age > 0:
            profile = getattr(request.user, 'profile', None)
            if not profile or not profile.birth_date:
                return Response({'error': 'AGE_RESTRICTED', 'message': 'Por favor, registra tu fecha de nacimiento en tu perfil para adquirir este libro.'}, status=status.HTTP_403_FORBIDDEN)
            from datetime import date
            today = date.today()
            born = profile.birth_date
            age = today.year - born.year - ((today.month, today.day) < (born.month, born.day))
            if age < book.min_age:
                return Response({'error': 'AGE_RESTRICTED', 'message': f'Este libro está restringido para mayores de {book.min_age} años.'}, status=status.HTTP_403_FORBIDDEN)

        # Obtenemos la edición principal (por defecto la primera, o EPUB)
        edition = book.editions.first()
        if not edition:
            return Response({'error': 'Este libro no tiene ediciones disponibles.'}, status=status.HTTP_400_BAD_REQUEST)
            
        # Costo en tinta basado en el precio de la edición aplicando descuento de nivel
        from library.achievement_engine import get_user_discount
        discount_percent = get_user_discount(request.user)
        base_cost = int(edition.price)
        cost = max(1, int(base_cost * (100 - discount_percent) / 100)) if discount_percent > 0 else base_cost
        
        with transaction.atomic():
            # Bloquear la fila del perfil para evitar race conditions
            # en la lectura/escritura del balance de tinta
            from users.models import Profile
            profile = Profile.objects.select_for_update().get(user=request.user)
            
            if profile.ink_balance < cost:
                return Response({
                    'error': 'INSUFFICIENT_INK',
                    'message': f'No tienes tinta suficiente. Necesitas {cost} de Tinta, tienes {profile.ink_balance}.'
                }, status=status.HTTP_400_BAD_REQUEST)
                
            # Verificar si ya lo posee
            if UserInventory.objects.filter(user=request.user, edition=edition).exists():
                return Response({'error': 'Ya posees este libro.'}, status=status.HTTP_400_BAD_REQUEST)
                
            # Restar tinta
            profile.ink_balance -= cost
            profile.save()
            
            # Registrar transacción de Tinta
            from library.models import InkTransaction
            InkTransaction.objects.create(
                user=request.user,
                amount=-cost,
                concept='book_purchase',
                reference_id=str(book.id),
                balance_after=profile.ink_balance
            )
            
            # Crear inventario
            inventory = UserInventory.objects.create(user=request.user, edition=edition)
            
        return Response({
            'message': 'Libro adquirido con éxito.', 
            'inventory_id': str(inventory.id),
            'ink_balance': profile.ink_balance,
            'discount_applied': discount_percent
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['POST'])
    def purchase_narration(self, request, slug=None):
        """
        Desbloquea la narración premium usando Tinta.
        Costo fijo: 200 de Tinta.
        """
        if not request.user.is_authenticated:
            return Response({'error': 'Debes iniciar sesión.'}, status=status.HTTP_401_UNAUTHORIZED)
            
        book = self.get_object()

        if book.min_age > 0:
            profile = getattr(request.user, 'profile', None)
            if not profile or not profile.birth_date:
                return Response({'error': 'AGE_RESTRICTED', 'message': 'Por favor, registra tu fecha de nacimiento en tu perfil para adquirir este libro.'}, status=status.HTTP_403_FORBIDDEN)
            from datetime import date
            today = date.today()
            born = profile.birth_date
            age = today.year - born.year - ((today.month, today.day) < (born.month, born.day))
            if age < book.min_age:
                return Response({'error': 'AGE_RESTRICTED', 'message': f'Este libro está restringido para mayores de {book.min_age} años.'}, status=status.HTTP_403_FORBIDDEN)

        edition = book.editions.first()
        if not edition:
            return Response({'error': 'Edición no encontrada.'}, status=status.HTTP_400_BAD_REQUEST)

        # Costo fijo para la narración premium
        cost = 200 
        
        with transaction.atomic():
            from users.models import Profile
            profile = Profile.objects.select_for_update().get(user=request.user)
            
            inventory = UserInventory.objects.filter(user=request.user, edition=edition).first()
            if not inventory:
                return Response({'error': 'Debes poseer el libro para comprar la narración.'}, status=status.HTTP_400_BAD_REQUEST)
                
            if inventory.has_premium_narration:
                return Response({'error': 'Ya posees la narración premium.'}, status=status.HTTP_400_BAD_REQUEST)
                
            if profile.ink_balance < cost:
                return Response({
                    'error': 'INSUFFICIENT_INK',
                    'message': f'Necesitas {cost} de Tinta, tienes {profile.ink_balance}.'
                }, status=status.HTTP_400_BAD_REQUEST)
                
            profile.ink_balance -= cost
            profile.save()
            
            from library.models import InkTransaction
            InkTransaction.objects.create(
                user=request.user,
                amount=-cost,
                concept='narration_purchase',
                reference_id=str(book.id),
                balance_after=profile.ink_balance
            )
            
            inventory.has_premium_narration = True
            inventory.save()
            
        return Response({
            'message': 'Narración premium desbloqueada.', 
            'ink_balance': profile.ink_balance
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['POST'])
    def add_review(self, request, slug=None):
        """
        Añade una reseña a una obra.
        Solo usuarios autenticados que posean la obra.
        Otorga Tinta y XP al usuario.
        """
        if not request.user.is_authenticated:
            return Response({'error': 'Debes iniciar sesión para escribir una reseña.'}, status=status.HTTP_401_UNAUTHORIZED)
            
        book = self.get_object()
        

        if book.min_age > 0:
            profile = getattr(request.user, 'profile', None)
            if not profile or not profile.birth_date:
                return Response({'error': 'AGE_RESTRICTED', 'message': 'Por favor, registra tu fecha de nacimiento en tu perfil para adquirir este libro.'}, status=status.HTTP_403_FORBIDDEN)
            from datetime import date
            today = date.today()
            born = profile.birth_date
            age = today.year - born.year - ((today.month, today.day) < (born.month, born.day))
            if age < book.min_age:
                return Response({'error': 'AGE_RESTRICTED', 'message': f'Este libro está restringido para mayores de {book.min_age} años.'}, status=status.HTTP_403_FORBIDDEN)

        # Verificar si el usuario posee la obra
        owns_book = UserInventory.objects.filter(
            user=request.user, 
            edition__book=book
        ).exists()
        
        if not owns_book:
            return Response({'error': 'Debes adquirir la obra antes de poder reseñarla.'}, status=status.HTTP_403_FORBIDDEN)
            
        # Verificar si ya reseñó
        if Review.objects.filter(user=request.user, book=book).exists():
            return Response({'error': 'Ya has escrito una reseña para esta obra.'}, status=status.HTTP_400_BAD_REQUEST)
            
        rating = request.data.get('rating')
        comment = request.data.get('comment', '')
        
        if not rating or not str(rating).isdigit() or int(rating) < 1 or int(rating) > 5:
            return Response({'error': 'La calificación debe ser un número entre 1 y 5.'}, status=status.HTTP_400_BAD_REQUEST)
            
        review = Review.objects.create(
            user=request.user,
            book=book,
            rating=int(rating),
            comment=comment
        )
        
        # Recompensar actividad de reseña
        from library.achievement_engine import reward_activity
        reward_activity(request.user, 'review_written', reference_id=str(review.id))
        
        return Response({
            'message': 'Reseña publicada con éxito.',
            'review': {
                'id': review.id,
                'user': review.user.username,
                'rating': review.rating,
                'comment': review.comment,
                'created_at': review.created_at
            }
        }, status=status.HTTP_201_CREATED)


class CatalogStatsView(APIView):
    """
    Métricas en vivo del catálogo. Público y sin paginación.

    El frontend usa `total_books` para el contador de la landing, de modo que
    al agregar (o borrar) un libro el número se actualiza solo. `Book.objects`
    ya excluye los registros con soft delete.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        cache_key = "catalog:stats"
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        total_books = Book.objects.count()
        books_with_chapters = (
            Book.objects.annotate(_n=Count('chapters')).filter(_n__gt=0).count()
        )
        total_authors = Author.objects.count()
        total_genres = Genre.objects.count()

        try:
            from ai_engine.models import AIAvatar, ChatMessage
            total_characters = AIAvatar.objects.count()
            total_dialogues = ChatMessage.objects.count()
        except Exception:
            total_characters = 0
            total_dialogues = 0

        data = {
            'total_books': total_books,
            'books_with_chapters': books_with_chapters,
            'books_without_chapters': total_books - books_with_chapters,
            'total_authors': total_authors,
            'total_genres': total_genres,
            'total_characters': total_characters,
            'total_dialogues': total_dialogues,
        }
        cache.set(cache_key, data, CATALOG_CACHE_TTL)
        return Response(data)


# ─────────────────────────────────────────────────────────────────────────────
# PORTAL DE AUTORES: Envío y Seguimiento de Obras para Curaduría
# ─────────────────────────────────────────────────────────────────────────────

from rest_framework.parsers import MultiPartParser, FormParser
from io import BytesIO
from django.utils.text import slugify
import json
from .models import Edition, Chapter, BookAuthor


class AuthorSubmitBookView(APIView):
    """
    POST /api/v1/catalog/author/submit-book/
    Permite a los autores enviar una obra de su autoría para evaluación editorial.
    La obra queda en estado PENDING_REVIEW con is_published=False hasta que
    el Administrador verifique el cumplimiento de los requisitos mínimos.
    """
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        data = request.data
        title = (data.get('title') or '').strip()
        synopsis = (data.get('synopsis') or '').strip()
        declaration = str(data.get('submission_declaration', '')).lower() in ('true', '1', 'yes')

        # ─── 1. Validación Estricta de Requisitos Mínimos ───
        errors = {}
        if not title or len(title) < 3:
            errors['title'] = 'El título de la obra es obligatorio y debe contener al menos 3 caracteres.'

        if not synopsis or len(synopsis) < 50:
            errors['synopsis'] = 'La sinopsis es obligatoria y debe tener al menos 50 caracteres (idealmente 100+ palabras) para la curaduría editorial.'

        if not declaration:
            errors['submission_declaration'] = 'Debes aceptar la declaración jurada que certifica que eres el autor legítimo de la obra o posees los derechos de difusión.'

        cover_file = request.FILES.get('cover')
        if not cover_file:
            errors['cover'] = 'Se requiere una portada en alta resolución (JPG, PNG o WebP).'

        epub_file = request.FILES.get('epub')
        pdf_file = request.FILES.get('pdf_file')
        raw_chapters = data.get('chapters')

        if not epub_file and not pdf_file and not raw_chapters:
            errors['file'] = 'Debes adjuntar el manuscrito de la obra en formato EPUB, PDF o ingresar sus capítulos.'

        genres_raw = data.get('genres')
        genre_ids = []
        if genres_raw:
            try:
                genre_ids = json.loads(genres_raw) if isinstance(genres_raw, str) else list(genres_raw)
            except Exception:
                genre_ids = []

        if not genre_ids:
            errors['genres'] = 'Debes seleccionar al menos una categoría o género literario de la plataforma.'

        if errors:
            return Response({
                'error': 'REQUISITOS_NO_CUMPLIDOS',
                'message': 'La obra no cumple con los requisitos mínimos de calidad editorial.',
                'details': errors
            }, status=status.HTTP_400_BAD_REQUEST)

        # ─── 2. Registro de la Obra y sus Componentes ───
        try:
            with transaction.atomic():
                # Autor
                author_name = (data.get('author_name') or '').strip()
                if not author_name:
                    author_name = request.user.get_full_name() or request.user.username

                author_slug = slugify(author_name)
                author, _ = Author.objects.get_or_create(
                    slug=author_slug,
                    defaults={
                        'full_name': author_name,
                        'bio': data.get('author_bio', f'Autor independiente en Literatus Novelist: {author_name}.'),
                    }
                )

                # Slug del Libro
                base_slug = slugify(title)
                book_slug = base_slug
                counter = 1
                while Book.objects.filter(slug=book_slug).exists():
                    book_slug = f"{base_slug}-{counter}"
                    counter += 1

                # Creación en estado EN REVISIÓN (No publicado)
                book = Book.objects.create(
                    title=title,
                    slug=book_slug,
                    synopsis=synopsis,
                    status=Book.StatusChoices.PENDING_REVIEW,
                    is_published=False,
                    difficulty_level=data.get('difficulty_level', Book.DifficultyChoices.INTERMEDIATE),
                    copyright_notice=data.get('copyright_notice', f'Obra original remitida por su autor ({author_name}) para difusión y lectura en Literatus Novelist.'),
                    submitted_by=request.user,
                    submission_declaration=True,
                )

                # Portada
                book.cover_image.save(f'cover_{book.pk}.jpg', cover_file, save=True)

                # Relación con Autor
                BookAuthor.objects.create(book=book, author=author, role=BookAuthor.RoleChoices.PRIMARY)

                # Géneros (soporta UUID, nombres o slugs)
                import uuid
                from django.db.models import Q
                genre_queries = Q()
                for item in genre_ids:
                    item_str = str(item).strip()
                    try:
                        uuid_obj = uuid.UUID(item_str)
                        genre_queries |= Q(id=uuid_obj)
                    except ValueError:
                        genre_queries |= Q(name__iexact=item_str) | Q(slug__iexact=slugify(item_str))

                valid_genres = Genre.objects.filter(genre_queries) if genre_queries else Genre.objects.none()
                book.genres.set(valid_genres)

                # Tags temáticos opcionales
                tags_raw = data.get('tags', '')
                if tags_raw:
                    for tag_name in [t.strip() for t in tags_raw.split(',') if t.strip()]:
                        t_slug = slugify(tag_name)[:150]
                        if t_slug:
                            tag, _ = Tag.objects.get_or_create(slug=t_slug, defaults={'name': tag_name[:150]})
                            book.tags.add(tag)

                # PDF si se adjuntó
                if pdf_file:
                    book.pdf_file.save(f'book_{book.pk}.pdf', pdf_file, save=True)
                    Edition.objects.create(
                        book=book,
                        format=Edition.FormatChoices.PDF,
                        price=0.00,
                        language='es'
                    )

                # EPUB si se adjuntó
                total_words = 0
                if epub_file:
                    try:
                        import ebooklib
                        from ebooklib import epub
                        from bs4 import BeautifulSoup
                        content = epub_file.read()
                        book_epub = epub.read_epub(BytesIO(content))
                        order = 1
                        for item in book_epub.get_items_of_type(ebooklib.ITEM_DOCUMENT):
                            name = item.get_name().lower()
                            if any(x in name for x in ['cover', 'titlepage', 'nav', 'toc']):
                                continue
                            raw = item.get_body_content().decode('utf-8', errors='ignore')
                            soup = BeautifulSoup(raw, 'html.parser')
                            text_only = soup.get_text(separator=' ', strip=True)
                            if len(text_only) > 80:
                                title_tag = soup.find('h1') or soup.find('h2') or soup.find('h3')
                                chapter_title = title_tag.text.strip() if title_tag else f'Capítulo {order}'
                                Chapter.objects.create(
                                    book=book,
                                    order=order,
                                    title=chapter_title[:200],
                                    content_html=str(soup),
                                )
                                total_words += len(text_only.split())
                                order += 1

                        epub_file.seek(0)
                        edition = Edition.objects.create(
                            book=book,
                            format=Edition.FormatChoices.EPUB,
                            price=0.00,
                            language='es'
                        )
                        edition.file.save(f'book_{book.pk}.epub', epub_file, save=True)
                    except Exception as epub_err:
                        print(f"[AuthorSubmitBook] Error procesando EPUB: {epub_err}")

                elif raw_chapters:
                    try:
                        parsed_chapters = json.loads(raw_chapters) if isinstance(raw_chapters, str) else raw_chapters
                        for idx, ch in enumerate(parsed_chapters, start=1):
                            ch_title = ch.get('title', f'Capítulo {idx}')
                            ch_html = ch.get('content_html', ch.get('content', ''))
                            Chapter.objects.create(
                                book=book,
                                order=idx,
                                title=ch_title[:200],
                                content_html=ch_html
                            )
                            total_words += len(ch_html.split())
                    except Exception as ch_err:
                        print(f"[AuthorSubmitBook] Error procesando capítulos: {ch_err}")

                if total_words > 0:
                    book.word_count = total_words
                    book.save(update_fields=['word_count'])

                return Response({
                    'success': True,
                    'message': '¡Tu obra ha sido enviada exitosamente al equipo editorial! Se encuentra en revisión.',
                    'book': {
                        'id': str(book.pk),
                        'title': book.title,
                        'slug': book.slug,
                        'status': book.status,
                        'status_label': book.get_status_display(),
                        'author': author.full_name,
                        'chapters_count': book.chapters.count(),
                        'word_count': book.word_count,
                        'created_at': book.created_at,
                    }
                }, status=status.HTTP_201_CREATED)

        except Exception as e:
            return Response({
                'error': 'SUBMISSION_FAILED',
                'message': f'Error interno al procesar el envío de la obra: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class AuthorMySubmissionsView(APIView):
    """
    GET /api/v1/catalog/author/my-submissions/
    Lista todas las obras enviadas por el autor autenticado con sus estados de curaduría.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        submissions = (
            Book.objects.filter(submitted_by=request.user)
            .annotate(anno_chapters_count=Count('chapters', distinct=True))
            .prefetch_related('genres', 'authors')
            .order_by('-created_at')
        )

        data = [
            {
                'id': str(b.pk),
                'title': b.title,
                'slug': b.slug,
                'status': b.status,
                'status_label': b.get_status_display(),
                'is_published': b.is_published,
                'difficulty_level': b.difficulty_level,
                'authors': [a.full_name for a in b.authors.all()],
                'genres': [g.name for g in b.genres.all()],
                'cover': request.build_absolute_uri(b.cover_image.url) if b.cover_image else None,
                'chapters_count': b.anno_chapters_count,
                'word_count': b.word_count,
                'editorial_notes': b.editorial_notes,
                'created_at': b.created_at,
                'updated_at': b.updated_at,
                'synopsis': b.synopsis,
            }
            for b in submissions
        ]

        return Response({
            'total': len(data),
            'count': len(data),
            'submissions': data
        })


class AuthorSubmissionRequirementsView(APIView):
    """
    GET /api/v1/catalog/author/requirements/
    Retorna la lista de requisitos mínimos editoriales que una obra debe cumplir.
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        requirements = [
            {
                'id': 'title',
                'code': 'title',
                'title': 'Título Identificatorio',
                'label': 'Título Identificatorio',
                'description': 'Mínimo 3 caracteres, sin faltas ortográficas graves ni mayúsculas sostenidas innecesarias.',
                'icon': 'title',
                'required': True,
                'mandatory': True
            },
            {
                'id': 'synopsis',
                'code': 'synopsis',
                'title': 'Sinopsis Editorial Completa',
                'label': 'Sinopsis Editorial Completa',
                'description': 'Descripción clara del argumento de al menos 50 caracteres para la evaluación del comité curador.',
                'icon': 'notes',
                'required': True,
                'mandatory': True
            },
            {
                'id': 'genres',
                'code': 'genres',
                'title': 'Categorización Literaria',
                'label': 'Categorización Literaria',
                'description': 'Asignación de al menos un género literario válido de la plataforma para su correcta catalogación.',
                'icon': 'category',
                'required': True,
                'mandatory': True
            },
            {
                'id': 'cover',
                'code': 'cover',
                'title': 'Portada en Alta Resolución',
                'label': 'Portada en Alta Resolución',
                'description': 'Imagen vertical legible y nítida (formato JPG, PNG o WebP), libre de marcas de agua comerciales.',
                'icon': 'image',
                'required': True,
                'mandatory': True
            },
            {
                'id': 'manuscript',
                'code': 'manuscript',
                'title': 'Manuscrito Completo',
                'label': 'Manuscrito Completo',
                'description': 'Archivo de la obra en formato EPUB estándar o documento PDF con capítulos identificables.',
                'icon': 'menu_book',
                'required': True,
                'mandatory': True
            },
            {
                'id': 'declaration',
                'code': 'declaration',
                'title': 'Declaración Jurada de Titularidad',
                'label': 'Declaración Jurada de Titularidad',
                'description': 'Aceptación expresa de titularidad conforme a la Ley N° 17.336 de Propiedad Intelectual.',
                'icon': 'gavel',
                'required': True,
                'mandatory': True
            },
        ]
        return Response({
            'requirements': requirements,
            'minimum_requirements': requirements,
            'guidelines': {
                'formats': ['EPUB', 'PDF', 'Redacción de Capítulos'],
                'max_file_size_mb': 40,
                'recommended_cover_aspect_ratio': '2:3 o 3:4',
                'review_sla_hours': 48
            },
            'editorial_policy': 'Literatus Novelist promueve la creación literaria independiente de calidad. Cada obra enviada pasa por un proceso de curaduría donde el equipo editorial evalúa la presentación y coherencia antes de su publicación en el catálogo abierto.'
        })
