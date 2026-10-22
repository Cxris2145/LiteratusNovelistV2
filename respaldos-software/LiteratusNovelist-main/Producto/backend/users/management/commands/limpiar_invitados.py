from django.core.management.base import BaseCommand

from users.guests import sweep


class Command(BaseCommand):
    help = 'Borra las cuentas de prueba que cerraron la página (3 min sin latido) o cumplieron una hora.'

    def handle(self, *args, **options):
        deleted = sweep()
        self.stdout.write(f'Cuentas de prueba borradas: {deleted}')
