"""Run these tests against an isolated PostgreSQL database, never the shared DB."""
import uuid
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from datetime import timedelta
from unittest import skipUnless
from django.db import connection, close_old_connections
from django.test import TransactionTestCase
from django.utils import timezone
from users.models import User
from catalog.models import Book, Edition
from finance.models import SubscriptionPlan, UserSubscription
from .models import AIAvatar, ChatSession, AIUsageEvent, DailyAIUsage
from . import usage


@skipUnless(connection.vendor == 'postgresql', 'Requiere PostgreSQL aislado para validar los bloqueos reales.')
class PostgreSQLQuotaTests(TransactionTestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='parallel', password='test')
        plan, _ = SubscriptionPlan.objects.get_or_create(code='aprendiz', defaults={'name': 'Aprendiz', 'price': '7.99', 'daily_token_limit': 100000, 'daily_time_limit': 18000})
        UserSubscription.objects.create(user=self.user, plan=plan, paid_until=timezone.now()+timedelta(days=5))
        edition = Edition.objects.create(book=Book.objects.create(title='Concurrencia'), price=0)
        avatar = AIAvatar.objects.create(edition=edition, name='Personaje', system_prompt='Habla', is_major_character=True)
        self.sessions = [ChatSession.objects.create(user=self.user, avatar=avatar) for _ in range(2)]

    def run_workers(self, same_request=False):
        barrier = Barrier(2)
        request_id = uuid.uuid4()
        def worker(index):
            close_old_connections()
            try:
                user = User.objects.get(pk=self.user.pk)
                session = ChatSession.objects.get(pk=self.sessions[0 if same_request else index].pk)
                barrier.wait(timeout=5)
                usage.reserve(user, session, 'Hola', request_id if same_request else uuid.uuid4(), 'plan', None, 60000)
                return 'reserved'
            except usage.UsageDenied as exc:
                return str(exc.detail['error'])
            finally:
                close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool:
            return list(pool.map(worker, [0, 1]))

    def test_parallel_sessions_cannot_overdraw_quota(self):
        self.assertCountEqual(self.run_workers(), ['reserved', 'AI_TOKEN_LIMIT'])
        self.assertEqual(DailyAIUsage.objects.get(user=self.user).tokens_reserved, 60000)

    def test_parallel_retries_only_create_one_reservation(self):
        self.assertCountEqual(self.run_workers(True), ['reserved', 'REQUEST_PENDING'])
        self.assertEqual(AIUsageEvent.objects.count(), 1)
