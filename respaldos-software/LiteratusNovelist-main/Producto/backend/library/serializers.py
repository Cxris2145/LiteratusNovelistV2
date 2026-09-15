from rest_framework import serializers
from .models import UserFavorite, UserInventory, ReadingProgress, UserBookmark
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

    class Meta:
        model = UserInventory
        fields = ['id', 'book_title', 'book_cover', 'book_slug', 'edition', 'acquired_at', 'progress']
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


