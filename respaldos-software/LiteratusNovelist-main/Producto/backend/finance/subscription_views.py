import uuid
from django.conf import settings
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from . import paypal
from .models import SubscriptionPlan, UserSubscription, Transaction, PayPalSubscriptionBinding
from .subscriptions import account_data, plan_data, has_paid_access, MAESTRO_FRAME, reconcile_subscription, process_webhook
from users.models import Profile


@api_view(['GET'])
@permission_classes([AllowAny])
def plans(request):
    return Response([plan_data(p) for p in SubscriptionPlan.objects.filter(active=True)])


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def subscription(request):
    return Response(account_data(request.user))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def subscribe(request):
    plan = get_object_or_404(SubscriptionPlan, pk=request.data.get('plan_code'), active=True)
    if not paypal.configured() or not plan.provider_plan_id:
        return Response({'message': 'Las suscripciones PayPal aún no están configuradas.'}, status=503)
    with transaction.atomic():
        Profile.objects.select_for_update().get(user=request.user)
        sub = UserSubscription.objects.select_for_update(of=('self',)).filter(user=request.user).first()
        if sub and (has_paid_access(sub) or sub.status not in ('CANCELLED', 'EXPIRED', 'APPROVAL_PENDING', 'CREATING')):
            return Response({'message': 'Administra tu suscripción actual antes de contratar otra.'}, status=409)
        sub, _ = UserSubscription.objects.get_or_create(user=request.user, defaults={'plan': plan})
        if sub.provider_subscription_id and sub.status == 'APPROVAL_PENDING':
            if sub.plan_id != plan.code:
                return Response({'message': 'Ya tienes una aprobación pendiente para ' + sub.plan.name + '. Retoma ese plan para completar la contratación.'}, status=409)
            existing_id = sub.provider_subscription_id
        else:
            existing_id = None
            retry_creation = sub.status in ('CREATING', 'APPROVAL_PENDING') and not sub.provider_subscription_id
            if retry_creation and sub.plan_id != plan.code:
                return Response({'message': 'Retoma la contratación pendiente de ' + sub.plan.name + '.'}, status=409)
            if not retry_creation:
                sub.plan = plan
                sub.cancel_at_period_end = False
                sub.pending_plan = None
                sub.provider_subscription_id = None
                sub.creation_request_id = uuid.uuid4()
            sub.status = 'CREATING'
            sub.save()
    try:
        if existing_id:
            data = paypal.api('GET', '/v1/billing/subscriptions/' + existing_id)
        else:
            data = paypal.api('POST', '/v1/billing/subscriptions', {
                'plan_id': plan.provider_plan_id, 'custom_id': str(request.user.pk),
                'application_context': {'brand_name': 'Literatus Novelist', 'user_action': 'SUBSCRIBE_NOW',
                    'return_url': settings.FRONTEND_URL.rstrip('/') + '/planes?paypal=return',
                    'cancel_url': settings.FRONTEND_URL.rstrip('/') + '/planes?paypal=cancel'}}, sub.creation_request_id)
            with transaction.atomic():
                Profile.objects.select_for_update().get(user=request.user)
                PayPalSubscriptionBinding.objects.get_or_create(provider_subscription_id=data['id'], defaults={'subscription': sub, 'plan': plan})
                UserSubscription.objects.filter(pk=sub.pk).update(provider_subscription_id=data['id'], status=data['status'])
        return Response({'approval_url': paypal.approval_url(data), **account_data(request.user)})
    except paypal.PayPalError as exc:
        UserSubscription.objects.filter(pk=sub.pk, status='CREATING').update(status='APPROVAL_PENDING')
        return Response({'message': str(exc)}, status=502)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def manage(request, action):
    sub = get_object_or_404(UserSubscription.objects.select_related('plan', 'pending_plan'), user=request.user)
    if not sub.provider_subscription_id:
        return Response({'message': 'Aún no hay una suscripción PayPal que administrar.'}, status=409)
    try:
        if action == 'refresh':
            from .subscriptions import reconcile_payments
            reconcile_payments(sub)
        elif action == 'cancel':
            if not sub.cancel_at_period_end:
                paypal.api('POST', '/v1/billing/subscriptions/' + sub.provider_subscription_id + '/cancel',
                    {'reason': 'Cancelación solicitada por el usuario'}, uuid.uuid4())
                UserSubscription.objects.filter(pk=sub.pk).update(status='CANCELLED', cancel_at_period_end=True)
        elif action == 'change':
            plan = get_object_or_404(SubscriptionPlan, pk=request.data.get('plan_code'), active=True)
            if not has_paid_access(sub) or sub.cancel_at_period_end or not plan.provider_plan_id or plan.code == sub.plan_id:
                return Response({'message': 'Este cambio de plan no está disponible.'}, status=409)
            # Persist target before the external call so an early webhook can reconcile it.
            UserSubscription.objects.filter(pk=sub.pk).update(pending_plan=plan)
            data = paypal.api('POST', '/v1/billing/subscriptions/' + sub.provider_subscription_id + '/revise',
                {'plan_id': plan.provider_plan_id, 'application_context': {
                    'return_url': settings.FRONTEND_URL.rstrip('/') + '/planes?paypal=return',
                    'cancel_url': settings.FRONTEND_URL.rstrip('/') + '/planes?paypal=cancel'}}, uuid.uuid4())
            return Response({'approval_url': paypal.approval_url(data), **account_data(request.user)})
        else:
            return Response(status=404)
        return Response(account_data(request.user))
    except paypal.PayPalError as exc:
        return Response({'message': str(exc)}, status=502)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def equip_frame(request):
    from .subscriptions import cosmetics
    if not cosmetics(request.user)['maestro']:
        return Response({'message': 'El marco requiere un período Maestro vigente.'}, status=403)
    with transaction.atomic():
        profile = Profile.objects.select_for_update().get(user=request.user)
        sub = UserSubscription.objects.select_for_update(of=('self',)).get(user=request.user)
        if not has_paid_access(sub) or sub.plan_id != 'maestro':
            return Response({'message': 'El período Maestro ha terminado.'}, status=403)
        if profile.equipped_frame != MAESTRO_FRAME:
            sub.previous_frame = profile.equipped_frame
            sub.save(update_fields=['previous_frame'])
            profile.equipped_frame = MAESTRO_FRAME
            profile.save(update_fields=['equipped_frame'])
    return Response({'equipped_frame': MAESTRO_FRAME})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def payment_history(request):
    return Response(list(Transaction.objects.filter(user=request.user).order_by('-created_at').values(
        'buy_order', 'created_at', 'amount', 'currency', 'provider', 'status', 'item_type', 'item_reference')[:50]))


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def webhook(request):
    event = request.data
    if not isinstance(event, dict) or not all(event.get(k) for k in ('id', 'event_type')):
        return Response(status=400)
    try:
        if not paypal.verify_webhook(request.headers, event):
            return Response(status=403)
        process_webhook(event)
    except (paypal.PayPalError, ValueError, KeyError):
        return Response({'message': 'No se pudo validar o conciliar el pago.'}, status=502)
    return Response({'received': True})
