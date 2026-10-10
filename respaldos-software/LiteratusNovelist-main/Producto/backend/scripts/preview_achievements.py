"""Datos de prueba para Logros 2.0. Solo escribe en la SQLite aislada de test_settings."""
import json
import os
import sys
from pathlib import Path

backend = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(backend))
os.environ['DJANGO_SETTINGS_MODULE'] = 'config.test_settings'
os.environ['LITERATUS_TEST_DB'] = str(backend / '.tmp-achievements-preview' / 'preview.sqlite3')
Path(os.environ['LITERATUS_TEST_DB']).parent.mkdir(exist_ok=True)

import django
django.setup()

from django.conf import settings
from django.core.management import call_command
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken

if settings.DATABASES['default']['ENGINE'] != 'django.db.backends.sqlite3':
    raise RuntimeError('La vista previa requiere SQLite aislada.')

call_command('migrate', verbosity=0)
call_command('seed_learning_path', verbosity=0)

from community.models import Friendship
from learning.models import DailyActivityLog, LearningLevel, ShopItem, UserInventoryItem, UserLevelProgress
from library.achievement_engine import _unlock_or_update, evaluate_for_user
from library.models import Achievement, UserAchievement

User = get_user_model()
user, _ = User.objects.get_or_create(username='Clara', defaults={'email': 'clara@preview.example'})
profile = user.profile
profile.has_completed_onboarding = True
profile.ink_balance = 850
profile.xp, profile.level, profile.streak_current = 450, 2, 12
profile.tagline = 'Siempre hay sitio para otra historia.'
profile.bio = 'Leo clásicos, subrayo finales y comparto descubrimientos en la Taberna.'
profile.equipped_frame, profile.equipped_title = 'frame-owl', 'Cronista'
profile.outfit = {'head': 'graduate', 'eyes': 'reading', 'neck': 'quill', 'cape': 'midnight'}
profile.save()
UserAchievement.objects.filter(user=user, achievement__code='maguito_full').update(
    current_progress=0, unlocked_at=None, notified=False)
UserInventoryItem.objects.filter(user=user, item__value='face:beard').update(quantity=0)

for code in ['frame_gold', 'frame_owl', 'title_chronicler', 'wear_head_graduate', 'wear_eyes_reading',
             'wear_neck_quill', 'wear_cape_midnight']:
    UserInventoryItem.objects.get_or_create(user=user, item=ShopItem.objects.get(code=code))
for level in LearningLevel.objects.order_by('unit__unit_number', 'level_number')[:9]:
    UserLevelProgress.objects.get_or_create(user=user, level=level, defaults={'is_completed': True, 'stars': 3})
evaluate_for_user(user, 'learning')
evaluate_for_user(user, 'collection')
for code, progress in [('streak_14', 12), ('highlights_50', 44), ('books_5', 3), ('night_owl_10', 10)]:
    _unlock_or_update(user, code, progress, Achievement.objects.get(code=code).threshold)

for name, frame, title in [('Mateo', 'frame-autumn', 'Pluma Errante'), ('Inés', 'frame-gold', 'Erudito Clásico')]:
    friend, _ = User.objects.get_or_create(username=name, defaults={'email': name.lower() + '@preview.example'})
    friend.profile.equipped_frame, friend.profile.equipped_title = frame, title
    friend.profile.outfit = {'head': 'deerstalker', 'eyes': 'reading'}
    friend.profile.save()
    Friendship.objects.get_or_create(requester=user, addressee=friend,
        defaults={'status': 'accepted'})
    DailyActivityLog.objects.update_or_create(user=friend, date=timezone.localdate(), defaults={'xp_earned': 90})
DailyActivityLog.objects.update_or_create(user=user, date=timezone.localdate(), defaults={'xp_earned': 150})

UserAchievement.objects.filter(user=user, unlocked_at__isnull=False).update(notified=True)
_unlock_or_update(user, 'night_owl', 1, 1)
UserAchievement.objects.filter(user=user, achievement__code='night_owl').update(notified=False)
refresh = RefreshToken.for_user(user)
session = {'access': str(refresh.access_token), 'refresh': str(refresh),
           'user': {'id': str(user.pk), 'username': user.username, 'email': user.email,
                    'is_staff': False, 'is_superuser': False, 'has_completed_onboarding': True}}
(backend / '.tmp-achievements-preview' / 'session.json').write_text(json.dumps(session), encoding='utf-8')
print('Vista previa creada en SQLite local. Sesión de prueba guardada en .tmp-achievements-preview/session.json.')
