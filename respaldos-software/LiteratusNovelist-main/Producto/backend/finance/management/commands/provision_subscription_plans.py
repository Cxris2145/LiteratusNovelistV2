import uuid
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from finance import paypal
from finance.models import SubscriptionPlan


class Command(BaseCommand):
    help = 'Crea los dos planes mensuales bajo un único producto PayPal. Ejecutar primero en sandbox.'

    def add_arguments(self, parser):
        parser.add_argument('--product-id', default=settings.PAYPAL_PRODUCT_ID)

    def handle(self, *args, **options):
        try:
            plans = list(SubscriptionPlan.objects.filter(code__in=['aprendiz', 'maestro']))
            if len(plans) != 2:
                raise CommandError('Aplica las migraciones para cargar Aprendiz y Maestro.')
            product_id = options['product_id']
            existing = [p for p in plans if p.provider_plan_id]
            if existing:
                remote = paypal.api('GET', '/v1/billing/plans/' + existing[0].provider_plan_id)
                product_id = product_id or remote['product_id']
            if not product_id:
                product = paypal.api('POST', '/v1/catalogs/products', {
                    'name': 'Literatus · Conversaciones IA', 'type': 'SERVICE',
                    'description': 'Planes mensuales de conversación escrita con personajes y autores'},
                    uuid.uuid5(uuid.NAMESPACE_URL, 'literatus/product/' + settings.PAYPAL_ENVIRONMENT))
                product_id = product['id']
            self.stdout.write('PAYPAL_PRODUCT_ID=' + product_id)
            for plan in plans:
                if not plan.provider_plan_id:
                    remote = paypal.api('POST', '/v1/billing/plans', {
                        'product_id': product_id, 'name': 'Literatus ' + plan.name, 'status': 'ACTIVE',
                        'billing_cycles': [{'frequency': {'interval_unit': 'MONTH', 'interval_count': 1},
                            'tenure_type': 'REGULAR', 'sequence': 1, 'total_cycles': 0,
                            'pricing_scheme': {'fixed_price': {'value': str(plan.price), 'currency_code': plan.currency}}}],
                        'payment_preferences': {'auto_bill_outstanding': False,
                            'setup_fee_failure_action': 'CANCEL', 'payment_failure_threshold': 1}},
                        uuid.uuid5(uuid.NAMESPACE_URL, product_id + '/' + plan.code))
                    plan.provider_plan_id = remote['id']
                    plan.save(update_fields=['provider_plan_id'])
                remote = paypal.api('GET', '/v1/billing/plans/' + plan.provider_plan_id)
                cycles = remote.get('billing_cycles', [])
                if remote.get('status') != 'ACTIVE' or remote.get('product_id') != product_id or len(cycles) != 1 or cycles[0].get('frequency') != {'interval_unit': 'MONTH', 'interval_count': 1}:
                    raise CommandError('El plan remoto no pertenece al producto mensual esperado: ' + plan.code)
                price = cycles[0]['pricing_scheme']['fixed_price']
                if price != {'value': str(plan.price), 'currency_code': plan.currency}:
                    raise CommandError('El precio remoto no coincide con el catálogo: ' + plan.code)
                self.stdout.write(plan.code + ': ' + plan.provider_plan_id)
        except paypal.PayPalError as exc:
            raise CommandError(str(exc)) from exc
