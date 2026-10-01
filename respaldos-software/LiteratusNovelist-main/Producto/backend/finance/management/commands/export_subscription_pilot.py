import json
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.db.models import Sum, Count
from django.utils import timezone
from datetime import timedelta
from ai_engine.models import AIUsageEvent, DailyAIUsage
from finance.models import Transaction, UserSubscription, PayPalSubscriptionBinding
from library.models import InkTransaction


class Command(BaseCommand):
    help = 'Exporta métricas agregadas del piloto; no cambia precios ni límites.'

    def add_arguments(self, parser):
        parser.add_argument('--days', type=int, default=30)

    def handle(self, *args, **options):
        since = timezone.now() - timedelta(days=max(1, options['days']))
        events = AIUsageEvent.objects.filter(created_at__gte=since)
        payments = Transaction.objects.filter(provider='paypal', created_at__gte=since, status='exitosa')
        active_users = events.filter(status='succeeded').values('user_id').distinct().count()
        checkout_users = set(PayPalSubscriptionBinding.objects.filter(created_at__gte=since).values_list('subscription__user_id', flat=True))
        converted_users = checkout_users.intersection(payments.values_list('user_id', flat=True))
        output = {
            'since': since.isoformat(), 'currency': 'USD', 'active_users': active_users,
            'outcomes': list(events.values('status', 'mode').annotate(requests=Count('request_id'))),
            'per_user': list(events.values('user_id').annotate(tokens=Sum('total_tokens'), estimated_cost=Sum('estimated_cost'), requests=Count('request_id'))),
            'per_character': list(events.values('session__avatar_id', 'session__avatar__name').annotate(tokens=Sum('total_tokens'), estimated_cost=Sum('estimated_cost'), requests=Count('request_id'))),
            'by_plan': list(events.values('subscription_plan_id').annotate(tokens=Sum('total_tokens'), estimated_cost=Sum('estimated_cost'))),
            'quota_exhausted_days': DailyAIUsage.objects.filter(date__gte=since.date(), quota_exhausted_at__isnull=False).count(),
            'active_seconds': DailyAIUsage.objects.filter(date__gte=since.date()).aggregate(value=Sum('active_seconds'))['value'] or 0,
            'payments': payments.count(), 'revenue_usd': payments.aggregate(value=Sum('amount'))['value'] or Decimal(0),
            'paying_accounts': payments.values('user_id').distinct().count(),
            'checkout_accounts': len(checkout_users), 'checkout_converted_accounts': len(converted_users),
            'checkout_conversion_percent': round(len(converted_users) / len(checkout_users) * 100, 2) if checkout_users else None,
            'cancellations': UserSubscription.objects.filter(cancel_at_period_end=True, updated_at__gte=since).count(),
            'ink_movements': list(InkTransaction.objects.filter(created_at__gte=since).values('concept').annotate(total=Sum('amount'), movements=Count('id'))),
            'note': 'Costos estimados conservadores. Validar contra facturas. Conversión = cuentas que iniciaron contratación y pagaron en el período. Cada evento conserva el plan al reservar.'}
        self.stdout.write(json.dumps(output, default=str, ensure_ascii=False, indent=2))
