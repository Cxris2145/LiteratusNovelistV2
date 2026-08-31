"""
ai_engine/urls.py — Enrutador de IA
"""
from django.urls import path
from .views import (
    AvatarListView,
    AvatarDetailView,
    GlobalAvatarListView,
    HubBookListView,
    HubBookAvatarsView,
    RecentChatsView,
    ChatSessionView,
    ChatHistoryView,
    ChatInteractionView,
    TTSGenerateView,
    DemoChatView,
)

urlpatterns = [
    # Hub Global: Todos los personajes de todos los libros
    # GET /api/v1/ai/hub/avatars/
    path('hub/avatars/', GlobalAvatarListView.as_view(), name='ai-hub-avatars'),

    # Hub Global agrupado por libro: catalogo completo con conteo de personajes
    # GET /api/v1/ai/hub/books/
    path('hub/books/', HubBookListView.as_view(), name='ai-hub-books'),

    # Elenco de personajes de un libro concreto
    # GET /api/v1/ai/hub/books/<slug>/avatars/
    path('hub/books/<slug:slug>/avatars/', HubBookAvatarsView.as_view(), name='ai-hub-book-avatars'),

    # Personajes recientes con los que se ha chateado
    # GET /api/v1/ai/hub/recent/
    path('hub/recent/', RecentChatsView.as_view(), name='ai-hub-recent'),

    # Lista de personajes con estado de desbloqueo

    # GET /api/v1/ai/avatars/?inventory_id=<uuid>
    path('avatars/', AvatarListView.as_view(), name='ai-avatars'),

    # GET /api/v1/ai/avatars/<id>/
    path('avatars/<int:pk>/', AvatarDetailView.as_view(), name='ai-avatar-detail'),

    # Obtener o crear sesión de chat con un personaje
    # GET /api/v1/ai/sessions/?avatar_id=<int>
    path('sessions/', ChatSessionView.as_view(), name='ai-sessions'),

    # Historial de mensajes de una sesión
    # GET /api/v1/ai/sessions/<session_uuid>/messages/
    path('sessions/<str:session_id>/messages/', ChatHistoryView.as_view(), name='ai-session-messages'),

    # Enviar mensaje al LLM (consume tinta)
    # POST /api/v1/ai/chat/
    path('chat/', ChatInteractionView.as_view(), name='ai-chat'),

    # Chat de demostración público (sin auth, rate limiting por IP)
    # POST /api/v1/ai/demo-chat/
    path('demo-chat/', DemoChatView.as_view(), name='ai-demo-chat'),

    # Narración AI (TTS ElevenLabs)
    # POST /api/v1/ai/audio/generate/
    path('audio/generate/', TTSGenerateView.as_view(), name='ai-audio-generate'),
]
