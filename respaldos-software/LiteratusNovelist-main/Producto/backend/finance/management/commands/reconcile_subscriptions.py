from django.core.management.base import BaseCommand
from finance import paypal
from finance.models import UserSubscription
from finance.subscriptions import reconcile_payments


class Command(BaseCommand):
    help = 'Reconcilia pagos y estados con PayPal; ejecutar periódicamente y después de una interrupción.'

    def add_arguments(self, parser):
        parser.add_argument('--days', type=int, default=31)

    def handle(self, *args, **options):
        days = max(1, min(365, options['days']))
        failures = 0
        for sub in UserSubscription.objects.exclude(provider_subscription_id=None).select_related('user', 'plan', 'pending_plan').iterator():
            try:
                reconcile_payments(sub, days)
            except paypal.PayPalError as exc:
                failures += 1
                self.stderr.write(f'{sub.pk}: {exc}')
        self.stdout.write(f'Conciliación finalizada; {failures} cuentas pendientes de reintento.')
