"""Cuenta ficticia para auditar recuperación, exclusivamente en la SQLite local."""
import os
import sys
from pathlib import Path

backend = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(backend))
os.environ['DJANGO_SETTINGS_MODULE'] = 'config.test_settings'
os.environ['LITERATUS_TEST_DB'] = str(backend / '.tmp-achievements-preview' / 'preview.sqlite3')
os.environ.pop('LITERATUS_TEST_DATABASE_URL', None)

import django
django.setup()
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management import call_command
from users.models import PasswordResetChallenge

assert settings.DATABASES['default']['ENGINE'] == 'django.db.backends.sqlite3'
call_command('migrate', verbosity=0)
user, _ = get_user_model().objects.get_or_create(
    username='RecuperacionDemo', defaults={'email': 'recuperacion@preview.example'})
user.set_password('LecturaAnterior2026!')
user.save(update_fields=['password'])
user.profile.has_completed_onboarding = True
user.profile.save(update_fields=['has_completed_onboarding'])
PasswordResetChallenge.objects.filter(user=user).delete()
print('Cuenta ficticia de recuperación lista en SQLite local.')
