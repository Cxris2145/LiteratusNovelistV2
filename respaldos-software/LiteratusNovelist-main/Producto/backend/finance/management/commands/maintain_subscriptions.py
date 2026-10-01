from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from ai_engine.usage import cleanup
from ai_engine.models import AIUsageEvent
from finance.models import UserSubscription
from finance.subscriptions import cosmetics
from users.models import Profile


class Command(BaseCommand):
    help = 'Libera reservas vencidas y restaura los marcos Maestro vencidos; ejecutar cada minuto.'

    def handle(self, *args, **options):
        now = timezone.now()
        users = set(AIUsageEvent.objects.filter(status='reserved', expires_at__lte=now).values_list('user_id', flat=True))
        users.update(UserSubscription.objects.filter(paid_until__lte=now).values_list('user_id', flat=True))
        for profile in Profile.objects.filter(user_id__in=users).select_related('user').iterator():
            with transaction.atomic():
                locked = Profile.objects.select_for_update().get(pk=profile.pk)
                cleanup(profile.user, locked, now)
                cosmetics(profile.user)
        self.stdout.write(f'{len(users)} cuentas revisadas.')
