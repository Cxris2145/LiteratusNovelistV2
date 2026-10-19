"""
community/views.py — API de La Taberna de Tinta (/api/v1/community/). Todo exige sesión.
"""
from django.contrib.auth import get_user_model
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from . import services

User = get_user_model()


def _result(result):
    """Convierte la respuesta de un servicio en Response con su código HTTP."""
    code = result.pop('status', 200 if result.get('success') else 400)
    return Response(result, status=code)


def _not_found():
    return Response({'success': False, 'error': 'NOT_FOUND', 'message': 'No encontramos a ese lector.'},
                    status=status.HTTP_404_NOT_FOUND)


class CommunityView(APIView):
    permission_classes = [permissions.IsAuthenticated]


class CommunityMeView(CommunityView):
    """GET me/ — Mi tarjeta de La Taberna con estadísticas y solicitudes pendientes."""

    def get(self, request):
        return Response(services.my_card(request.user))


class CommunitySearchView(CommunityView):
    """GET search/?q= — Lectores por código (#K7Q2XM) o por nombre de usuario."""
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'community_search'

    def get(self, request):
        return Response({'results': services.search(request.user, request.query_params.get('q', ''))})


class SuggestionsView(CommunityView):
    """GET suggestions/ — Lectores que quizá conozcas (perfiles públicos), para "Agregar amigo"."""
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'community_search'

    def get(self, request):
        return Response({'results': services.suggestions(request.user)})


class FriendListView(CommunityView):
    """GET friends/ — Mis amigos con su estado (en la taberna, leyendo, de paseo)."""

    def get(self, request):
        return Response({'results': services.friends_list(request.user)})


class UnfriendView(CommunityView):
    """DELETE friends/<code>/ — Quitar a un amigo de la mesa."""

    def delete(self, request, code):
        profile = services.profile_by_code(code)
        if profile is None:
            return _not_found()
        return _result(services.unfriend(request.user, profile.user))


class FriendRequestsView(CommunityView):
    """
    GET  requests/ — Solicitudes recibidas y enviadas.
    POST requests/ — Enviar solicitud. Body: {friend_code} o {username}.
    """
    throttle_scope = 'community_write'

    def get_throttles(self):
        return [ScopedRateThrottle()] if self.request.method == 'POST' else []

    def get(self, request):
        return Response(services.requests_overview(request.user))

    def post(self, request):
        code = request.data.get('friend_code')
        username = str(request.data.get('username') or '').strip()
        if code:
            profile = services.profile_by_code(code)
            target = profile.user if profile else None
        elif username:
            target = User.objects.filter(username__iexact=username, is_active=True).first()
        else:
            return Response({'success': False, 'error': 'MISSING_TARGET',
                             'message': 'Indica el código o el nombre de usuario.'}, status=status.HTTP_400_BAD_REQUEST)
        if target is None:
            return _not_found()
        return _result(services.send_request(request.user, target))


class FriendRequestAcceptView(CommunityView):
    def post(self, request, pk):
        return _result(services.accept_request(request.user, pk))


class FriendRequestDeclineView(CommunityView):
    def post(self, request, pk):
        return _result(services.decline_request(request.user, pk))


class FriendRequestCancelView(CommunityView):
    def delete(self, request, pk):
        return _result(services.cancel_request(request.user, pk))


class CommunityProfileView(CommunityView):
    """GET profiles/<code>/ — Perfil completo (tú o un amigo) o mínimo (cualquier otro)."""

    def get(self, request, code):
        card = services.profile_for_viewer(request.user, code)
        return Response(card) if card is not None else _not_found()


class BrindisView(CommunityView):
    """POST / DELETE profiles/<code>/brindis/ — Brindar por un amigo o retirar el brindis."""

    def _target(self, code):
        profile = services.profile_by_code(code)
        return profile.user if profile else None

    def post(self, request, code):
        target = self._target(code)
        return _result(services.give_brindis(request.user, target)) if target else _not_found()

    def delete(self, request, code):
        target = self._target(code)
        return _result(services.remove_brindis(request.user, target)) if target else _not_found()


