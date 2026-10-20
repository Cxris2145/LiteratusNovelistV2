import uuid
from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APITestCase

from ai_engine.models import AIAvatar, AIUsageEvent, ChatSession, DailyAIUsage
from catalog.models import Book, Edition
from community.models import Friendship
from finance import paypal
from finance.models import PayPalSubscriptionBinding, UserSubscription
from library.models import UserInventory
from .models import Profile

DELETE = '/api/v1/users/me/delete/'
LOGIN = '/api/v1/users/login/'


class AccountDeletionTests(APITestCase):
    password = 'LecturaSegura2026!'

    def setUp(self):
        cache.clear()
        User = get_user_model()
        self.user = User.objects.create_user(username='lectora', email='lectora@example.com', password=self.password)
        self.friend = User.objects.create_user(username='amigo', email='amigo@example.com', password='OtraClave2026!')
        self.client.force_authenticate(self.user)

    def add_usage_and_subscription(self, status='ACTIVE'):
        book = Book.objects.create(title='La prueba', submitted_by=self.user)
        edition = Edition.objects.create(book=book, price=0)
        avatar = AIAvatar.objects.create(edition=edition, name='Personaje', system_prompt='Eres un personaje.')
        session = ChatSession.objects.create(user=self.user, avatar=avatar)
        usage = DailyAIUsage.objects.create(user=self.user, date=timezone.localdate())
        AIUsageEvent.objects.create(request_id=uuid.uuid4(), user=self.user, session=session, usage=usage,
                                    message_hash='x' * 64, mode='chat', expires_at=timezone.now() + timedelta(minutes=5))
        UserInventory.objects.create(user=self.user, edition=edition)
        Friendship.objects.create(requester=self.user, addressee=self.friend)
        sub = UserSubscription.objects.create(user=self.user, plan_id='maestro', status=status,
                                              provider_subscription_id='I-BORRAR',
                                              paid_until=timezone.now() + timedelta(days=20))
        PayPalSubscriptionBinding.objects.create(provider_subscription_id='I-BORRAR', subscription=sub, plan_id='maestro')
        return book

    def test_wrong_or_missing_password_keeps_the_account(self):
        for body in ({}, {'password': ''}, {'password': 'otra-clave'}, {'password': ['lista']}):
            response = self.client.post(DELETE, body, format='json')
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.data['code'], 'PASSWORD_INVALID')
        self.assertTrue(get_user_model().all_objects.filter(pk=self.user.pk).exists())

    def test_requires_login(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.post(DELETE, {'password': self.password}, format='json').status_code, 401)

    def test_deletes_account_and_its_data_for_good(self):
        book = self.add_usage_and_subscription()
        with mock.patch('finance.paypal.api', return_value={}) as api:
            response = self.client.post(DELETE, {'password': self.password}, format='json')

        self.assertEqual(response.status_code, 204)
        api.assert_called_once()
        self.assertIn('/v1/billing/subscriptions/I-BORRAR/cancel', api.call_args.args[1])
        self.assertFalse(get_user_model().all_objects.filter(pk=self.user.pk).exists())
        self.assertFalse(Profile.all_objects.filter(user_id=self.user.pk).exists())
        for model in (UserSubscription, PayPalSubscriptionBinding, AIUsageEvent, DailyAIUsage, UserInventory, Friendship):
            self.assertFalse(model.objects.exists(), model.__name__)
        book.refresh_from_db()
        self.assertIsNone(book.submitted_by_id)
        self.assertTrue(get_user_model().objects.filter(pk=self.friend.pk).exists())

        # El correo y el nombre quedan libres para una cuenta nueva.
        self.client.force_authenticate(None)
        self.assertEqual(self.client.post(LOGIN, {'username': 'lectora', 'password': self.password},
                                          format='json').status_code, 401)
        get_user_model().objects.create_user(username='lectora', email='lectora@example.com', password='Nueva2026!')

    def test_paypal_failure_keeps_the_account(self):
        self.add_usage_and_subscription()
        with mock.patch('finance.paypal.api', side_effect=paypal.PayPalError('Timeout')):
            response = self.client.post(DELETE, {'password': self.password}, format='json')

        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.data['code'], 'SUBSCRIPTION_CANCEL_FAILED')
        self.assertTrue(get_user_model().objects.filter(pk=self.user.pk, is_active=True).exists())
        self.assertFalse(UserSubscription.objects.get(user=self.user).cancel_at_period_end)

    def test_cancelled_plan_is_not_cancelled_again(self):
        self.add_usage_and_subscription(status='CANCELLED')
        with mock.patch('finance.paypal.api') as api:
            response = self.client.post(DELETE, {'password': self.password}, format='json')

        self.assertEqual(response.status_code, 204)
        api.assert_not_called()
        self.assertFalse(get_user_model().all_objects.filter(pk=self.user.pk).exists())

    def test_password_guesses_are_throttled(self):
        statuses = [self.client.post(DELETE, {'password': 'intento'}, format='json').status_code for _ in range(11)]
        self.assertEqual(statuses[:10], [400] * 10)
        self.assertEqual(statuses[10], 429)
