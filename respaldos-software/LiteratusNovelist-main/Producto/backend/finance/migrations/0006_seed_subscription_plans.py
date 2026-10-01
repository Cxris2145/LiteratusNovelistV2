from django.db import migrations


def seed(apps, schema_editor):
    Plan = apps.get_model('finance', 'SubscriptionPlan')
    common = ['Personajes y autores según tu progreso de lectura', 'Asistente general gratuito para todos']
    Plan.objects.get_or_create(code='aprendiz', defaults={
        'name': 'Aprendiz', 'price': '7.99', 'currency': 'USD',
        'daily_token_limit': 100000, 'daily_time_limit': 18000,
        'monthly_ink_bonus': 0, 'benefits': common + ['Personalización actual de Literatus']})
    Plan.objects.get_or_create(code='maestro', defaults={
        'name': 'Maestro', 'price': '14.99', 'currency': 'USD',
        'daily_token_limit': 300000, 'daily_time_limit': None,
        'monthly_ink_bonus': 500, 'benefits': common + ['Insignia y marco Maestro durante tu período pagado']})


class Migration(migrations.Migration):
    dependencies = [('finance', '0005_paypalwebhook_subscriptionplan_transaction_currency_and_more')]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
