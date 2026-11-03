"""Tinta infinita: solo las cuentas marcadas gastan Tinta sin que baje su saldo."""
import importlib
import uuid
from datetime import timedelta
from unittest.mock import patch

from django.apps import apps
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from ai_engine import usage
from ai_engine.models import AIAvatar, BlindInterrogationSession, ChatSession
from catalog.models import Book, Edition
from learning.models import ShopItem
from library.models import InkTransaction
from users.models import Profile, User

migration = importlib.import_module('users.migrations.0017_profile_infinite_ink')

# Como están escritos en Supabase («Cxris» y «Felipe» con mayúscula).
INFINITE_USERNAMES = ['admin', 'Cxris', 'eithan', 'chris123', 'Felipe', 'elmatiaa', 'matiamenor']


@override_settings(GOOGLE_API_KEY='test-key', GOOGLE_API_KEY_2='', DEEPSEEK_API_KEY='')
class InfiniteInkTests(APITestCase):
    def setUp(self):
        self.infinite = [self.make_user(name) for name in INFINITE_USERNAMES]
        self.reader = self.make_user('lector')
        self.lookalike = self.make_user('cxris2')
        migration.mark_infinite_ink(apps, None)
        self.book = Book.objects.create(title='Obra de pago', is_published=True, status=Book.StatusChoices.PUBLISHED)
        Edition.objects.create(book=self.book, price=40)
        free_book = Book.objects.create(title='Obra libre', is_published=True, status=Book.StatusChoices.PUBLISHED)
        free_edition = Edition.objects.create(book=free_book, price=0)
        self.avatar = AIAvatar.objects.create(edition=free_edition, name='Personaje', system_prompt='Prueba',
                                              is_major_character=True)
        self.suspects = [AIAvatar.objects.create(edition=free_edition, name=f'Señuelo {n}', system_prompt='Prueba',
                                                 is_major_character=True) for n in range(3)]

    def make_user(self, name):
        return User.objects.create_user(username=name, email=f'{name.lower()}@example.com', password='StrongPassword123!')

    def balance(self, user):
        return Profile.objects.get(user=user).ink_balance

    def rewards(self, user):
        """Tinta ganada por el camino (logros y misiones de la primera compra, etc.)."""
        return sum(InkTransaction.objects.filter(user=user, amount__gt=0).values_list('amount', flat=True))

    def post(self, user, url, data=None):
        """
        Cada petición con el usuario recién leído, como en el sitio: algunas vistas usan
        request.user.profile y un perfil en caché de la petición anterior tendría el saldo viejo.
        Un 200 con success=False (p. ej. «Ya tienes tus 5 corazones») cuenta como rechazo.
        """
        self.client.force_authenticate(User.objects.get(pk=user.pk))
        response = self.client.post(url, data or {}, format='json')
        refused = isinstance(response.data, dict) and response.data.get('success') is False
        return 400 if refused else response.status_code

    def spend_everywhere(self, user):
        """Pasa por cada cobro en Tinta del sitio y devuelve {cobro: código HTTP}."""
        Profile.objects.filter(user=user).update(
            hearts=0, hearts_last_updated=timezone.now(), streak_current=0, streak_max=12,
            streak_last_date=timezone.localdate() - timedelta(days=5))
        interrogation = BlindInterrogationSession.objects.create(
            user=user, avatar=self.avatar, distractor_avatar_ids=[str(a.pk) for a in self.suspects])
        book = f'/api/v1/catalog/books/{self.book.slug}/'
        codes = {
            'El Bazar': self.post(user, '/api/v1/learning/shop/buy/', {'item_code': 'wear_head_hood'}),
            'Pase del día': self.post(user, '/api/v1/ai/chat/day-pass/'),
            'Vidas': self.post(user, '/api/v1/learning/hearts/refill/'),
            'Racha': self.post(user, '/api/v1/learning/streak/repair/'),
            'Obra': self.post(user, book + 'purchase/'),
            'Narración': self.post(user, book + 'purchase_narration/'),
            'Interrogatorio': self.post(user, '/api/v1/ai/games/interrogation/buy-perk/',
                                        {'session_id': str(interrogation.pk), 'perk': 'discard_two'}),
            'Gasto genérico': self.post(user, '/api/v1/users/me/spend_ink/', {'amount': 30, 'concept': 'juego'}),
        }
        with patch('ai_engine.views.azure_tts.is_configured', return_value=True), \
                patch('ai_engine.views.azure_tts.synthesize_mp3', return_value=b'mp3'):
            codes['Voz'] = self.post(user, '/api/v1/ai/audio/generate/', {'text': 'Hola, lector.'})
        codes['Chat con Tinta'] = self.chat_with_ink(user)
        return codes

    def chat_with_ink(self, user):
        session = ChatSession.objects.create(user=user, avatar=self.avatar)
        quote = usage.quote(user, session, 'Hola')
        event, _ = usage.reserve(user, session, 'Hola', uuid.uuid4(), 'ink', quote.pk, 200)
        usage.finish(event, 'Hola', {'text': 'Respuesta.', 'provider': 'gemini', 'model': 'test', 'input_tokens': 90,
                                     'output_tokens': 10, 'reasoning_tokens': 0, 'total_tokens': 100, 'attempts': []})
        return 200

    def test_migration_marks_only_the_seven_accounts(self):
        marked = set(Profile.objects.filter(infinite_ink=True).values_list('user__username', flat=True))
        self.assertEqual(marked, set(INFINITE_USERNAMES))
        self.assertFalse(Profile.objects.get(user=self.lookalike).infinite_ink)

    def test_infinite_accounts_spend_everywhere_without_losing_ink(self):
        for user in self.infinite:
            with self.subTest(user=user.username):
                # Sin saldo: con Tinta infinita ningún cobro puede fallar por falta de Tinta.
                Profile.objects.filter(user=user).update(ink_balance=0)
                codes = self.spend_everywhere(user)
                self.assertTrue(all(200 <= code < 300 for code in codes.values()), codes)
                # Solo sube con lo ganado; nada lo hizo bajar.
                self.assertEqual(self.balance(user), self.rewards(user))
                spent = InkTransaction.objects.filter(user=user, amount__lt=0)
                self.assertFalse(spent.exists(), 'No se descontó nada, así que ningún movimiento resta Tinta.')

    def test_regular_reader_still_pays(self):
        Profile.objects.filter(user=self.reader).update(ink_balance=1000)
        codes = self.spend_everywhere(self.reader)
        self.assertTrue(all(200 <= code < 300 for code in codes.values()), codes)
        # Bazar + pase + vidas + racha + obra + narración + 50/50 + gasto + voz + chat
        price = ShopItem.objects.get(code='wear_head_hood').cost_ink
        costs = price + 20 + 25 + 60 + 40 + 200 + 4 + 30 + 2 + 2
        self.assertEqual(self.balance(self.reader), 1000 - costs + self.rewards(self.reader))

    def test_regular_reader_without_ink_is_refused(self):
        Profile.objects.filter(user=self.reader).update(ink_balance=1)
        self.client.force_authenticate(self.reader)
        self.assertEqual(self.client.post('/api/v1/ai/chat/day-pass/').data['error'], 'INSUFFICIENT_INK')
        response = self.client.post('/api/v1/users/me/spend_ink/', {'amount': 30}, format='json')
        self.assertEqual(response.status_code, 402)
        self.assertEqual(self.balance(self.reader), 1)

    def test_failed_chat_answer_does_not_mint_ink(self):
        user = self.infinite[0]
        Profile.objects.filter(user=user).update(ink_balance=7)
        session = ChatSession.objects.create(user=user, avatar=self.avatar)
        quote = usage.quote(user, session, 'Hola')
        event, _ = usage.reserve(user, session, 'Hola', uuid.uuid4(), 'ink', quote.pk, 200)
        usage.release_event(event, Profile.objects.get(user=user))
        self.assertEqual(self.balance(user), 7)

    def test_profile_reports_the_flag_and_nobody_can_turn_it_on(self):
        self.client.force_authenticate(self.infinite[1])
        self.assertTrue(self.client.get('/api/v1/users/profile/').data['infinite_ink'])
        self.client.force_authenticate(self.reader)
        self.assertFalse(self.client.get('/api/v1/users/profile/').data['infinite_ink'])
        response = self.client.patch('/api/v1/users/profile/', {'infinite_ink': True}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(Profile.objects.get(user=self.reader).infinite_ink)
