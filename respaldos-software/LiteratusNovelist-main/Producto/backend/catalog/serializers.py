from rest_framework import serializers
from .models import Author, Genre, Book, Edition, BookAuthor, Review
from ai_engine.models import AIAvatar

class AuthorReadSerializer(serializers.ModelSerializer):
    """
    Lectura de modelo Autor. Incluye el slug precalculado útil para rutas SEO.
    """
    books_count = serializers.SerializerMethodField()

    class Meta:
        model = Author
        fields = ['id', 'full_name', 'slug', 'bio', 'nationality', 'photo', 'books_count']

    def get_books_count(self, obj):
        return obj.author_books.count()

class AuthorDetailSerializer(serializers.ModelSerializer):
    """
    Ficha de autor completa. Incluye temas, libro recomendado y todas sus obras.
    """
    books = serializers.SerializerMethodField()
    recommended_book_slug = serializers.SerializerMethodField()

    class Meta:
        model = Author
        fields = ['id', 'full_name', 'slug', 'bio', 'nationality', 'photo', 'themes', 'recommended_book', 'recommended_book_slug', 'books']

    def get_books(self, obj):
        # Obtenemos todos los BookAuthor para este autor, luego extraemos los libros.
        # Esto previene el problema N+1 si lo optimizamos en la vista.
        books = [ba.book for ba in obj.author_books.all().select_related('book')]
        # Import local para evitar dependencia circular
        from .serializers import BookListSerializer
        return BookListSerializer(books, many=True, context=self.context).data

    def get_recommended_book_slug(self, obj):
        if obj.recommended_book:
            return obj.recommended_book.slug
        return None

class GenreSerializer(serializers.ModelSerializer):
    """
    Metadatos de clasificación que acompañarán anidados a los libros.
    """
    book_count = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = Genre
        fields = ['id', 'name', 'slug', 'cover_image', 'book_count']

class EditionSerializer(serializers.ModelSerializer):
    """
    Versiones comerciales de un libro que indican formato, precio e ISO de lenguaje.
    """
    display_name = serializers.SerializerMethodField()
    book = serializers.SerializerMethodField()

    class Meta:
        model = Edition
        fields = ['id', 'language', 'isbn', 'format', 'price', 'published_date', 'publisher', 'display_name', 'book']

    def get_display_name(self, obj):
        return f"{obj.get_format_display()} - {obj.language.upper()}"

    def get_book(self, obj):
        from .serializers import BookListSerializer
        return BookListSerializer(obj.book, context=self.context).data

class BookAuthorSerializer(serializers.ModelSerializer):
    """
    Estructura puente: muestra el ROL que ejerció la persona sobre la obra 
    y adjunta toda su información en el objeto `author`.
    """
    author = AuthorReadSerializer(read_only=True)
    
    class Meta:
        model = BookAuthor
        fields = ['role', 'author']

class BookListSerializer(serializers.ModelSerializer):
    """
    Serializador liviano para vistas de listado general (Pagination/Search).
    Prevenir el impacto N+1, no extraemos Ediciones ni Autores pesados.
    """
    genres = GenreSerializer(many=True, read_only=True)
    tags = serializers.SerializerMethodField()
    price = serializers.SerializerMethodField()
    author_name = serializers.SerializerMethodField()
    ai_character_count = serializers.IntegerField(read_only=True)
    
    class Meta:
        model = Book
        fields = ['id', 'title', 'slug', 'synopsis', 'is_featured', 'cover_image', 'genres', 'tags', 'price', 'author_name', 'ai_character_count']

    def get_price(self, obj):
        editions = obj.editions.all()
        edition = editions[0] if len(editions) > 0 else None
        return int(edition.price) if edition else 0

    def get_tags(self, obj):
        return [{'name': t.name, 'slug': t.slug} for t in obj.tags.all()]

    def get_author_name(self, obj):
        """Devuelve el nombre del primer autor principal del libro."""
        # Usamos .all() y Python para aprovechar el prefetch_related y evitar N+1 queries
        book_authors = list(obj.book_authors.all())
        if not book_authors:
            return None
        
        main_author = next((ba for ba in book_authors if ba.role == 'author'), None)
        if not main_author:
            main_author = book_authors[0]
            
        return main_author.author.full_name


