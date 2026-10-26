"""
parental/views.py — Panel del tutor (/api/v1/parental/).

Todas las vistas piden sesión. Las secciones del historial responden 404 si el hijo no está a
cargo de quien pregunta, para no revelar qué cuentas existen.
"""
import logging

from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.validators import UnicodeUsernameValidator
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from . import history, services
from .services import ParentalError

logger = logging.getLogger(__name__)


class ChildCreateSerializer(serializers.Serializer):
    username = serializers.CharField(min_length=3, max_length=150, validators=[UnicodeUsernameValidator()])
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    birth_date = serializers.DateField()
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True, default='')
    consent = serializers.BooleanField(default=False)

    def validate_username(self, value):
        from users.serializers import UserWriteSerializer

        return UserWriteSerializer().validate_username(value)

    def validate_password(self, value):
        try:
            validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages))
        return value

    def validate_birth_date(self, value):
        from users.serializers import check_birth_date

        return check_birth_date(value)


class ChildLinkSerializer(serializers.Serializer):
    identifier = serializers.CharField(max_length=254)
    password = serializers.CharField(trim_whitespace=False)
    consent = serializers.BooleanField(default=False)
    birth_date = serializers.DateField(required=False, allow_null=True, default=None)

    def validate_birth_date(self, value):
        from users.serializers import check_birth_date

        return check_birth_date(value) if value else value


def _error(exc: ParentalError):
    return Response(exc.as_response_data(), status=exc.status)


class StatusView(APIView):
    """GET status/ — si puede ser tutor, sus hijos o quién lo tiene a cargo."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(services.status_for(request.user))


class ChildCreateView(APIView):
    """POST children/ — crea la cuenta del hijo a cargo del tutor."""
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'parental_action'

    def post(self, request):
        serializer = ChildCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            child = services.create_child(request.user, **serializer.validated_data)
        except ParentalError as exc:
            return _error(exc)
        link = services.link_of(child)
        return Response(services.child_card(link, request.user), status=status.HTTP_201_CREATED)


class ChildLinkView(APIView):
    """POST children/link/ — deja a cargo una cuenta que el hijo ya tenía (pide su contraseña)."""
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'parental_link'

    def post(self, request):
        serializer = ChildLinkSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            child = services.link_existing(request.user, **serializer.validated_data)
        except ParentalError as exc:
            return _error(exc)
        link = services.link_of(child)
        return Response(services.child_card(link, request.user), status=status.HTTP_201_CREATED)


class ChildSectionView(APIView):
    """GET children/<id>/[reading|games|writing|chats|activity/] — historial del hijo."""
    permission_classes = [permissions.IsAuthenticated]
    section = 'overview'

    def get(self, request, child_id):
        child = services.get_child_or_404(request.user, child_id)
        if self.section == 'overview':
            data = history.overview(child)
        elif self.section == 'reading':
            data = history.reading(child, request)
        elif self.section == 'games':
            data = history.games(child)
        elif self.section == 'writing':
            data = history.writing(child)
        elif self.section == 'chats':
            data = history.chats(child)
        else:
            data = history.activity(child)
        return Response(data)


class ChildChatDetailView(APIView):
    """GET children/<id>/chats/<session_id>/ — una conversación completa con un personaje."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, child_id, session_id):
        child = services.get_child_or_404(request.user, child_id)
        return Response(history.chat_detail(child, session_id))


class ChildActionView(APIView):
    """POST children/<id>/[password|unlink|delete]/ — todo pide la contraseña del tutor."""
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'parental_action'
    action = 'password'

    def post(self, request, child_id):
        from users.account_deletion import SubscriptionCancelError

        child = services.get_child_or_404(request.user, child_id)
        parent_password = request.data.get('parent_password')
        try:
            if self.action == 'password':
                services.set_child_password(request.user, child, parent_password=parent_password,
                                            new_password=request.data.get('new_password'))
                return Response({'message': f'Listo: {child.username} ya puede entrar con su contraseña nueva.'})
            if self.action == 'unlink':
                services.unlink(request.user, child, parent_password=parent_password)
                return Response(status=status.HTTP_204_NO_CONTENT)
            services.delete_child(request.user, child, parent_password=parent_password)
            return Response(status=status.HTTP_204_NO_CONTENT)
        except ParentalError as exc:
            return _error(exc)
        except SubscriptionCancelError:
            logger.exception('No se pudo cancelar el plan PayPal al borrar la cuenta hija %s', child.pk)
            return Response({
                'error': 'No pudimos cancelar el plan de pago de esa cuenta en PayPal, así que sigue activa. '
                         'Inténtalo de nuevo en unos minutos.',
                'code': 'SUBSCRIPTION_CANCEL_FAILED',
            }, status=status.HTTP_502_BAD_GATEWAY)