class RankingView(CommunityView):
    """GET ranking/?scope=week|month|all&limit=5 — Ranking de mis amigos y yo."""

    def get(self, request):
        scope = request.query_params.get('scope', 'week')
        if scope not in services.RANKING_SCOPES:
            return Response({'success': False, 'error': 'INVALID_SCOPE',
                             'message': 'El periodo debe ser week, month o all.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            limit = max(1, min(int(request.query_params.get('limit', 5)), 50))
        except ValueError:
            limit = 5
        return Response(services.ranking(request.user, scope, limit))


class PresenceView(CommunityView):
    """POST presence/ — Latido mientras la página de La Taberna está abierta."""

    def post(self, request):
        services.touch_presence(request.user)
        return Response({'pending_incoming': services.pending_incoming_count(request.user)})


class TavernMessagesView(CommunityView):
    """
    GET  tavern/messages/?limit=30 — Mensajes de la mesa (hasta 50), del más nuevo al más viejo.
    POST tavern/messages/ — Enviar mensaje a la mesa. Body: {content}
    """
    def get(self, request):
        try:
            limit = int(request.query_params.get('limit', 30))
        except ValueError:
            limit = 30
        return Response({'results': services.list_tavern_messages(request.user, limit)})

    def post(self, request):
        content = request.data.get('content')
        return _result(services.send_tavern_message(request.user, content))


class TavernMessageDetailView(CommunityView):
    """DELETE tavern/messages/<uuid:pk>/ — Borrar mensaje propio."""
    def delete(self, request, pk):
        return _result(services.delete_tavern_message(request.user, pk))


class TavernReactionsView(CommunityView):
    """POST tavern/reactions/ — Reaccionar (🍺, ❤️, 👏, 📖, ✨). No se guarda. Body: {reaction}"""
    def post(self, request):
        return _result(services.send_tavern_reaction(request.user, request.data.get('reaction')))


class TavernActivityView(CommunityView):
    """GET tavern/activity/ — Mensajes, reacciones, invitaciones y charlas sin leer (sondeo de la mesa)."""
    def get(self, request):
        return Response(services.recent_tavern_activity(request.user))


class TavernInvitationsView(CommunityView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'community_write'

    def post(self, request):
        profile = services.profile_by_code(request.data.get('friend_code'))
        return _result(services.invite_to_tavern(request.user, profile.user)) if profile else _not_found()


class TavernInvitationResponseView(CommunityView):
    def post(self, request, pk):
        action = request.data.get('action')
        if action not in ('accept', 'decline'):
            return Response({'success': False, 'message': 'Elige aceptar o descartar la invitación.'}, status=400)
        return _result(services.respond_to_tavern_invitation(request.user, pk, action == 'accept'))


class ChatThreadsView(CommunityView):
    """GET chats/ — Tus amigos con su último mensaje y los no leídos."""

    def get(self, request):
        return Response(services.chat_threads(request.user))


class ChatMessagesView(CommunityView):
    """
    GET  chats/<code>/?after=<id> — Mensajes de la charla con un amigo (marca leídos los recibidos).
    POST chats/<code>/ — Enviar un mensaje. Body: {content}
    """

    def _friend(self, code):
        profile = services.profile_by_code(code)
        return profile.user if profile else None

    def get(self, request, code):
        friend = self._friend(code)
        if friend is None:
            return _not_found()
        return _result(services.chat_messages(request.user, friend, request.query_params.get('after')))

    def post(self, request, code):
        friend = self._friend(code)
        if friend is None:
            return _not_found()
        return _result(services.send_chat_message(request.user, friend, request.data.get('content')))


class ReadingClubsView(CommunityView):
    """
    GET  clubs/ — Mis círculos de lectura activos.
    POST clubs/ — Crear un nuevo círculo de lectura grupal.
    """
    def get(self, request):
        return Response(services.list_reading_clubs(request.user))

    def post(self, request):
        return _result(services.create_reading_club(request.user, request.data))


class ReadingClubBooksView(CommunityView):
    """GET clubs/books/ — Libros disponibles con capítulos para elegir al crear un círculo."""
    def get(self, request):
        return Response(services.available_books_for_club(request.user))


class ReadingClubDetailView(CommunityView):
    """
    GET    clubs/<uuid:pk>/ — Detalle del círculo con sus capítulos, bloqueos y miembros.
    PATCH  clubs/<uuid:pk>/ — Actualizar configuración del círculo (solo anfitrión).
    DELETE clubs/<uuid:pk>/ — Salir del círculo (o cerrarlo si eres el anfitrión).
    """
    def get(self, request, pk):
        return _result(services.reading_club_detail(request.user, pk))

    def patch(self, request, pk):
        return _result(services.update_reading_club_settings(request.user, pk, request.data))

    def delete(self, request, pk):
        return _result(services.leave_or_delete_club(request.user, pk))


class ReadingClubProgressView(CommunityView):
    """POST clubs/<uuid:pk>/progress/ — Actualizar el capítulo actual del usuario en el círculo."""
    def post(self, request, pk):
        return _result(services.update_my_club_progress(request.user, pk, request.data.get('chapter_order')))


class ReadingClubInviteView(CommunityView):
    """POST clubs/<uuid:pk>/invite/ — Sumar amigos al círculo de lectura."""
    def post(self, request, pk):
        return _result(services.invite_friends_to_club(request.user, pk, request.data.get('friend_codes') or []))


class ReadingClubChapterMessagesView(CommunityView):
    """
    GET  clubs/<uuid:pk>/chapters/<int:chapter_order>/messages/ — Mensajes del capítulo.
    POST clubs/<uuid:pk>/chapters/<int:chapter_order>/messages/ — Publicar en el capítulo.
    """
    def get(self, request, pk, chapter_order):
        return _result(services.list_chapter_messages(
            request.user, pk, int(chapter_order), request.query_params.get('after')
        ))

    def post(self, request, pk, chapter_order):
        return _result(services.send_chapter_message(
            request.user,
            pk,
            int(chapter_order),
            request.data.get('content'),
            bool(request.data.get('is_spoiler', False)),
        ))

