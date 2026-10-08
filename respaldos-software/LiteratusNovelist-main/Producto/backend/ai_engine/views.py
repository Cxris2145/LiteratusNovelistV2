"""
ai_engine/views.py — Controladores de interacciones AI (Roleplay Inmersivo)
"""
import base64

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import generics, permissions, status
from django.db.models import Q
from django.db import transaction
from django.utils import timezone
from users.models import Profile
from django.shortcuts import get_object_or_404

from core.pagination import StandardResultsSetPagination

from library.models import UserInventory
from catalog.age import ensure_book_access, visible_books
from .models import AIAvatar, ChatSession, ChatMessage, AssistantConversation, AssistantMessage
from .serializers import (
    AIAvatarListSerializer,
    ChatSessionSerializer,
    ChatMessageSerializer,
    ChatInteractionSerializer,
    GlobalHubAvatarSerializer,
    AssistantConversationSerializer,
    AssistantMessageSerializer,
    AssistantChatSerializer,
)
from .services import AIService, AssistantAIService
from .tts_service import TTSService
from .kokoro_service import KokoroTTSService
from . import azure_tts
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
        ensure_book_access(request.user, edition.book)

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
    GET /api/v1/ai/avatars/<uuid:pk>/
    Devuelve el detalle de un avatar específico.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        avatar = get_object_or_404(AIAvatar, pk=pk)
        ensure_book_access(request.user, avatar.edition.book)
        serializer = GlobalHubAvatarSerializer(
            avatar,
            context={'request': request}
        )
        return Response(serializer.data)


