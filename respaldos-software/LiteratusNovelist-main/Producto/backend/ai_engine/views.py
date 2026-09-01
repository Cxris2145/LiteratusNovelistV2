"""
ai_engine/views.py — Controladores de interacciones AI (Roleplay Inmersivo)
"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions, status
from django.shortcuts import get_object_or_404

from library.models import UserInventory
from .models import AIAvatar, ChatSession, ChatMessage
from .serializers import (
    AIAvatarListSerializer,
    ChatSessionSerializer,
    ChatMessageSerializer,
    ChatInteractionSerializer,
    GlobalHubAvatarSerializer,
)
from .services import AIService
from .tts_service import TTSService
from .kokoro_service import KokoroTTSService
from core.decorators import consume_ink
from django.utils.decorators import method_decorator


class AvatarListView(APIView):
    """
    GET /api/v1/ai/avatars/?inventory_id=<uuid>
    Devuelve todos los avatares de la edición con el campo 'is_unlocked'
    calculado según el progreso real del usuario autenticado.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        inventory_id = request.query_params.get('inventory_id')
        if not inventory_id:
            return Response(
                {"error": "Se requiere el parámetro 'inventory_id'."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Validar que el inventario pertenece al usuario
        inventory = get_object_or_404(
            UserInventory,
            id=inventory_id,
            user=request.user
        )
        edition = inventory.edition

        # Obtener el capítulo actual del usuario (base 0 = índice desde 0)
        current_chapter = 0
        if hasattr(inventory, 'progress') and inventory.progress:
            current_chapter = inventory.progress.current_page  # guardamos capítulo aquí

        avatars = AIAvatar.objects.filter(edition=edition).order_by('unlock_at_chapter', 'name')
        serializer = AIAvatarListSerializer(
            avatars,
            many=True,
            context={
                'request': request,
                'current_chapter': current_chapter,
            }
        )
        return Response(serializer.data)


class AvatarDetailView(APIView):
    """
    GET /api/v1/ai/avatars/<int:pk>/
    Devuelve el detalle de un avatar específico.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        avatar = get_object_or_404(AIAvatar, pk=pk)
        serializer = GlobalHubAvatarSerializer(
            avatar,
            context={'request': request}
        )
        return Response(serializer.data)


class GlobalAvatarListView(APIView):
    """
    GET /api/v1/ai/hub/avatars/
    Hub Global: Devuelve TODOS los avatares para la página estilo Character.ai
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        query = request.query_params.get('q', '')
        sort_by = request.query_params.get('sort', 'name') # name, popularity

        avatars = AIAvatar.objects.select_related('edition__book').all()

        if query:
            from django.db.models import Q
            avatars = avatars.filter(
                Q(name__icontains=query) | 
                Q(description__icontains=query) |
                Q(edition__book__title__icontains=query)
            )

        if sort_by == 'popularity':
            avatars = avatars.order_by('-chat_count', 'name')
        else:
            avatars = avatars.order_by('name')

        serializer = GlobalHubAvatarSerializer(
            avatars,
            many=True,
            context={'request': request}
        )
        return Response(serializer.data)


class RecentChatsView(APIView):
    """
    GET /api/v1/ai/hub/recent/
    Devuelve los personajes con los que el usuario ha chateado recientemente.
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        if not request.user.is_authenticated:
            return Response([])

        # Obtener las sesiones más recientes (updated_at se actualiza con nuevos mensajes)
        # Usamos updated_at de la sesión o created_at. TimeStampedModel tiene ambos.
        sessions = ChatSession.objects.filter(
            user=request.user
        ).select_related('avatar__edition__book').order_by('-updated_at')[:12]
        
        avatars = [s.avatar for s in sessions]
        
        serializer = GlobalHubAvatarSerializer(
            avatars,
            many=True,
            context={'request': request}
        )
        return Response(serializer.data)


class ChatSessionView(APIView):
    """
    GET  /api/v1/ai/sessions/?avatar_id=<int> → Recuperar o crear sesión
    POST /api/v1/ai/sessions/ → (reservado, se crea vía GET con get_or_create)
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        avatar_id = request.query_params.get('avatar_id')
        if not avatar_id:
            return Response(
                {"error": "Se requiere el parámetro 'avatar_id'."},
                status=status.HTTP_400_BAD_REQUEST
            )

        avatar = get_object_or_404(AIAvatar, id=avatar_id)

        # Si es un personaje principal o autor, permitir chat aunque no esté en inventario
        # (Para permitir exploración desde el Hub Global)
        is_public = avatar.is_major_character or avatar.is_author
        
        owns = UserInventory.objects.filter(
            user=request.user,
            edition=avatar.edition
        ).exists()
        
        if not owns and not is_public:
            return Response(
                {"error": "No posees esta obra."},
                status=status.HTTP_403_FORBIDDEN
            )

        # Obtener o crear la sesión (una por usuario+avatar)
        session, created = ChatSession.objects.get_or_create(
            user=request.user,
            avatar=avatar,
            defaults={'title': f'Chat con {avatar.name}'}
        )

        if created:
            # CORRECCIÓN DE RACE CONDITION (Sección 8 — DB Audit):
            # Usar avatar.chat_count += 1 / avatar.save() es inseguro bajo concurrencia:
            # dos requests simultáneos leen el mismo valor (ej: 5), ambos suman 1
            # y ambos guardan 6, perdiendo un incremento.
            # La expresión F() delega la operación a PostgreSQL:
            #   UPDATE ai_engine_aiavatar SET chat_count = chat_count + 1 WHERE id = '...'
            # Esto es atómico a nivel de base de datos, sin importar la concurrencia.
            from django.db.models import F
            AIAvatar.objects.filter(pk=avatar.pk).update(chat_count=F('chat_count') + 1)

        # Añadir el greeting como primer mensaje si la sesión es nueva
        if not session.messages.exists():
            ChatMessage.objects.create(
                session=session,
                role=ChatMessage.RoleChoices.ASSISTANT,
                content=avatar.greeting_message
            )

        serializer = ChatSessionSerializer(session)
        return Response(serializer.data)


class ChatHistoryView(APIView):
    """
    GET /api/v1/ai/sessions/<session_id>/messages/
    Devuelve los últimos 50 mensajes de la sesión.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, session_id):
        session = get_object_or_404(ChatSession, id=session_id, user=request.user)
        messages = session.messages.order_by('created_at')[:50]
        serializer = ChatMessageSerializer(messages, many=True)
        return Response(serializer.data)


class ChatInteractionView(APIView):
    """
    POST /api/v1/ai/chat/
    Orquesta la validación de propiedad, descuento de tinta, inyección de
    historial y entrega de la respuesta del LLM.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        serializer = ChatInteractionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        session_id = serializer.validated_data['session_id']
        message_content = serializer.validated_data['message']

        session = get_object_or_404(ChatSession, id=session_id)

        # Verificar pertenencia de sesión
        if session.user != request.user:
            return Response(
                {"error": "No tienes permiso sobre esta sesión de chat."},
                status=status.HTTP_403_FORBIDDEN
            )

        # 1. Validación de Tinta Base (Mínimo 1 para DeepSeek)
        profile = request.user.profile
        if profile.ink_balance < 1:
            return Response({
                "error": "INSUFFICIENT_INK",
                "message": "No tienes tinta suficiente para chatear."
            }, status=status.HTTP_402_PAYMENT_REQUIRED)

        # Guardar mensaje del usuario
        user_msg = ChatMessage.objects.create(
            session=session,
            role=ChatMessage.RoleChoices.USER,
            content=message_content
        )

        try:
            ai_service = AIService(avatar=session.avatar, session=session)
            ai_result = ai_service.generate_reply(message_content)
            
            ai_response_text = ai_result["text"]
            provider = ai_result["provider"]
            cost = ai_result["cost"]
            ai_status = ai_result["status"]

            # 2. Descuento Dinámico de Tinta
            if profile.ink_balance < cost:
                # Si falló Gemini pero no tiene para Gemini, y DeepSeek no está disponible...
                # El servicio ya debería haber devuelto un mensaje de error o haber intentado DeepSeek.
                # Si el costo es 2 pero solo tiene 1, y el servicio devolvió Gemini, forzamos error o ajustamos.
                # Pero la lógica del servicio ya intenta DeepSeek si Gemini falla.
                pass 
            
            profile.ink_balance = max(0, profile.ink_balance - cost)
            profile.save()

            assistant_msg = ChatMessage.objects.create(
                session=session,
                role=ChatMessage.RoleChoices.ASSISTANT,
                content=ai_response_text
            )

            return Response({
                "reply": assistant_msg.content,
                "timestamp": assistant_msg.created_at,
                "ink_balance": profile.ink_balance,
                "ai_provider": provider,
                "ai_status": ai_status,
                "cost": cost
            }, status=status.HTTP_200_OK)

        except Exception as e:
            user_msg.delete()
            return Response(
                {"error": f"Error del motor de IA: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

class DemoChatView(APIView):
    """
    POST /api/v1/ai/demo-chat/
    Chat de demostración público para visitantes sin cuenta.
    - No requiere autenticación.
    - Limitado a DEMO_MSG_LIMIT mensajes por IP por día (TTL = 24h en caché).
    - Acepta avatar_id para chatear con cualquier personaje.
    """
    permission_classes = [permissions.AllowAny]

    DEMO_MSG_LIMIT = 3       # mensajes máximos por IP por día
    DEMO_AVATAR_NAME = 'Don Quijote'  # Fallback si no se pasa avatar_id

    def _get_client_ip(self, request):
        """Extrae la IP real del visitante, considerando proxies (Vercel/Cloudflare)."""
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            return x_forwarded_for.split(',')[0].strip()
        return request.META.get('REMOTE_ADDR', '0.0.0.0')

    def get(self, request):
        """GET /api/v1/ai/demo-chat/?avatar_id=<int> — Devuelve info del personaje para la UI."""
        avatar_id = request.query_params.get('avatar_id')
        try:
            if avatar_id and avatar_id != 'undefined':
                avatar = AIAvatar.objects.select_related('edition__book').get(pk=avatar_id)
            else:
                avatar = AIAvatar.objects.filter(
                    name__icontains=self.DEMO_AVATAR_NAME
                ).select_related('edition__book').first()
                if not avatar:
                    avatar = AIAvatar.objects.select_related('edition__book').order_by('-chat_count').first()
            if not avatar:
                return Response({'error': 'No hay personajes disponibles.'}, status=status.HTTP_404_NOT_FOUND)
        except (AIAvatar.DoesNotExist, ValueError):
            return Response({'error': 'Personaje no encontrado o ID inválido.'}, status=status.HTTP_404_NOT_FOUND)

        # Comprobar cuántos mensajes le quedan a esta IP
        ip = self._get_client_ip(request)
        from django.core.cache import cache
        cache_key = f'demo_chat_ip_{ip}'
        msg_count = cache.get(cache_key, 0)
        remaining = max(0, self.DEMO_MSG_LIMIT - msg_count)

        serializer = GlobalHubAvatarSerializer(avatar, context={'request': request})
        data = dict(serializer.data)
        data['remaining_messages'] = remaining
        data['limit'] = self.DEMO_MSG_LIMIT
        data['greeting_message'] = avatar.greeting_message
        return Response(data)

    def post(self, request):
        from django.core.cache import cache

        ip = self._get_client_ip(request)
        cache_key = f'demo_chat_ip_{ip}'
        msg_count = cache.get(cache_key, 0)

        if msg_count >= self.DEMO_MSG_LIMIT:
            return Response({
                'error': 'DEMO_LIMIT_REACHED',
                'message': f'Has usado tus {self.DEMO_MSG_LIMIT} mensajes de prueba de hoy. ¡Regístrate gratis para chatear sin límites!',
                'remaining': 0,
            }, status=status.HTTP_429_TOO_MANY_REQUESTS)

        message = request.data.get('message', '').strip()
        avatar_id = request.data.get('avatar_id')

        if not message:
            return Response({'error': 'El campo "message" es requerido.'}, status=status.HTTP_400_BAD_REQUEST)

        if len(message) > 500:
            return Response({'error': 'El mensaje es demasiado largo (máx. 500 caracteres).'}, status=status.HTTP_400_BAD_REQUEST)

        # Buscar el avatar solicitado o el de demostración por defecto
        try:
            if avatar_id and avatar_id != 'undefined':
                avatar = AIAvatar.objects.get(pk=avatar_id)
            else:
                avatar = AIAvatar.objects.filter(name__icontains=self.DEMO_AVATAR_NAME).first()
                if not avatar:
                    avatar = AIAvatar.objects.order_by('-chat_count').first()
            if not avatar:
                return Response({'error': 'No hay personajes de demostración disponibles.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except (AIAvatar.DoesNotExist, ValueError):
            return Response({'error': 'Personaje no encontrado o ID inválido.'}, status=status.HTTP_404_NOT_FOUND)

        # Sesión temporal en memoria (sin guardar en BD)
        class FakeSession:
            def __init__(self, av):
                self.avatar = av
                self.messages = type('obj', (object,), {
                    'order_by': lambda self, *a, **kw: type('qs', (object,), {
                        '__getitem__': lambda s, k: [],
                        '__iter__': lambda s: iter([]),
                    })()
                })()

        fake_session = FakeSession(avatar)

        try:
            ai_service = AIService(avatar=avatar, session=fake_session)
            ai_result = ai_service.generate_reply(message)
            reply_text = ai_result.get('text', 'No pude responder en este momento.')
        except Exception as e:
            return Response({'error': f'Error del motor IA: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # Incrementar el contador de mensajes (TTL = 86400s = 24h)
        new_count = msg_count + 1
        cache.set(cache_key, new_count, timeout=86400)
        remaining = max(0, self.DEMO_MSG_LIMIT - new_count)

        return Response({
            'reply': reply_text,
            'avatar_name': avatar.name,
            'remaining_messages': remaining,
            'limit': self.DEMO_MSG_LIMIT,
        }, status=status.HTTP_200_OK)


class TTSGenerateView(APIView):

    """
    POST /api/v1/ai/audio/generate/
    Genera audio con Kokoro-82M (via Hugging Face Space).
    Acepta texto + avatar_id para usar la voz asignada al personaje.
    Costo: 2 créditos de tinta por frase.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        text = request.data.get("text", "").strip()
        avatar_id = request.data.get("avatar_id")  # Opcional: para recuperar la voz del personaje

        if not text:
            return Response({"error": "Se requiere el campo 'text'."}, status=status.HTTP_400_BAD_REQUEST)

        # Validación de Tinta (Costo: 2 créditos por frase — más justo que ElevenLabs)
        COST = 2
        profile = getattr(request.user, "profile", None)
        if not profile or profile.ink_balance < COST:
            return Response({
                "error": "INSUFFICIENT_INK",
                "message": f"Necesitas {COST} créditos de tinta para la narración."
            }, status=status.HTTP_402_PAYMENT_REQUIRED)

        # Recuperar voz del personaje si se proporciona avatar_id
        voice_id = 'af_bella'  # voz por defecto
        if avatar_id:
            try:
                avatar = AIAvatar.objects.get(pk=avatar_id)
                voice_id = avatar.kokoro_voice_id or 'af_bella'
            except AIAvatar.DoesNotExist:
                pass  # Usar voz por defecto

        try:
            tts = KokoroTTSService()
            audio_b64 = tts.generate_audio_base64(text, voice_id)

            # Descontar tinta
            profile.ink_balance = max(0, profile.ink_balance - COST)
            profile.save()

            return Response({
                "audio_base64": audio_b64,
                "ink_balance": profile.ink_balance,
                "voice_used": voice_id,
            })

        except Exception as e:
            err_str = str(e)
            if "cold start" in err_str.lower() or "timeout" in err_str.lower():
                return Response({
                    "error": "KOKORO_COLD_START",
                    "message": "El servicio de voz está iniciando. Intenta de nuevo en 30 segundos."
                }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
            return Response({"error": err_str}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
