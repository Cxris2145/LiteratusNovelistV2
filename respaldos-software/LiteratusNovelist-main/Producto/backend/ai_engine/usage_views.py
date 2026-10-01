from django.shortcuts import get_object_or_404
from django.db import transaction
from users.models import Profile
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import APIException
from .metered_service import MeteredAIService
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
def ink_quote(request):
    data = QuoteInput(data=request.data)
    data.is_valid(raise_exception=True)
    session = get_object_or_404(ChatSession, pk=data.validated_data['session_id'], user=request.user)
    quote = usage.quote(request.user, session, data.validated_data['message'])
    return Response({'quote_id': str(quote.pk), 'ink_cost': quote.ink_cost, 'expires_at': quote.expires_at})


class ChatInput(QuoteInput):
    request_id = serializers.UUIDField()
    payment_mode = serializers.ChoiceField(choices=['plan', 'ink'], default='plan')
    quote_id = serializers.UUIDField(required=False, allow_null=True)


class MeteredChatView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        data = ChatInput(data=request.data)
        data.is_valid(raise_exception=True)
        fields = data.validated_data
        session = get_object_or_404(ChatSession.objects.select_related('avatar'),
            pk=fields['session_id'], user=request.user)
        usage.check_avatar(request.user, session.avatar)
        service = MeteredAIService(session.avatar, session)
        event = None
        try:
            with transaction.atomic():
                Profile.objects.select_for_update().get(user=request.user)
                ceiling = service.prepare(fields['message'])
                event, replay = usage.reserve(request.user, session, fields['message'], fields['request_id'],
                    fields['payment_mode'], fields.get('quote_id'), ceiling)
            result = event.result if replay else usage.finish(event, fields['message'], service.generate_metered())
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