class BookDetailSerializer(serializers.ModelSerializer):
    """
    Serializador profundo mediante Nested Relations para la ficha de detalle final 
    del catálogo. Consolida Autores (roles), Categorías multietiqueta y Ediciones en venta.
    """
    genres = GenreSerializer(many=True, read_only=True)
    book_authors = BookAuthorSerializer(many=True, read_only=True)
    editions = EditionSerializer(many=True, read_only=True)
    price = serializers.SerializerMethodField()

    class Meta:
        model = Book
        fields = ['id', 'title', 'slug', 'synopsis', 'cover_image', 'genres', 'book_authors', 'editions', 'price', 'created_at']

    def get_price(self, obj):
        editions = obj.editions.all()
        edition = editions[0] if len(editions) > 0 else None
        return int(edition.price) if edition else 0

class AIAvatarLightSerializer(serializers.ModelSerializer):
    """
    Serializador ligero para mostrar avatares en la ficha del libro.
    """
    class Meta:
        model = AIAvatar
        fields = ['id', 'name', 'description', 'avatar_image', 'is_major_character', 'is_author']

class ReviewSerializer(serializers.ModelSerializer):
    """
    Reseñas de usuarios.
    """
    username = serializers.CharField(source='user.username', read_only=True)
    user_avatar = serializers.ImageField(source='user.profile.avatar', read_only=True)

    class Meta:
        model = Review
        fields = ['id', 'username', 'user_avatar', 'rating', 'comment', 'created_at']

class BookDetailFullSerializer(BookDetailSerializer):
    """
    Serializador completo para el modal, incluye información nutricional:
    avatares, tiempo estimado de lectura y comentarios.
    """
    reviews = ReviewSerializer(many=True, read_only=True)
    avatars = serializers.SerializerMethodField()
    estimated_reading_time = serializers.SerializerMethodField()
    is_owned = serializers.SerializerMethodField()
    inventory_id = serializers.SerializerMethodField()
    ink_balance = serializers.SerializerMethodField()
    has_premium_narration = serializers.SerializerMethodField()
    total_words = serializers.SerializerMethodField()

    class Meta(BookDetailSerializer.Meta):
        fields = BookDetailSerializer.Meta.fields + [
            'difficulty_level', 'is_published', 'reviews', 'avatars', 'estimated_reading_time',
            'is_owned', 'inventory_id', 'ink_balance', 'price', 'has_premium_narration', 
            'total_words', 'copyright_notice', 'view_count', 'download_count', 'created_at',
            'tags'
        ]

    def get_avatars(self, obj):
        # Recolectar todos los avatares de todas las ediciones del libro pero filtrar duplicados por nombre
        # Esto evita que el mismo personaje/autor aparezca N veces si el libro tiene N ediciones
        avatars_qs = AIAvatar.objects.filter(edition__book=obj)
        
        unique_avatars = []
        seen_names = set()
        for avatar in avatars_qs:
            if avatar.name not in seen_names:
                seen_names.add(avatar.name)
                unique_avatars.append(avatar)
                
        return AIAvatarLightSerializer(unique_avatars, many=True, context=self.context).data

    def get_total_words(self, obj):
        """Calcula el total de palabras de todos los capítulos."""
        chapters = obj.chapters.all()
        total_words = 0
        for chapter in chapters:
            if chapter.content_html:
                total_words += len(chapter.content_html.split())
        return total_words

    def get_estimated_reading_time(self, obj):
        """
        Calcula el tiempo estimado basado en 250 palabras por minuto.
        """
        total_words = self.get_total_words(obj)
        
        if total_words == 0:
            total_words = len(obj.synopsis.split()) * 5
            if total_words == 0:
                return "1 min"
                
        minutes = total_words // 250
        if minutes < 60:
            return f"{max(1, minutes)} min"
        else:
            hours = minutes // 60
            remaining_mins = minutes % 60
            if remaining_mins > 0:
                return f"{hours}h {remaining_mins}m"
            return f"{hours}h"

    def get_is_owned(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            from library.models import UserInventory
            return UserInventory.objects.filter(user=request.user, edition__book=obj).exists()
        return False

    def get_inventory_id(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            from library.models import UserInventory
            inv = UserInventory.objects.filter(user=request.user, edition__book=obj).first()
            return str(inv.id) if inv else None
        return None

    def get_has_premium_narration(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            from library.models import UserInventory
            inv = UserInventory.objects.filter(user=request.user, edition__book=obj).first()
            return inv.has_premium_narration if inv else False
        return False

    def get_ink_balance(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated and hasattr(request.user, 'profile'):
            return request.user.profile.ink_balance
        return 0
        
