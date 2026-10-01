"""Paid periods, provider reconciliation and temporary cosmetics."""
from datetime import datetime, timedelta, timezone as dt_timezone
from decimal import Decimal, InvalidOperation
from hashlib import sha256
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from . import paypal
from .models import SubscriptionPlan, UserSubscription, Transaction, PayPalWebhook, PayPalSubscriptionBinding
from users.models import Profile
from library.models import InkTransaction

MAESTRO_FRAME = 'frame-maestro'


def timestamp(value):
    if not value:
        return None
    return datetime.fromisoformat(value.replace('Z', '+00:00')).astimezone(dt_timezone.utc)


def has_paid_access(sub, now=None):
    return bool(sub and sub.paid_until and sub.paid_until > (now or timezone.now()))


def subscription_for(user):
    return UserSubscription.objects.select_related('plan', 'pending_plan').filter(user=user).first()


def restore_frame(profile, sub):
    if profile.equipped_frame != MAESTRO_FRAME:
        return
    from learning.models import UserInventoryItem
    previous = sub.previous_frame if sub else ''
    if previous and not UserInventoryItem.objects.filter(user=profile.user, item__value=previous, quantity__gt=0).exists():
        previous = ''
    profile.equipped_frame = previous
    profile.save(update_fields=['equipped_frame'])


def cosmetics(user):
    sub = subscription_for(user)
    active = has_paid_access(sub) and sub.plan_id == 'maestro'
    if not active:
        with transaction.atomic():
            profile = Profile.objects.select_for_update().get(user=user)
            restore_frame(profile, sub)
    return {'maestro': active, 'frame': MAESTRO_FRAME if active else None}


def plan_data(plan):
    return {'code': plan.code, 'name': plan.name, 'price': str(plan.price), 'currency': plan.currency,
        'daily_token_limit': plan.daily_token_limit, 'daily_time_limit': plan.daily_time_limit,
        'monthly_ink_bonus': plan.monthly_ink_bonus, 'benefits': plan.benefits,
        'purchasable': bool(paypal.configured() and plan.provider_plan_id)}


def account_data(user):
    sub = subscription_for(user)
    return {'subscription': None if not sub else {
        'plan': plan_data(sub.plan), 'status': sub.status, 'active': has_paid_access(sub),
        'paid_until': sub.paid_until, 'renews_at': sub.renews_at,
        'cancel_at_period_end': sub.cancel_at_period_end,
        'pending_plan': sub.pending_plan_id,
    }, 'cosmetics': cosmetics(user), 'ink_balance': Profile.objects.get(user=user).ink_balance}


def reconcile_subscription(sub, remote):
    """The provider's lifecycle status never grants an unpaid period."""
    if remote.get('id') != sub.provider_subscription_id or remote.get('custom_id') != str(sub.user_id):
        raise paypal.PayPalError('La suscripción no corresponde a esta cuenta.')
    valid_plans = {sub.plan.provider_plan_id}
    if sub.pending_plan_id:
        valid_plans.add(sub.pending_plan.provider_plan_id)
    if remote.get('plan_id') not in valid_plans:
        raise paypal.PayPalError('El plan PayPal no coincide con la suscripción.')
    sub.status = remote.get('status', sub.status)
    sub.renews_at = timestamp(remote.get('billing_info', {}).get('next_billing_time'))
    if sub.status in ('CANCELLED', 'EXPIRED'):
        sub.cancel_at_period_end = True
    sub.save()


