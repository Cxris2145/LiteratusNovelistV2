from rest_framework import serializers
from .models import AIAvatar, ChatSession, ChatMessage


class AIAvatarListSerializer(serializers.ModelSerializer):
    """
    Serializer para la lista de avatares en el panel del lector.
    Incluye campo computado 'is_unlocked' basado en el progreso del usuario.
    """
    is_unlocked = serializers.SerializerMethodField()
    avatar_image_url = serializers.SerializerMethodField()
    video_avatar_url = serializers.SerializerMethodField()
    image_speaking_1_url = serializers.SerializerMethodField()
    image_speaking_2_url = serializers.SerializerMethodField()
    image_speaking_3_url = serializers.SerializerMethodField()
    image_thinking_url = serializers.SerializerMethodField()

    class Meta:
        model = AIAvatar
        fields = [
            'id', 'name', 'description', 'avatar_image_url', 'video_avatar_url',
            'image_speaking_1_url', 'image_speaking_2_url', 'image_speaking_3_url', 'image_thinking_url',
            'unlock_at_chapter', 'is_major_character', 'is_author',
            'is_unlocked', 'greeting_message',
        ]

    def get_is_unlocked(self, obj):
        # El autor siempre está disponible para chatear
        if obj.is_author:
            return True
        # El contexto 'current_chapter' es inyectado por la vista
        current_chapter = self.context.get('current_chapter', 0)
        return current_chapter >= obj.unlock_at_chapter

    def get_avatar_image_url(self, obj):
        request = self.context.get('request')
        if obj.avatar_image and obj.avatar_image.name and request:
            return request.build_absolute_uri(obj.avatar_image.url)
        return None

    def _get_manga_asset_fallback(self, obj, request, filename):
        if obj.avatar_image and obj.avatar_image.name and request:
            url = request.build_absolute_uri(obj.avatar_image.url)
            if 'manga_assets' in url:
                base_url = url.rsplit('/', 1)[0] + '/'
                return base_url + filename
        return None

    def get_video_avatar_url(self, obj):
        # El campo video_avatar fue eliminado en favor de las animaciones manga
        # Se mantiene por compatibilidad con el frontend si aún lo espera
        return None

    def get_image_speaking_1_url(self, obj):
        request = self.context.get('request')
        if obj.image_speaking_1 and obj.image_speaking_1.name and request:
            return request.build_absolute_uri(obj.image_speaking_1.url)
        return self._get_manga_asset_fallback(obj, request, 'talking_1.webp')

    def get_image_speaking_2_url(self, obj):
        request = self.context.get('request')
        if obj.image_speaking_2 and obj.image_speaking_2.name and request:
            return request.build_absolute_uri(obj.image_speaking_2.url)
        return self._get_manga_asset_fallback(obj, request, 'talking_2.webp')

    def get_image_speaking_3_url(self, obj):
        request = self.context.get('request')
        if obj.image_speaking_3 and obj.image_speaking_3.name and request:
            return request.build_absolute_uri(obj.image_speaking_3.url)
        return self._get_manga_asset_fallback(obj, request, 'talking_3.webp')

    def get_image_thinking_url(self, obj):
        request = self.context.get('request')
        if obj.image_thinking and obj.image_thinking.name and request:
            return request.build_absolute_uri(obj.image_thinking.url)
        return self._get_manga_asset_fallback(obj, request, 'thinking.webp')


class ChatSessionSerializer(serializers.ModelSerializer):
    """Serializer para crear/recuperar una sesión de chat."""
    id = serializers.CharField(read_only=True)  # UUID como string
    avatar_name = serializers.CharField(source='avatar.name', read_only=True)

    class Meta:
        model = ChatSession
        fields = ['id', 'title', 'avatar_name', 'created_at']


class ChatMessageSerializer(serializers.ModelSerializer):
    """Serializer para los mensajes individuales de una sesión."""
    class Meta:
        model = ChatMessage
        fields = ['id', 'role', 'content', 'created_at']


class ChatInteractionSerializer(serializers.Serializer):
    """
    Serializador para la entrada del endpoint de chat.
    Valida session_id (UUID) y mensaje.
    """
    session_id = serializers.UUIDField(required=True)
    message = serializers.CharField(required=True, max_length=2000)

class GlobalHubAvatarSerializer(serializers.ModelSerializer):
    """Serializer para el Hub Global de Personajes (Character.ai style)."""
    book_title = serializers.CharField(source='edition.book.title', read_only=True)
    book_slug = serializers.CharField(source='edition.book.slug', read_only=True)
    avatar_image_url = serializers.SerializerMethodField()
    tags = serializers.SerializerMethodField()
    trend_level = serializers.SerializerMethodField()

    class Meta:
        model = AIAvatar
        fields = [
            'id', 'name', 'book_title', 'book_slug', 'description', 'avatar_image_url',
            'tags', 'trend_level', 'chat_count'
        ]

    def get_avatar_image_url(self, obj):
        request = self.context.get('request')
        if obj.avatar_image and request:
            return request.build_absolute_uri(obj.avatar_image.url)
        return None

    def get_trend_level(self, obj):
        # Cálculo simple de tendencia basado en chat_count
        if obj.chat_count > 100: return 90
        if obj.chat_count > 50: return 70
        if obj.chat_count > 10: return 40
        return 10

    def get_tags(self, obj):
        tags = []
        if obj.is_author:
            tags.append("Autor")
        if obj.is_major_character:
            tags.append("Principal")
        return tags
