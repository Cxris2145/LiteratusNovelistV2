from rest_framework import serializers
from .models import UserFavorite, UserInventory, ReadingProgress, UserBookmark, UserHighlight, UserPostIt, Achievement, UserAchievement, ReadingSession, InkTransaction
from catalog.models import Book
from catalog.serializers import BookListSerializer, EditionSerializer


class UserFavoriteSerializer(serializers.ModelSerializer):
    """Expone la obra guardada y acepta únicamente su id al crearla."""

    book = BookListSerializer(read_only=True)
    book_id = serializers.PrimaryKeyRelatedField(
        queryset=Book.objects.filter(is_published=True),
        source='book',
        write_only=True,
    )

    class Meta:
        model = UserFavorite
        fields = ['id', 'book', 'book_id', 'created_at']
        read_only_fields = ['id', 'book', 'created_at']

    def validate_book_id(self, book):
        from catalog.age import ensure_book_access
        ensure_book_access(self.context['request'].user, book)
        return book

    def create(self, validated_data):
        user = self.context['request'].user
        book = validated_data['book']

        active = UserFavorite.objects.filter(user=user, book=book).first()
        if active:
            return active

        # Reutiliza el registro borrado lógicamente para no acumular duplicados.
        deleted = (
            UserFavorite.all_objects
            .filter(user=user, book=book, deleted_at__isnull=False)
            .order_by('-updated_at')
            .first()
        )
        if deleted:
            deleted.restore()
            return deleted

        favorite, _ = UserFavorite.objects.get_or_create(user=user, book=book)
        return favorite

class ReadingProgressSerializer(serializers.ModelSerializer):
    """
    Endpoint para inyecciones asíncronas PATCH.
    Permite enviar de parte de EPUB.js el current_cfi y 
    actualizar visualmente las barras de progreso front-end.
    """
    class Meta:
        model = ReadingProgress
        fields = ['id', 'current_cfi', 'current_page', 'completion_percentage', 'updated_at']
        read_only_fields = ['id', 'updated_at']

class UserBookmarkSerializer(serializers.ModelSerializer):
    """
    Manejo CRUD personal de anotaciones de libros adquiridos.
    """
    class Meta:
        model = UserBookmark
        fields = ['id', 'inventory', 'position_cfi', 'note', 'color', 'created_at']
        read_only_fields = ['id', 'created_at']

class UserHighlightSerializer(serializers.ModelSerializer):
    """
    Subrayados del lector. Al crear se fija el pasaje (capítulo y palabras); después solo cambia el color.
    """
    class Meta:
        model = UserHighlight
        fields = ['id', 'inventory', 'chapter', 'start_word', 'end_word', 'text', 'color', 'created_at']
        read_only_fields = ['id', 'created_at']

    def get_fields(self):
        fields = super().get_fields()
        if self.instance is not None:
            for name in ('inventory', 'chapter', 'start_word', 'end_word', 'text'):
                fields[name].read_only = True
        return fields

    def validate_text(self, value):
        value = ' '.join(value.split())
        if not value:
            raise serializers.ValidationError('Selecciona el texto que quieres subrayar.')
        return value[:2000]

    def validate(self, attrs):
        inventory = attrs.get('inventory') or self.instance.inventory
        if self.instance is None:
            if attrs['chapter'].book_id != inventory.edition.book_id:
                raise serializers.ValidationError({'chapter': 'Ese capítulo no es de este libro.'})
            start, end = attrs['start_word'], attrs['end_word']
            if end < start:
                raise serializers.ValidationError({'end_word': 'El pasaje termina antes de empezar.'})
            if end - start + 1 > UserHighlight.MAX_WORDS:
                raise serializers.ValidationError(
                    {'end_word': f'Puedes subrayar hasta {UserHighlight.MAX_WORDS} palabras de una vez.'})
            if UserHighlight.objects.filter(inventory=inventory).count() >= UserHighlight.MAX_HIGHLIGHTS_PER_BOOK:
                raise serializers.ValidationError(
                    f'Llegaste al máximo de {UserHighlight.MAX_HIGHLIGHTS_PER_BOOK} subrayados en este libro.')
        return attrs


