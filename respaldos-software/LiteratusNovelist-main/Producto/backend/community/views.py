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
    GET  tavern/messages/ — Mensajes de la mesa.
    POST tavern/messages/ — Enviar mensaje a la mesa. Body: {content}
    """
    def get(self, request):
        return Response({'results': services.list_tavern_messages(request.user)})

    def post(self, request):
        content = request.data.get('content')
        return _result(services.send_tavern_message(request.user, content))


class TavernMessageDetailView(CommunityView):
    """DELETE tavern/messages/<uuid:pk>/ — Borrar mensaje propio."""
    def delete(self, request, pk):
        return _result(services.delete_tavern_message(request.user, pk))


class TavernReactionsView(CommunityView):
    """POST tavern/reactions/ — Reaccionar (🍺, ❤️, 👏, 📖, ✨). Body: {reaction, message_id?}"""
    def post(self, request):
        reaction = request.data.get('reaction')
        message_id = request.data.get('message_id')
        return _result(services.send_tavern_reaction(request.user, reaction, message_id))


class TavernActivityView(CommunityView):
    """GET tavern/activity/ — Mensajes y reacciones recientes para animación y burbujas."""
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
