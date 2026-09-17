from rest_framework import serializers
from .models import UserFavorite, UserInventory, ReadingProgress, UserBookmark, Achievement, UserAchievement, ReadingSession, InkTransaction
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
    page_count = serializers.IntegerField(source='edition.book.page_count', read_only=True)
    word_count = serializers.IntegerField(source='edition.book.word_count', read_only=True)

    class Meta:
        model = UserInventory
        fields = ['id', 'book_title', 'book_cover', 'book_slug', 'page_count', 'word_count', 'edition', 'acquired_at', 'progress']
        read_only_fields = fields

    def get_book_title(self, obj):
        return obj.edition.book.title

    def get_book_slug(self, obj):
        return obj.edition.book.slug

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
    class Meta:
        model = Achievement
        fields = [
            'id', 'code', 'title', 'description', 'category',
            'icon', 'badge_image', 'threshold', 'ink_reward', 'sort_order',
        ]
        read_only_fields = fields


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
