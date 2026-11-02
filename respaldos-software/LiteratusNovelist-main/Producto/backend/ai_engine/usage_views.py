from django.shortcuts import get_object_or_404
from django.db import transaction
from users.models import Profile
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import APIException, ValidationError
from .metered_service import MeteredAIService
from .encounter_service import EncounterAIService
from .models import ChatSession
from . import usage


class QuoteInput(serializers.Serializer):
    session_id = serializers.UUIDField()
    message = serializers.CharField(max_length=2000)


class HeartbeatInput(serializers.Serializer):
    session_id = serializers.UUIDField()
    client_id = serializers.UUIDField()
    active = serializers.BooleanField()


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def daily_usage(request):
    return Response(usage.snapshot(request.user))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def activity(request):
    data = HeartbeatInput(data=request.data)
    data.is_valid(raise_exception=True)
    session = get_object_or_404(ChatSession, pk=data.validated_data['session_id'], user=request.user)
    return Response(usage.heartbeat(request.user, session, data.validated_data['client_id'], data.validated_data['active']))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def day_pass(request):
    """POST /api/v1/ai/chat/day-pass/ — Pase del día con Tinta (todos los personajes hasta medianoche)."""
    try:
        return Response(usage.buy_day_pass(request.user))
    except usage.UsageDenied as exc:
        return Response({**exc.detail, 'usage': usage.snapshot(request.user)}, status=exc.status_code)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def ink_quote(request):
    data = QuoteInput(data=request.data)
    data.is_valid(raise_exception=True)
    session = get_object_or_404(ChatSession, pk=data.validated_data['session_id'], user=request.user)
    quote = usage.quote(request.user, session, data.validated_data['message'])
    return Response({'quote_id': str(quote.pk), 'ink_cost': quote.ink_cost, 'expires_at': quote.expires_at})


class ChatInput(QuoteInput):
    # En un encuentro el mensaje puede venir vacío: los personajes siguen conversando solos.
    message = serializers.CharField(max_length=2000, allow_blank=True)
    request_id = serializers.UUIDField()
    payment_mode = serializers.ChoiceField(choices=['plan', 'ink', 'pass'], default='plan')
    quote_id = serializers.UUIDField(required=False, allow_null=True)
    speaker_id = serializers.UUIDField(required=False, allow_null=True)


def encounter_speakers(session, fields):
    """Quién habla en este turno del encuentro y con quién conversa."""
    if fields['payment_mode'] == 'ink':
        raise ValidationError({'error': 'ENCOUNTER_NO_INK', 'message': 'En un encuentro se conversa con el plan o con el pase del día.'})
    speaker_id = fields.get('speaker_id')
    if session.partner is not None and speaker_id == session.avatar_id:
        return session.avatar, session.partner
    if session.partner is not None and speaker_id == session.partner_id:
        return session.partner, session.avatar
    raise ValidationError({'error': 'INVALID_SPEAKER', 'message': 'Ese personaje no está en este encuentro.'})


class MeteredChatView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        data = ChatInput(data=request.data)
        data.is_valid(raise_exception=True)
        fields = data.validated_data
        session = get_object_or_404(ChatSession.objects.select_related('avatar', 'partner'),
            pk=fields['session_id'], user=request.user)
        message, speaker = fields['message'], None
        if session.kind == ChatSession.Kind.ENCOUNTER:
            speaker, other = encounter_speakers(session, fields)
            usage.check_avatar(request.user, speaker)
            usage.check_avatar(request.user, other)
            service = EncounterAIService(speaker, other, session)
            # La huella incluye a quien habla: el mismo texto para uno y otro son pedidos distintos.
            fingerprint = f'{speaker.pk}\n{message}'
        else:
            if not message.strip() or fields.get('speaker_id'):
                raise ValidationError({'message': ['Escribe un mensaje para el personaje.']})
            usage.check_avatar(request.user, session.avatar)
            service = MeteredAIService(session.avatar, session)
            fingerprint = message
        event = None
        try:
            with transaction.atomic():
                Profile.objects.select_for_update().get(user=request.user)
                ceiling = service.prepare(message)
                event, replay = usage.reserve(request.user, session, fingerprint, fields['request_id'],
                    fields['payment_mode'], fields.get('quote_id'), ceiling)
            result = event.result if replay else usage.finish(event, message, service.generate_metered(), speaker)
            current = usage.snapshot(request.user)
            return Response({**result, 'usage': current, 'ink_balance': current['ink_balance']})
        except Exception as exc:
            if event:
                usage.fail(event, service.attempts)
            if isinstance(exc, usage.UsageDenied) and str(exc.detail.get('error')) in ('AI_TOKEN_LIMIT', 'AI_TIME_LIMIT'):
                from django.utils import timezone
                from .models import DailyAIUsage
                DailyAIUsage.objects.filter(user=request.user, date=usage.day_bounds()[0], quota_exhausted_at__isnull=True).update(quota_exhausted_at=timezone.now())
            current = usage.snapshot(request.user)
            if isinstance(exc, APIException):
                return Response({**exc.detail, 'usage': current}, status=exc.status_code)
            return Response({'error': 'AI_UNAVAILABLE', 'message': 'El personaje no pudo responder. No se descontó cuota ni Tinta.',
                'usage': current}, status=503)