class UserPostItSerializer(serializers.ModelSerializer):
    """
    Post-its del lector (máx. 30 por libro). Se pegan en un capítulo y una palabra; después se
    puede cambiar el texto o arrastrarlo a otra palabra del mismo capítulo.
    """
    class Meta:
        model = UserPostIt
        fields = ['id', 'inventory', 'chapter', 'word', 'text', 'created_at']
        read_only_fields = ['id', 'created_at']

    def get_fields(self):
        fields = super().get_fields()
        if self.instance is not None:
            for name in ('inventory', 'chapter'):
                fields[name].read_only = True
        return fields

    def validate_text(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Escribe algo en el post-it.')
        if len(value) > UserPostIt.MAX_CHARS:
            raise serializers.ValidationError(f'El post-it admite hasta {UserPostIt.MAX_CHARS} caracteres.')
        return value

    def validate(self, attrs):
        if self.instance is None:
            inventory = attrs['inventory']
            if attrs['chapter'].book_id != inventory.edition.book_id:
                raise serializers.ValidationError({'chapter': 'Ese capítulo no es de este libro.'})
            if UserPostIt.objects.filter(inventory=inventory).count() >= UserPostIt.MAX_PER_BOOK:
                raise serializers.ValidationError(
                    f'Ya pegaste {UserPostIt.MAX_PER_BOOK} post-its en este libro. Despega alguno para pegar otro.')
        return attrs


class UserInventorySerializer(serializers.ModelSerializer):
    """
    Vista global del inventario personal para la portada 'Mi Biblioteca'.
    Incluye un Edition nested read_only y el progreso numérico de lectura total.
    """
    edition = EditionSerializer(read_only=True)
    progress = ReadingProgressSerializer(read_only=True)
    book_title = serializers.SerializerMethodField()
    book_cover = serializers.SerializerMethodField()
    book_slug = serializers.SerializerMethodField()
    author_name = serializers.SerializerMethodField()
    page_count = serializers.IntegerField(source='edition.book.page_count', read_only=True)
    word_count = serializers.IntegerField(source='edition.book.word_count', read_only=True)
    min_age = serializers.IntegerField(source='edition.book.min_age', read_only=True)

    class Meta:
        model = UserInventory
        fields = ['id', 'book_title', 'book_cover', 'book_slug', 'author_name', 'page_count', 'word_count', 'edition', 'acquired_at', 'progress', 'min_age']
        read_only_fields = fields

    def get_book_title(self, obj):
        return obj.edition.book.title

    def get_book_slug(self, obj):
        return obj.edition.book.slug

    def get_author_name(self, obj):
        book = obj.edition.book
        book_authors = list(book.book_authors.all())
        if not book_authors:
            return None
        main_author = next((ba for ba in book_authors if ba.role == 'author'), None)
        if not main_author:
            main_author = book_authors[0]
        return main_author.author.full_name

    def get_book_cover(self, obj):
        if obj.edition.book.cover_image:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.edition.book.cover_image.url)
            return obj.edition.book.cover_image.url
        return None


class AchievementSerializer(serializers.ModelSerializer):
    """
    Serializer de solo lectura para el catálogo público de logros.
    Expone todos los campos visibles sin información de usuario.
    """
    reward = serializers.SerializerMethodField()

    class Meta:
        model = Achievement
        fields = [
            'id', 'code', 'title', 'description', 'category', 'rarity',
            'icon', 'badge_image', 'threshold', 'ink_reward', 'sort_order', 'reward',
        ]
        read_only_fields = fields

    def get_reward(self, obj):
        """Marco, título o accesorio que regala el logro (exclusivo si no se vende en El Bazar)."""
        item = obj.reward_item
        if item is None:
            return None
        return {
            'code': item.code, 'item_type': item.item_type, 'name': item.name,
            'value': item.value, 'icon': item.icon, 'is_exclusive': not item.is_purchasable,
        }


class UserAchievementSerializer(serializers.ModelSerializer):
    """
    Serializer de logros con progreso del usuario.
    Combina datos del catálogo (achievement nested) con el progreso personal.
    """
    achievement = AchievementSerializer(read_only=True)
    is_unlocked = serializers.BooleanField(read_only=True)
    progress_percentage = serializers.IntegerField(read_only=True)

    class Meta:
        model = UserAchievement
        fields = [
            'id', 'achievement', 'current_progress', 'progress_percentage',
            'is_unlocked', 'unlocked_at', 'notified',
        ]
        read_only_fields = [
            'id', 'achievement', 'current_progress', 'progress_percentage',
            'is_unlocked', 'unlocked_at',
        ]


class ReadingSessionSerializer(serializers.ModelSerializer):
    """
    Serializer para crear y cerrar sesiones de lectura.
    Escribe con book_id, lee con el id del libro.
    El usuario se inyecta desde la view (no se acepta del cliente).
    """
    book_id = serializers.PrimaryKeyRelatedField(
        queryset=Book.objects.filter(is_published=True),
        source='book',
        write_only=True,
    )
    book_title = serializers.CharField(source='book.title', read_only=True)

    class Meta:
        model = ReadingSession
        fields = [
            'id', 'book_id', 'book_title', 'started_at', 'ended_at',
            'chapters_read', 'created_at',
        ]
        read_only_fields = ['id', 'book_title', 'created_at']

    def validate_book_id(self, book):
        from catalog.age import ensure_book_access
        ensure_book_access(self.context['request'].user, book)
        return book

class InkTransactionSerializer(serializers.ModelSerializer):
    """
    Serializer para el historial de transacciones de Tinta.
    De solo lectura.
    """
    class Meta:
        model = InkTransaction
        fields = ['id', 'amount', 'concept', 'balance_after', 'created_at']
        read_only_fields = fields

class MissionSerializer(serializers.ModelSerializer):
    class Meta:
        from .models import Mission
        model = Mission
        fields = ['id', 'code', 'title', 'description', 'activity_type', 'target_count', 'ink_reward', 'xp_reward', 'reset_type']

class UserMissionSerializer(serializers.ModelSerializer):
    mission = MissionSerializer(read_only=True)
    is_completed = serializers.SerializerMethodField()
    progress_percentage = serializers.SerializerMethodField()

    class Meta:
        from .models import UserMission
        model = UserMission
        fields = ['id', 'mission', 'current_count', 'is_completed', 'progress_percentage', 'period_start', 'completed_at']
        
    def get_is_completed(self, obj):
        return obj.completed_at is not None
        
    def get_progress_percentage(self, obj):
        if not obj.mission.target_count:
            return 0
        p = (obj.current_count / obj.mission.target_count) * 100
        return min(100, round(p))
