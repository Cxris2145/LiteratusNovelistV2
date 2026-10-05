import secrets

from django.db import migrations
from django.db.models import Q

# Copia congelada del alfabeto de users.models: una migración no importa código vivo de la app.
ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
LENGTH = 6


def backfill(apps, schema_editor):
    """Asigna código a los perfiles que no tienen. Idempotente: no toca los ya asignados."""
    Profile = apps.get_model('users', 'Profile')
    # El manager del modelo histórico no filtra borrados lógicos: se reservan todos los códigos.
    taken = set(Profile.objects.exclude(friend_code__isnull=True).exclude(friend_code='')
                .values_list('friend_code', flat=True))
    pending = Profile.objects.filter(Q(friend_code__isnull=True) | Q(friend_code='')).values_list('pk', flat=True)
    for pk in list(pending):
        code = ''.join(secrets.choice(ALPHABET) for _ in range(LENGTH))
        while code in taken:
            code = ''.join(secrets.choice(ALPHABET) for _ in range(LENGTH))
        taken.add(code)
        Profile.objects.filter(pk=pk).update(friend_code=code)


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0009_profile_community_fields'),
    ]

    operations = [
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