class GlobalAvatarListView(generics.ListAPIView):
    """
    GET /api/v1/ai/hub/avatars/?q=&sort=popularity&page=&page_size=
    Hub Global: catálogo de avatares para la página estilo Character.ai.

    Pagina con StandardResultsSetPagination (?page_size hasta 50). El catálogo
    completo sigue siendo alcanzable: el frontend encadena páginas con scroll
    infinito en lugar de descargar los ~4.500 registros de una sola vez, que era
    lo que bloqueaba la página.
    """
    permission_classes = [permissions.AllowAny]
    serializer_class = GlobalHubAvatarSerializer
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        params = self.request.query_params
        query = params.get('q', '')
        sort_by = params.get('sort', 'name')  # name, popularity

        # select_related evita el N+1 de book_title/book_slug en el serializer.
        avatars = visible_books(AIAvatar.objects.select_related('edition__book'),
                                self.request.user, 'edition__book__')

        if query:
            avatars = avatars.filter(
                Q(name__icontains=query) |
                Q(description__icontains=query) |
                Q(edition__book__title__icontains=query)
            )

        # 'id' cierra siempre el orden. Casi todos los avatares empatan en
        # chat_count=0 y hay nombres repetidos entre ediciones, así que sin un
        # desempate único la paginación repetiría o se saltaría filas.
        if sort_by == 'popularity':
            return avatars.order_by('-chat_count', 'name', 'id')
        return avatars.order_by('name', 'id')


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
        sessions = visible_books(ChatSession.objects.filter(
            user=request.user
        ), request.user, 'avatar__edition__book__').select_related('avatar__edition__book').order_by('-updated_at')[:12]
        
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
        ensure_book_access(request.user, avatar.edition.book)

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
        ensure_book_access(request.user, session.avatar.edition.book)
        messages = session.messages.order_by('created_at')[:50]
        serializer = ChatMessageSerializer(messages, many=True)
        return Response(serializer.data)


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
        available = visible_books(AIAvatar.objects.select_related('edition__book'), request.user, 'edition__book__')
        try:
            if avatar_id and avatar_id != 'undefined':
                avatar = available.get(pk=avatar_id)
            else:
                avatar = available.filter(
                    name__icontains=self.DEMO_AVATAR_NAME
                ).select_related('edition__book').first()
                if not avatar:
                    avatar = available.order_by('-chat_count').first()
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

        if request.user.is_authenticated:
            return Response({'error': 'USE_ACCOUNT_CHAT', 'message': 'Usa el chat de tu cuenta para aplicar tu plan o una cotización de Tinta.'}, status=403)

        ip = self._get_client_ip(request)
        cache_key = f'demo_chat_ip_{ip}'
        msg_count = cache.get(cache_key, 0)

        if msg_count >= self.DEMO_MSG_LIMIT:
            return Response({
                'error': 'DEMO_LIMIT_REACHED',
                'message': f'Has usado tus {self.DEMO_MSG_LIMIT} mensajes de prueba de hoy. Regístrate y elige un plan o continúa con Tinta.',
                'remaining': 0,
            }, status=status.HTTP_429_TOO_MANY_REQUESTS)

        message = request.data.get('message', '').strip()
        avatar_id = request.data.get('avatar_id')

        if not message:
            return Response({'error': 'El campo "message" es requerido.'}, status=status.HTTP_400_BAD_REQUEST)

        if len(message) > 500:
            return Response({'error': 'El mensaje es demasiado largo (máx. 500 caracteres).'}, status=status.HTTP_400_BAD_REQUEST)

        # Buscar el avatar solicitado o el de demostración por defecto
        available = visible_books(AIAvatar.objects.select_related('edition__book'), request.user, 'edition__book__')
        try:
            if avatar_id and avatar_id != 'undefined':
                avatar = available.get(pk=avatar_id)
            else:
                avatar = available.filter(name__icontains=self.DEMO_AVATAR_NAME).first()
                if not avatar:
                    avatar = available.order_by('-chat_count').first()
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
    Genera la voz de un personaje en MP3 (base64). Usa Azure AI Speech si está
    configurado y, si no, Kokoro-82M (via Hugging Face Space).
    Acepta texto + avatar_id para usar la voz asignada al personaje.
    Costo: 2 créditos de tinta por frase.
    """
    permission_classes = [permissions.IsAuthenticated]
    MAX_AZURE_CHARS = 1000  # una respuesta del chat cabe completa en una sola llamada

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

        # Recuperar el personaje si se proporciona avatar_id (ids inválidos usan la voz por defecto)
        avatar = None
        if avatar_id:
            try:
                avatar = AIAvatar.objects.get(pk=avatar_id)
                ensure_book_access(request.user, avatar.edition.book)
            except (AIAvatar.DoesNotExist, ValueError, DjangoValidationError):
                pass

        if azure_tts.is_configured():
            voice_id = azure_tts.voice_for_avatar(avatar)
            clean_text = azure_tts.clean_text_for_speech(text)[:self.MAX_AZURE_CHARS]
            if not clean_text:
                return Response({"error": "El texto no tiene nada que leer."}, status=status.HTTP_400_BAD_REQUEST)
            try:
                audio_b64 = base64.b64encode(azure_tts.synthesize_mp3(clean_text, voice_id)).decode('ascii')
            except azure_tts.AzureTTSQuotaError as e:
                return Response({"error": "TTS_QUOTA_EXCEEDED", "message": str(e)},
                                status=status.HTTP_429_TOO_MANY_REQUESTS)
            except azure_tts.AzureTTSError as e:
                return Response({"error": "TTS_UNAVAILABLE", "message": str(e)},
                                status=status.HTTP_503_SERVICE_UNAVAILABLE)
            engine = 'azure'
        else:
            voice_id = (avatar.kokoro_voice_id if avatar else None) or 'af_bella'
            try:
                audio_b64 = KokoroTTSService().generate_audio_base64(text, voice_id)
            except Exception as e:
                err_str = str(e)
                if "cold start" in err_str.lower() or "timeout" in err_str.lower():
                    return Response({
                        "error": "KOKORO_COLD_START",
                        "message": "El servicio de voz está iniciando. Intenta de nuevo en 30 segundos."
                    }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
                return Response({"error": err_str}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            engine = 'kokoro'

        # Descontar tinta
        with transaction.atomic():
            profile = Profile.objects.select_for_update().get(user=request.user)
            if profile.ink_balance < COST:
                return Response({'error': 'INSUFFICIENT_INK', 'message': 'Tu saldo cambió durante la generación. No se realizó el cargo de audio.'}, status=402)
            profile.ink_balance -= COST
            profile.save(update_fields=['ink_balance'])
            from library.models import InkTransaction
            InkTransaction.objects.create(user=request.user, amount=-COST, concept='ai_audio',
                reference_id=str(avatar.pk) if avatar else '', balance_after=profile.ink_balance)

        return Response({
            "audio_base64": audio_b64,
            "ink_balance": profile.ink_balance,
            "voice_used": voice_id,
            "engine": engine,
        })


# ═══════════════════════════════════════════════════════════════════════════
# ASISTENTE GLOBAL DE LA PLATAFORMA (guía de uso, gratuito, no consume Tinta)
# ═══════════════════════════════════════════════════════════════════════════

ASSISTANT_GREETING = "Hola, ¿en qué puedo ayudarte dentro de Literatus?"


class AssistantConversationListView(APIView):
    """
    GET  /api/v1/ai/assistant/conversations/   Lista las conversaciones del usuario (más reciente primero).
    POST /api/v1/ai/assistant/conversations/   Crea una conversación nueva con el saludo inicial del Asistente.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        conversations = AssistantConversation.objects.filter(user=request.user).order_by('-updated_at')
        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(conversations, request)
        serializer = AssistantConversationSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        conversation = AssistantConversation.objects.create(user=request.user)
        AssistantMessage.objects.create(
            conversation=conversation,
            role=AssistantMessage.RoleChoices.ASSISTANT,
            content=ASSISTANT_GREETING,
        )
        serializer = AssistantConversationSerializer(conversation)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class AssistantConversationDetailView(APIView):
    """
    DELETE /api/v1/ai/assistant/conversations/<uuid>/ — el usuario borra una conversación.
    Borrado lógico, como el resto del proyecto: el soft delete no se propaga en cascada,
    así que los mensajes se marcan a mano para que tampoco cuenten en el panel de administración.
    """
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, conversation_id):
        # Filtrar por usuario: la conversación de otro responde 404, igual que una inexistente.
        conversation = get_object_or_404(AssistantConversation, id=conversation_id, user=request.user)
        now = timezone.now()
        with transaction.atomic():
            conversation.messages.update(is_active=False, deleted_at=now, updated_at=now)
            conversation.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AssistantMessageListView(APIView):
    """GET /api/v1/ai/assistant/conversations/<uuid>/messages/ — historial de una conversación."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, conversation_id):
        conversation = get_object_or_404(AssistantConversation, id=conversation_id, user=request.user)
        messages = conversation.messages.order_by('created_at')[:200]
        serializer = AssistantMessageSerializer(messages, many=True)
        return Response(serializer.data)


class AssistantChatView(APIView):
    """
    POST /api/v1/ai/assistant/chat/
    Envía un mensaje del usuario al Asistente global y devuelve su respuesta.
    Gratuito (no descuenta Tinta): es una guía de uso de la plataforma, no una
    interacción de roleplay con un personaje.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        serializer = AssistantChatSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        conversation_id = serializer.validated_data['conversation_id']
        message_content = serializer.validated_data['message']
        section = serializer.validated_data.get('section', '')

        conversation = get_object_or_404(AssistantConversation, id=conversation_id, user=request.user)
        if conversation.user != request.user:
            return Response(
                {"error": "No tienes permiso sobre esta conversación."},
                status=status.HTTP_403_FORBIDDEN
            )

        user_msg = AssistantMessage.objects.create(
            conversation=conversation,
            role=AssistantMessage.RoleChoices.USER,
            content=message_content,
            section=section,
        )

        # Título automático a partir del primer mensaje del usuario.
        if conversation.title == 'Nueva conversación':
            conversation.title = message_content[:60]
            conversation.save(update_fields=['title', 'updated_at'])
        else:
            conversation.save(update_fields=['updated_at'])

        try:
            assistant_service = AssistantAIService(conversation=conversation)
            reply_text = assistant_service.generate_reply(message_content, section=section)
        except Exception as e:
            user_msg.delete()
            return Response(
                {"error": f"Error del asistente: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        assistant_msg = AssistantMessage.objects.create(
            conversation=conversation,
            role=AssistantMessage.RoleChoices.ASSISTANT,
            content=reply_text,
        )

        return Response({
            "reply": assistant_msg.content,
            "timestamp": assistant_msg.created_at,
            "conversation_id": str(conversation.id),
            "conversation_title": conversation.title,
        }, status=status.HTTP_200_OK)


# ==============================================================================
# MINIJUEGO: EL INTERROGATORIO A CIEGAS (BLIND INTERROGATION)
# ==============================================================================
import random
from django.utils import timezone
from library.models import InkTransaction
from library.achievement_engine import reward_activity
from .models import BlindInterrogationSession
from .services import BlindInterrogationAIService


def _format_interrogation_session(session, include_secret=False):
    """Auxiliar para formatear los datos públicos de una sesión de interrogatorio con trazabilidad de biblioteca."""
    from .models import AIAvatar
    from library.models import UserInventory, Edition

    avatar_ids = session.candidate_order or []
    ensure_book_access(session.user, session.avatar.edition.book)
    avatars_by_id = {str(a.id): a for a in visible_books(
        AIAvatar.objects.filter(id__in=avatar_ids), session.user, 'edition__book__'
    ).select_related('edition__book')}
    
    # Conjunto de ediciones y libros adquiridos por el usuario
    user_inventory_editions = set(UserInventory.objects.filter(
        user=session.user,
        deleted_at__isnull=True
    ).values_list('edition_id', flat=True))

    user_book_ids = set(Edition.objects.filter(
        id__in=user_inventory_editions
    ).values_list('book_id', flat=True))

    suspects = []
    discarded_set = set(session.discarded_avatar_ids or [])
    for aid in avatar_ids:
        av = avatars_by_id.get(str(aid))
        if av:
            book = av.edition.book if av.edition else None
            book_title = book.title if book else "Obra literaria"
            book_id = book.id if book else None
            first_author = book.authors.first() if book else None
            author_name = first_author.full_name if first_author else ""
            img_url = av.avatar_image.url if av.avatar_image else ""

            # Determinar explícitamente si el libro está en la biblioteca del usuario
            is_in_library = bool(
                av.edition_id in user_inventory_editions or 
                (book_id and book_id in user_book_ids)
            )

            suspects.append({
                "id": str(av.id),
                "name": av.name,
                "book_title": book_title,
                "book_id": book_id,
                "author_name": author_name,
                "image": img_url,
                "is_discarded": str(av.id) in discarded_set,
                "is_in_library": is_in_library
            })

    owned_suspects_count = sum(1 for s in suspects if s.get("is_in_library"))
    catalog_suspects_count = len(suspects) - owned_suspects_count

    sec = session.avatar
    sec_book = sec.edition.book if sec.edition else None
    sec_book_id = sec_book.id if sec_book else None
    secret_is_in_library = bool(
        sec.edition_id in user_inventory_editions or 
        (sec_book_id and sec_book_id in user_book_ids)
    )

    data = {
        "id": str(session.id),
        "status": session.status,
        "questions_allowed": session.questions_allowed,
        "questions_used": session.questions_used,
        "questions_left": max(0, session.questions_allowed - session.questions_used),
        "extra_questions_bought": session.extra_questions_bought,
        "clues_bought": session.clues_bought,
        "discarded_avatar_ids": session.discarded_avatar_ids or [],
        "dialogue_history": session.dialogue_history or [],
        "suspects": suspects,
        "is_secret_in_library": secret_is_in_library,
        "owned_suspects_count": owned_suspects_count,
        "catalog_suspects_count": catalog_suspects_count,
        "ink_earned": session.ink_earned,
        "xp_earned": session.xp_earned,
        "is_official_daily": session.is_official_daily,
        "created_at": session.created_at,
    }

    if include_secret or session.status in ['won', 'lost', 'abandoned']:
        sec = session.avatar
        sec_book = sec.edition.book if sec.edition else None
        sec_author = sec_book.authors.first() if sec_book else None
        sec_book_id = sec_book.id if sec_book else None
        sec_in_library = bool(
            sec.edition_id in user_inventory_editions or 
            (sec_book_id and sec_book_id in user_book_ids)
        )

        data["secret_avatar"] = {
            "id": str(sec.id),
            "name": sec.name,
            "book_title": sec_book.title if sec_book else "",
            "book_id": sec_book_id,
            "author_name": sec_author.full_name if sec_author else "",
            "image": sec.avatar_image.url if sec.avatar_image else "",
            "description": sec.description or sec.behavioral_context or "",
            "is_in_library": sec_in_library
        }

    return data


class InterrogationStatusView(APIView):
    """
    GET /api/v1/ai/games/interrogation/status/
    Consulta el estado del interrogatorio del usuario: si hay partida activa,
    si ya jugó el reto oficial de hoy y su saldo de tinta.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        today = timezone.localdate()
        profile = getattr(request.user, 'profile', None)
        user_ink = profile.ink_balance if profile else 0

        # Buscar si tiene una sesión 'playing' activa
        active_session = BlindInterrogationSession.objects.filter(
            user=request.user,
            status='playing'
        ).first()

        # Verificar si ya completó el interrogatorio oficial de hoy
        daily_completed = BlindInterrogationSession.objects.filter(
            user=request.user,
            game_date=today,
            status__in=['won', 'lost', 'abandoned'],
            is_official_daily=True
        ).exists()

        last_session = BlindInterrogationSession.objects.filter(
            user=request.user,
            game_date=today,
            status__in=['won', 'lost', 'abandoned']
        ).first()

        return Response({
            "user_ink": user_ink,
            "has_active_session": active_session is not None,
            "active_session": _format_interrogation_session(active_session) if active_session else None,
            "daily_completed": daily_completed,
            "last_result": _format_interrogation_session(last_session, include_secret=True) if last_session else None
        }, status=status.HTTP_200_OK)


class InterrogationStartView(APIView):
    """
    POST /api/v1/ai/games/interrogation/start/
    Inicia una nueva partida de Interrogatorio a Ciegas. Si el usuario ya tiene
    una partida activa en curso, la retoma.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        today = timezone.localdate()
        from library.models import UserInventory, Edition

        # 1. Retomar partida activa si existe
        active_session = BlindInterrogationSession.objects.filter(
            user=request.user,
            status='playing'
        ).first()
        if active_session:
            return Response(_format_interrogation_session(active_session), status=status.HTTP_200_OK)

        # 2. Comprobar si es oficial del día
        already_official = BlindInterrogationSession.objects.filter(
            user=request.user,
            game_date=today,
            status__in=['won', 'lost', 'abandoned'],
            is_official_daily=True
        ).exists()
        is_official = not already_official

        # 3. Extraer avatares de la biblioteca del usuario
        owned_editions = set(UserInventory.objects.filter(
            user=request.user,
            deleted_at__isnull=True
        ).values_list('edition_id', flat=True))

        owned_book_ids = set(Edition.objects.filter(
            id__in=owned_editions
        ).values_list('book_id', flat=True))

        available = visible_books(AIAvatar.objects.all(), request.user, 'edition__book__')
        owned_avatars = list(available.filter(
            Q(edition_id__in=owned_editions) | Q(edition__book_id__in=owned_book_ids),
            is_author=False
        ).exclude(avatar_image='').select_related('edition__book'))

        fallback_avatars = list(available.filter(
            is_major_character=True,
            is_author=False
        ).exclude(avatar_image='').select_related('edition__book')[:60])

        if owned_avatars:
            # PRIORIZAR que el sospechoso secreto incógnito SEA DE LA BIBLIOTECA DEL USUARIO
            secret_avatar = random.choice(owned_avatars)
            other_owned = [a for a in owned_avatars if a.id != secret_avatar.id]
            distractors = []

            if len(other_owned) >= 3:
                distractors = random.sample(other_owned, 3)
            else:
                distractors.extend(other_owned)
                owned_ids = {a.id for a in owned_avatars}
                catalog_pool = [a for a in fallback_avatars if a.id not in owned_ids and a.id != secret_avatar.id]
                needed = 3 - len(distractors)
                if len(catalog_pool) >= needed:
                    distractors.extend(random.sample(catalog_pool, needed))
                else:
                    distractors.extend(catalog_pool)
        else:
            # Si el usuario no tiene avatares en su biblioteca, usar catálogo general
            if len(fallback_avatars) < 4:
                return Response(
                    {"error": "No hay suficientes personajes registrados para iniciar el interrogatorio."},
                    status=status.HTTP_400_BAD_REQUEST
                )
            secret_avatar = random.choice(fallback_avatars)
            distractor_pool = [a for a in fallback_avatars if a.id != secret_avatar.id]
            distractors = random.sample(distractor_pool, 3)

        distractor_ids = [str(d.id) for d in distractors]

        candidates = [secret_avatar] + distractors
        random.shuffle(candidates)
        candidate_order = [str(c.id) for c in candidates]

        greeting = (
            "Te observo desde los márgenes de una historia que crees conocer. "
            "Tienes tres preguntas para deducir quién soy antes de que la tinta se desvanezca..."
        )

        session = BlindInterrogationSession.objects.create(
            user=request.user,
            avatar=secret_avatar,
            distractor_avatar_ids=distractor_ids,
            candidate_order=candidate_order,
            questions_allowed=3,
            questions_used=0,
            extra_questions_bought=0,
            clues_bought=0,
            discarded_avatar_ids=[],
            dialogue_history=[
                {"role": "character", "content": greeting}
            ],
            status='playing',
            is_official_daily=is_official
        )

        return Response(_format_interrogation_session(session), status=status.HTTP_201_CREATED)


class InterrogationAskView(APIView):
    """
    POST /api/v1/ai/games/interrogation/ask/
    Formula una pregunta libre al personaje incógnito.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        session_id = request.data.get('session_id')
        question = (request.data.get('question') or '').strip()

        if not session_id or not question:
            return Response({"error": "Se requieren 'session_id' y 'question'."}, status=status.HTTP_400_BAD_REQUEST)

        session = get_object_or_404(BlindInterrogationSession, id=session_id, user=request.user)
        ensure_book_access(request.user, session.avatar.edition.book)
        if session.status != 'playing':
            return Response({"error": "Esta partida ya ha concluido."}, status=status.HTTP_400_BAD_REQUEST)

        if session.questions_used >= session.questions_allowed:
            return Response({
                "error": "QUESTIONS_EXHAUSTED",
                "message": "Has agotado tus preguntas. Puedes adquirir una pregunta extra con Tinta o intentar adivinar."
            }, status=status.HTTP_400_BAD_REQUEST)

        # Generar respuesta con IA
        ai_service = BlindInterrogationAIService(session.avatar, session)
        reply = ai_service.generate_reply(question)

        history = session.dialogue_history or []
        history.append({"role": "user", "content": question})
        history.append({"role": "character", "content": reply})

        session.dialogue_history = history
        session.questions_used += 1
        session.save(update_fields=['dialogue_history', 'questions_used', 'updated_at'])

        return Response({
            "reply": reply,
            "questions_used": session.questions_used,
            "questions_allowed": session.questions_allowed,
            "questions_left": max(0, session.questions_allowed - session.questions_used)
        }, status=status.HTTP_200_OK)


class InterrogationBuyPerkView(APIView):
    """
    POST /api/v1/ai/games/interrogation/buy-perk/
    Adquiere una ventaja usando Gotas de Tinta:
    - 'extra_question': 3 Tinta (+1 pregunta, máx 2 compras)
    - 'clue': 5 Tinta (confidencia íntima reveladora del personaje)
    - 'discard_two': 4 Tinta (elimina 2 de los 4 sospechosos)
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        session_id = request.data.get('session_id')
        perk = request.data.get('perk')

        if not session_id or perk not in ['extra_question', 'clue', 'discard_two']:
            return Response({"error": "Parámetros inválidos."}, status=status.HTTP_400_BAD_REQUEST)

        session = get_object_or_404(BlindInterrogationSession, id=session_id, user=request.user)
        ensure_book_access(request.user, session.avatar.edition.book)
        if session.status != 'playing':
            return Response({"error": "La partida ya ha concluido."}, status=status.HTTP_400_BAD_REQUEST)

        costs = {'extra_question': 3, 'clue': 5, 'discard_two': 4}
        cost = costs[perk]

        with transaction.atomic():
            profile = Profile.objects.select_for_update().get(user=request.user)
            if profile.ink_balance < cost:
                return Response({
                    "error": "INSUFFICIENT_INK",
                    "message": f"Necesitas {cost} Gotas de Tinta. Tu saldo actual es de {profile.ink_balance}."
                }, status=status.HTTP_400_BAD_REQUEST)

            clue_text = None

            if perk == 'extra_question':
                if session.extra_questions_bought >= 2:
                    return Response({"error": "Límite de preguntas adicionales alcanzado (máx 2)."}, status=status.HTTP_400_BAD_REQUEST)
                session.questions_allowed += 1
                session.extra_questions_bought += 1

            elif perk == 'clue':
                if session.clues_bought >= 1:
                    return Response({"error": "Ya has solicitado una pista en esta sesión."}, status=status.HTTP_400_BAD_REQUEST)
                ai_service = BlindInterrogationAIService(session.avatar, session)
                clue_text = ai_service.generate_clue()
                history = session.dialogue_history or []
                history.append({"role": "clue", "content": f"Confidencia del Tintero: \"{clue_text}\""})
                session.dialogue_history = history
                session.clues_bought += 1

            elif perk == 'discard_two':
                if session.discarded_avatar_ids:
                    return Response({"error": "Ya has utilizado el descarte 50/50."}, status=status.HTTP_400_BAD_REQUEST)
                distractors = list(session.distractor_avatar_ids or [])
                to_discard = random.sample(distractors, min(2, len(distractors)))
                session.discarded_avatar_ids = to_discard

            # Descontar tinta
            profile.ink_balance -= cost
            profile.save(update_fields=['ink_balance'])

            InkTransaction.objects.create(
                user=request.user,
                amount=-cost,
                concept='interrogation_perk',
                reference_id=str(session.id),
                balance_after=profile.ink_balance
            )

            session.save()

            return Response({
                "message": f"Ventaja activada exitosamente (-{cost} Gotas de Tinta).",
                "perk": perk,
                "new_ink_balance": profile.ink_balance,
                "session": _format_interrogation_session(session),
                "clue_text": clue_text
            }, status=status.HTTP_200_OK)


class InterrogationGuessView(APIView):
    """
    POST /api/v1/ai/games/interrogation/guess/
    Valida la deducción del usuario sobre la identidad del personaje misterioso.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        session_id = request.data.get('session_id')
        avatar_id = request.data.get('avatar_id')

        if not session_id or not avatar_id:
            return Response({"error": "Se requieren 'session_id' y 'avatar_id'."}, status=status.HTTP_400_BAD_REQUEST)

        session = get_object_or_404(BlindInterrogationSession, id=session_id, user=request.user)
        ensure_book_access(request.user, session.avatar.edition.book)
        if session.status != 'playing':
            return Response({"error": "La partida ya ha concluido."}, status=status.HTTP_400_BAD_REQUEST)

        is_won = (str(avatar_id) == str(session.avatar.id))

        with transaction.atomic():
            profile = Profile.objects.select_for_update().get(user=request.user)

            if is_won:
                session.status = 'won'
                # Cálculo de recompensa armónica
                if session.questions_used <= 1:
                    ink_reward = 15
                    xp_reward = 25
                elif session.questions_used == 2:
                    ink_reward = 10
                    xp_reward = 20
                elif session.questions_used == 3 and session.extra_questions_bought == 0:
                    ink_reward = 7
                    xp_reward = 15
                else:
                    ink_reward = 5
                    xp_reward = 10

                # Modo práctica (no oficial) otorga recompensa simbólica
                if not session.is_official_daily:
                    ink_reward = 2
                    xp_reward = 5

                reward_activity(
                    user=request.user,
                    activity_type='interrogation_win',
                    custom_ink=ink_reward,
                    custom_xp=xp_reward
                )
                session.ink_earned = ink_reward
                session.xp_earned = xp_reward
            else:
                session.status = 'lost'
                ink_reward = 0
                xp_reward = 5
                reward_activity(
                    user=request.user,
                    activity_type='interrogation_loss',
                    custom_ink=0,
                    custom_xp=xp_reward
                )
                session.ink_earned = 0
                session.xp_earned = xp_reward

            session.save()
            profile.refresh_from_db()

            return Response({
                "won": is_won,
                "ink_earned": ink_reward,
                "xp_earned": xp_reward,
                "new_ink_balance": profile.ink_balance,
                "session": _format_interrogation_session(session, include_secret=True)
            }, status=status.HTTP_200_OK)


class InterrogationAbandonView(APIView):
    """
    POST /api/v1/ai/games/interrogation/abandon/
    Registra el abandono de la partida penalizando con 0 puntos.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        session_id = request.data.get('session_id')
        if not session_id:
            return Response({"error": "Se requiere 'session_id'."}, status=status.HTTP_400_BAD_REQUEST)

        session = get_object_or_404(BlindInterrogationSession, id=session_id, user=request.user)
        if session.status == 'playing':
            session.status = 'abandoned'
            session.ink_earned = 0
            session.xp_earned = 0
            session.save(update_fields=['status', 'ink_earned', 'xp_earned', 'updated_at'])

        return Response({
            "status": "abandoned",
            "message": "Partida registrada como abandonada.",
            "session": _format_interrogation_session(session, include_secret=True)
        }, status=status.HTTP_200_OK)

