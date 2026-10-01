import uuid
from datetime import datetime, timedelta, timezone as utc
from decimal import Decimal
from unittest.mock import patch
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework.exceptions import PermissionDenied
from users.models import User, Profile
from catalog.models import Book, Edition
from library.models import UserInventory, ReadingProgress, InkTransaction
from finance.models import SubscriptionPlan, UserSubscription
from .models import AIAvatar, ChatSession, DailyAIUsage, AIUsageEvent, ChatMessage, AssistantConversation
from .metered_service import MeteredAIService
from . import usage


@override_settings(GOOGLE_API_KEY='test-key', GOOGLE_API_KEY_2='', DEEPSEEK_API_KEY='')
class QuotaTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='lector', password='test')
        Profile.objects.filter(user=self.user).update(ink_balance=20)
        self.book = Book.objects.create(title='La prueba')
        self.edition = Edition.objects.create(book=self.book, price=0)
        self.avatar = AIAvatar.objects.create(edition=self.edition, name='Personaje', system_prompt='Eres un personaje.', is_major_character=True)
        self.session = ChatSession.objects.create(user=self.user, avatar=self.avatar)
        self.sub = UserSubscription.objects.create(user=self.user, plan_id='aprendiz', status='ACTIVE', paid_until=timezone.now()+timedelta(days=30))
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def result(self, tokens=100):
        return {'text': 'Una respuesta válida.', 'provider': 'gemini', 'model': 'test',
            'input_tokens': tokens-10, 'output_tokens': 10, 'reasoning_tokens': 0,
            'total_tokens': tokens, 'attempts': [{'estimated_cost': '0.0001'}]}

    def reserve(self, mode='plan', quote=None, request_id=None, session=None, message='Hola', ceiling=200):
        return usage.reserve(self.user, session or self.session, message, request_id or uuid.uuid4(), mode, quote, ceiling)

    def test_real_usage_settlement_and_replay(self):
        event, _ = self.reserve()
        usage.finish(event, 'Hola', self.result())
        replay, cached = self.reserve(request_id=event.pk)
        self.assertTrue(cached)
        self.assertEqual(replay.result['reply'], 'Una respuesta válida.')
        self.assertEqual(usage.snapshot(self.user)['tokens_used'], 100)
        self.assertEqual(usage.snapshot(self.user)['tokens_reserved'], 0)
        self.assertEqual(ChatMessage.objects.filter(session=self.session).count(), 2)
        self.assertEqual(InkTransaction.objects.filter(concept='ai_chat').count(), 0)

    def test_pending_and_changed_retry_do_not_generate_twice(self):
        event, _ = self.reserve()
        with self.assertRaises(usage.UsageDenied):
            self.reserve(request_id=event.pk)
        with self.assertRaises(usage.UsageDenied):
            self.reserve(request_id=event.pk, message='Otro mensaje')
        self.assertEqual(AIUsageEvent.objects.count(), 1)

    def test_reservations_shared_between_characters(self):
        self.reserve(ceiling=60000)
        other = ChatSession.objects.create(user=self.user, avatar=self.avatar)
        with self.assertRaises(usage.UsageDenied):
            self.reserve(session=other, ceiling=60000)
        self.assertEqual(usage.snapshot(self.user)['tokens_reserved'], 60000)

    def test_aprendiz_stops_at_time_limit(self):
        DailyAIUsage.objects.create(user=self.user, date=usage.day_bounds()[0], active_seconds=18000)
        with self.assertRaises(usage.UsageDenied):
            self.reserve()

    def test_maestro_has_no_time_limit(self):
        self.sub.plan_id = 'maestro'
        self.sub.save()
        DailyAIUsage.objects.create(user=self.user, date=usage.day_bounds()[0], active_seconds=90000)
        self.reserve()
        self.assertTrue(usage.snapshot(self.user)['plan_available'])

    def test_ink_requires_consent_bound_to_message(self):
        with self.assertRaises(usage.UsageDenied):
            self.reserve(mode='ink')
        quote = usage.quote(self.user, self.session, 'Hola')
        with self.assertRaises(usage.UsageDenied):
            self.reserve(mode='ink', quote=quote.pk, message='Diferente')
        self.assertEqual(Profile.objects.get(user=self.user).ink_balance, 20)

    def test_ink_success_charges_once_at_accepted_price(self):
        quote = usage.quote(self.user, self.session, 'Hola')
        event, _ = self.reserve(mode='ink', quote=quote.pk)
        usage.finish(event, 'Hola', self.result())
        self.reserve(mode='ink', quote=quote.pk, request_id=event.pk)
        self.assertEqual(Profile.objects.get(user=self.user).ink_balance, 18)
        self.assertEqual(InkTransaction.objects.filter(concept='ai_chat').count(), 1)
        self.assertEqual(usage.snapshot(self.user)['tokens_used'], 0)

    def test_failed_ink_and_provider_cost_accounting(self):
        quote = usage.quote(self.user, self.session, 'Hola')
        event, _ = self.reserve(mode='ink', quote=quote.pk)
        usage.fail(event, [{'estimated_cost': '0.005'}])
        usage.fail(event, [])
        event.refresh_from_db()
        self.assertEqual(Profile.objects.get(user=self.user).ink_balance, 20)
        self.assertEqual(event.estimated_cost, Decimal('0.005'))
        self.assertEqual(ChatMessage.objects.count(), 0)

    def test_failed_plan_releases_quota(self):
        event, _ = self.reserve()
        usage.fail(event, [])
        self.assertEqual(usage.snapshot(self.user)['tokens_reserved'], 0)
        self.assertEqual(usage.snapshot(self.user)['tokens_used'], 0)

    def test_expired_reservation_is_refunded(self):
        quote = usage.quote(self.user, self.session, 'Hola')
        event, _ = self.reserve(mode='ink', quote=quote.pk)
        AIUsageEvent.objects.filter(pk=event.pk).update(expires_at=timezone.now()-timedelta(seconds=1))
        self.assertEqual(usage.snapshot(self.user)['ink_balance'], 20)
        self.assertEqual(AIUsageEvent.objects.get(pk=event.pk).status, 'failed')

    def test_expired_quote_and_insufficient_ink(self):
        quote = usage.quote(self.user, self.session, 'Hola')
        quote.expires_at = timezone.now()-timedelta(seconds=1)
        quote.save()
        with self.assertRaises(usage.UsageDenied): self.reserve(mode='ink', quote=quote.pk)
        quote = usage.quote(self.user, self.session, 'Hola')
        Profile.objects.filter(user=self.user).update(ink_balance=1)
        with self.assertRaises(usage.UsageDenied): self.reserve(mode='ink', quote=quote.pk)
        self.assertEqual(Profile.objects.get(user=self.user).ink_balance, 1)

    def test_overlapping_devices_count_one_clock_and_pause(self):
        now = datetime(2026, 9, 30, 15, tzinfo=utc.utc)
        a, b = uuid.uuid4(), uuid.uuid4()
        with patch('ai_engine.usage.timezone.now', return_value=now):
            usage.heartbeat(self.user, self.session, a, True)
            usage.heartbeat(self.user, self.session, b, True)
        with patch('ai_engine.usage.timezone.now', return_value=now+timedelta(seconds=30)):
            self.assertEqual(usage.heartbeat(self.user, self.session, a, False)['active_seconds'], 30)
            self.assertEqual(usage.heartbeat(self.user, self.session, b, False)['active_seconds'], 30)
        with patch('ai_engine.usage.timezone.now', return_value=now+timedelta(minutes=5)):
            self.assertEqual(usage.snapshot(self.user)['active_seconds'], 30)

    def test_lost_browser_stops_when_lease_expires(self):
        now = timezone.now()
        with patch('ai_engine.usage.timezone.now', return_value=now): usage.heartbeat(self.user, self.session, uuid.uuid4(), True)
        with patch('ai_engine.usage.timezone.now', return_value=now+timedelta(minutes=10)):
            self.assertEqual(usage.snapshot(self.user)['active_seconds'], 35)

    def test_midnight_splits_clock_and_resets_tokens(self):
        now = datetime(2026, 9, 30, 2, 59, 50, tzinfo=utc.utc)
        with patch('ai_engine.usage.timezone.now', return_value=now):
            usage.heartbeat(self.user, self.session, uuid.uuid4(), True)
            DailyAIUsage.objects.filter(user=self.user).update(tokens_used=90000)
        with patch('ai_engine.usage.timezone.now', return_value=now+timedelta(seconds=20)):
            current = usage.snapshot(self.user)
            self.assertEqual(current['tokens_used'], 0)
            self.assertEqual(current['active_seconds'], 10)
        self.assertEqual(DailyAIUsage.objects.order_by('date').first().active_seconds, 10)

    def test_santiago_dst_days_are_not_always_24_hours(self):
        _, start, end = usage.day_bounds(datetime(2026, 9, 6, 12, tzinfo=utc.utc))
        self.assertEqual((end-start).total_seconds(), 23*3600)
        _, start, end = usage.day_bounds(datetime(2026, 4, 4, 12, tzinfo=utc.utc))
        self.assertEqual((end-start).total_seconds(), 25*3600)

    def test_progress_lock_remains_even_with_maestro(self):
        self.avatar.unlock_at_chapter = 3
        self.avatar.save()
        with self.assertRaises(PermissionDenied): usage.check_avatar(self.user, self.avatar)
        inventory = UserInventory.objects.create(user=self.user, edition=self.edition)
        ReadingProgress.objects.filter(inventory=inventory).update(current_page=3)
        usage.check_avatar(self.user, self.avatar)

    def test_last_message_is_only_included_once(self):
        ChatMessage.objects.create(session=self.session, role='assistant', content='Antes')
        service = MeteredAIService(self.avatar, self.session)
        service.prepare('Hola')
        self.assertEqual(sum(m['content'] == 'Hola' for m in service.messages), 1)

    @patch('ai_engine.usage_views.MeteredAIService.generate_metered')
    def test_http_retry_only_calls_provider_once(self, generate):
        generate.return_value = self.result()
        data = {'session_id': str(self.session.pk), 'message': 'Hola', 'request_id': str(uuid.uuid4()), 'payment_mode': 'plan'}
        self.assertEqual(self.client.post('/api/v1/ai/chat/', data).status_code, 200)
        self.assertEqual(self.client.post('/api/v1/ai/chat/', data).status_code, 200)
        self.assertEqual(generate.call_count, 1)

    @patch('ai_engine.usage_views.MeteredAIService.generate_metered', side_effect=RuntimeError('timeout'))
    def test_http_provider_error_has_no_charge(self, generate):
        data = {'session_id': str(self.session.pk), 'message': 'Hola', 'request_id': str(uuid.uuid4())}
        self.assertEqual(self.client.post('/api/v1/ai/chat/', data).status_code, 503)
        self.assertEqual(usage.snapshot(self.user)['tokens_used'], 0)
        self.assertEqual(usage.snapshot(self.user)['tokens_reserved'], 0)

    def test_missing_request_id_is_rejected(self):
        self.assertEqual(self.client.post('/api/v1/ai/chat/', {'session_id': str(self.session.pk), 'message': 'Hola'}).status_code, 400)

    def test_authenticated_demo_cannot_bypass_meter(self):
        self.assertEqual(self.client.post('/api/v1/ai/demo-chat/', {'message': 'Hola'}).status_code, 403)

    @patch('ai_engine.views.AssistantAIService.generate_reply', return_value='La biblioteca sigue gratis.')
    def test_general_assistant_is_free_even_without_subscription_or_ink(self, generate):
        UserSubscription.objects.filter(user=self.user).update(paid_until=timezone.now()-timedelta(days=1))
        Profile.objects.filter(user=self.user).update(ink_balance=0)
        conversation = AssistantConversation.objects.create(user=self.user)
        response = self.client.post('/api/v1/ai/assistant/chat/', {'conversation_id': str(conversation.pk), 'message': '¿Cómo leo?'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Profile.objects.get(user=self.user).ink_balance, 0)
        self.assertEqual(AIUsageEvent.objects.count(), 0)

    def test_free_book_does_not_require_a_subscription(self):
        UserSubscription.objects.filter(user=self.user).update(paid_until=None)
        response = self.client.post('/api/v1/finance/pay/', {'item_type': 'book', 'item_reference': self.book.slug})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['status'], 'FREE_PURCHASE_SUCCESS')
        self.assertTrue(UserInventory.objects.filter(user=self.user, edition=self.edition).exists())