def process_webhook(event):
    """Network calls outside locks; a verified event and sale are fulfilled exactly once."""
    event_id, kind, resource = event['id'], event['event_type'], event.get('resource', {})
    if PayPalWebhook.objects.filter(pk=event_id).exists():
        return
    payment = kind == 'PAYMENT.SALE.COMPLETED'
    reversed_payment = kind in ('PAYMENT.SALE.REVERSED', 'PAYMENT.SALE.REFUNDED')
    provider_id = resource.get('billing_agreement_id') if payment else resource.get('id')
    if reversed_payment:
        sale_id = resource.get('sale_id') or resource.get('id')
        txn = Transaction.objects.filter(external_payment_id='paypal:' + sale_id).first()
        if not txn:
            return
        provider_id = txn.metadata.get('subscription_id')
    sub = UserSubscription.objects.select_related('plan', 'pending_plan').filter(provider_subscription_id=provider_id).first()
    binding = PayPalSubscriptionBinding.objects.select_related('subscription__plan', 'plan').filter(pk=provider_id).first()
    if not sub and binding:
        sub = binding.subscription
    if not sub:
        if kind.startswith('BILLING.SUBSCRIPTION.') or payment:
            raise paypal.PayPalError('La asociación de la suscripción aún no está disponible. Reintenta la notificación.')
        return
    remote = paypal.api('GET', '/v1/billing/subscriptions/' + provider_id)
    sale = None
    if payment:
        paid_at = timestamp(resource.get('create_time'))
        if not paid_at:
            raise paypal.PayPalError('Falta la fecha del pago.')
        from urllib.parse import urlencode
        window = urlencode({'start_time': (paid_at - timedelta(days=1)).isoformat(),
            'end_time': min(timezone.now() + timedelta(minutes=1), paid_at + timedelta(days=1)).isoformat()})
        data = paypal.api('GET', '/v1/billing/subscriptions/' + provider_id + '/transactions?' + window)
        confirmed = next((t for t in data.get('transactions', []) if t.get('id') == resource['id']), None)
        if not confirmed or confirmed.get('status') != 'COMPLETED':
            raise paypal.PayPalError('El pago no está confirmado para esta suscripción.')
        # Signature verification uses this business's webhook ID; transaction lookup
        # uses its OAuth credentials and the owned subscription, binding the receiver.
        # Reject an explicit receiver mismatch whenever PayPal includes that field.
        payee = resource.get('payee', {})
        if payee.get('merchant_id', settings.PAYPAL_MERCHANT_ID) != settings.PAYPAL_MERCHANT_ID:
            raise paypal.PayPalError('El receptor del pago no coincide con Literatus.')
        gross = confirmed['amount_with_breakdown']['gross_amount']
        sale = {'id': confirmed['id'], 'amount': {'total': gross['value'], 'currency': gross['currency_code']},
            'create_time': confirmed['time']}
    with transaction.atomic():
        profile = Profile.objects.select_for_update().get(user=sub.user)
        sub = UserSubscription.objects.select_for_update(of=('self',)).select_related('plan', 'pending_plan').get(pk=sub.pk)
        _, created = PayPalWebhook.objects.get_or_create(event_id=event_id, defaults={'event_type': kind})
        if not created:
            return
        current = sub.provider_subscription_id == provider_id
        if current:
            reconcile_subscription(sub, remote)
        elif remote.get('id') != provider_id or remote.get('custom_id') != str(sub.user_id) or not SubscriptionPlan.objects.filter(provider_plan_id=remote.get('plan_id')).exclude(provider_plan_id='').exists():
            raise paypal.PayPalError('La suscripción histórica no corresponde a esta cuenta.')
        if payment:
            try:
                # A delayed payment can belong to the previous plan after a revision.
                plan = SubscriptionPlan.objects.get(price=Decimal(sale['amount']['total']), currency=sale['amount']['currency'])
            except (KeyError, InvalidOperation):
                raise paypal.PayPalError('El importe o la moneda del pago no coincide con el plan.')
            except (SubscriptionPlan.DoesNotExist, SubscriptionPlan.MultipleObjectsReturned):
                raise paypal.PayPalError('El importe o la moneda del pago no coincide con el plan.')
            txn, delivered = Transaction.objects.get_or_create(external_payment_id='paypal:' + sale['id'], defaults={
                'user': sub.user, 'buy_order': 'PP-' + sha256(sale['id'].encode()).hexdigest()[:32], 'amount': plan.price,
                'currency': plan.currency, 'provider': 'paypal', 'status': 'exitosa',
                'item_type': 'plan', 'item_reference': plan.code,
                'metadata': {'subscription_id': provider_id, 'paid_at': sale['create_time']}})
            if not delivered:
                return
            last_payment = remote.get('billing_info', {}).get('last_payment', {})
            # Old notifications grant their historical period, never the latest unpaid period.
            paid_at = timestamp(sale.get('create_time'))
            if not paid_at:
                raise paypal.PayPalError('Falta la fecha del pago.')
            from calendar import monthrange
            year, month = paid_at.year + (paid_at.month == 12), paid_at.month % 12 + 1
            period_end = paid_at.replace(year=year, month=month, day=min(paid_at.day, monthrange(year, month)[1]))
            if timestamp(last_payment.get('time')) == paid_at and sub.renews_at and paid_at < sub.renews_at <= paid_at + timedelta(days=32):
                period_end = sub.renews_at
            txn.metadata['period_end'] = period_end.isoformat()
            txn.save(update_fields=['metadata'])
            if current and (not sub.paid_until or period_end > sub.paid_until):
                sub.plan = plan
                sub.paid_until = period_end
                sub.started_at = sub.started_at or paid_at
                if sub.pending_plan_id == plan.code:
                    sub.pending_plan = None
                sub.save()
                PayPalSubscriptionBinding.objects.filter(pk=provider_id).update(plan=plan)
                if plan.code != 'maestro':
                    restore_frame(profile, sub)
            if plan.monthly_ink_bonus:
                profile.ink_balance += plan.monthly_ink_bonus
                profile.save(update_fields=['ink_balance'])
                InkTransaction.objects.create(user=sub.user, amount=plan.monthly_ink_bonus,
                    concept='subscription_bonus', reference_id=sale['id'], balance_after=profile.ink_balance)
        elif reversed_payment:
            txn.status = 'reversada'
            txn.save(update_fields=['status'])
            if current and timestamp(txn.metadata.get('period_end')) == sub.paid_until:
                sub.paid_until = timezone.now()
                sub.save(update_fields=['paid_until'])


def reconcile_payments(sub, days=31):
    """Recover missed notifications using transactions from the merchant's OAuth API."""
    from urllib.parse import urlencode
    remote = paypal.api('GET', '/v1/billing/subscriptions/' + sub.provider_subscription_id)
    with transaction.atomic():
        Profile.objects.select_for_update().get(user=sub.user)
        locked = UserSubscription.objects.select_for_update(of=('self',)).select_related('plan', 'pending_plan').get(pk=sub.pk)
        reconcile_subscription(locked, remote)
    end = timezone.now()
    start = end - timedelta(days=days)
    while start < end:
        window_end = min(end, start + timedelta(days=31))
        query = urlencode({'start_time': start.isoformat(), 'end_time': window_end.isoformat()})
        records = paypal.api('GET', '/v1/billing/subscriptions/' + sub.provider_subscription_id + '/transactions?' + query)
        for record in records.get('transactions', []):
            if record.get('status') != 'COMPLETED' or Transaction.objects.filter(external_payment_id='paypal:' + record['id']).exists():
                continue
            process_webhook({'id': 'reconcile:' + record['id'], 'event_type': 'PAYMENT.SALE.COMPLETED',
                'resource': {'id': record['id'], 'billing_agreement_id': sub.provider_subscription_id, 'create_time': record['time']}})
        start = window_end
