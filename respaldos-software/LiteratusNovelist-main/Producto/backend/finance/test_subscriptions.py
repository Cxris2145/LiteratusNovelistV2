from datetime import datetime, timedelta, timezone as utc
from unittest.mock import patch
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from users.models import User, Profile
from library.models import InkTransaction
from learning.models import ShopItem, UserInventoryItem
from . import paypal
from .models import UserSubscription, SubscriptionPlan, Transaction, PayPalWebhook, PayPalSubscriptionBinding
from .subscriptions import process_webhook, has_paid_access, cosmetics, reconcile_payments


@override_settings(PAYPAL_CLIENT_ID='test', PAYPAL_CLIENT_SECRET='test', PAYPAL_WEBHOOK_ID='WH-test', PAYPAL_MERCHANT_ID='MERCHANT', FRONTEND_URL='http://localhost:4200')
class SubscriptionTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='maestro', password='test')
        Profile.objects.filter(user=self.user).update(ink_balance=10)
        SubscriptionPlan.objects.filter(code='aprendiz').update(provider_plan_id='P-APRENDIZ')
        SubscriptionPlan.objects.filter(code='maestro').update(provider_plan_id='P-MAESTRO')
        self.sub = UserSubscription.objects.create(user=self.user, plan_id='maestro', provider_subscription_id='I-TEST')
        PayPalSubscriptionBinding.objects.create(provider_subscription_id='I-TEST', subscription=self.sub, plan_id='maestro')
        self.paid_at = timezone.now()-timedelta(minutes=1)
        self.remote = {'id': 'I-TEST', 'plan_id': 'P-MAESTRO', 'status': 'ACTIVE', 'custom_id': str(self.user.pk),
            'billing_info': {'next_billing_time': (self.paid_at+timedelta(days=28)).isoformat(), 'last_payment': {'time': self.paid_at.isoformat()}}}
        self.record = {'id': 'SALE-1', 'status': 'COMPLETED', 'time': self.paid_at.isoformat(),
            'amount_with_breakdown': {'gross_amount': {'value': '14.99', 'currency_code': 'USD'}}}
        self.event = {'id': 'WH-1', 'event_type': 'PAYMENT.SALE.COMPLETED', 'resource': {
            'id': 'SALE-1', 'billing_agreement_id': 'I-TEST', 'create_time': self.paid_at.isoformat(), 'payee': {'merchant_id': 'MERCHANT'}}}
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def api(self, method, path, *args, **kwargs):
        if '/transactions?' in path: return {'transactions': [self.record]}
        return self.remote

    def deliver(self):
        with patch('finance.subscriptions.paypal.api', side_effect=self.api): process_webhook(self.event)
        self.sub.refresh_from_db()

    def test_verified_month_activates_and_bonus_is_exactly_once(self):
        self.deliver()
        self.deliver()
        self.event['id'] = 'WH-duplicate-sale'
        self.deliver()
        self.assertTrue(has_paid_access(self.sub))
        self.assertEqual(Profile.objects.get(user=self.user).ink_balance, 510)
        self.assertEqual(Transaction.objects.count(), 1)
        self.assertEqual(InkTransaction.objects.filter(concept='subscription_bonus').count(), 1)
        self.assertEqual(Transaction.objects.first().currency, 'USD')

    def test_second_paid_month_credits_another_bonus(self):
        self.deliver()
        self.record['id'] = self.event['resource']['id'] = 'SALE-2'
        self.event['id'] = 'WH-2'
        self.record['time'] = self.event['resource']['create_time'] = (self.paid_at+timedelta(days=28)).isoformat()
        with patch('finance.subscriptions.timezone.now', return_value=self.paid_at+timedelta(days=29)):
            self.deliver()
        self.assertEqual(Profile.objects.get(user=self.user).ink_balance, 1010)

    def test_activation_event_alone_grants_nothing(self):
        self.event = {'id': 'WH-active', 'event_type': 'BILLING.SUBSCRIPTION.ACTIVATED', 'resource': {'id': 'I-TEST'}}
        self.deliver()
        self.assertFalse(has_paid_access(self.sub))
        self.assertEqual(Profile.objects.get(user=self.user).ink_balance, 10)

    def test_failed_renewal_preserves_only_existing_period(self):
        self.deliver()
        previous = self.sub.paid_until
        self.remote['status'] = 'SUSPENDED'
        self.event = {'id': 'WH-failed', 'event_type': 'BILLING.SUBSCRIPTION.PAYMENT.FAILED', 'resource': {'id': 'I-TEST'}}
        self.deliver()
        self.assertEqual(self.sub.paid_until, previous)
        self.assertEqual(Profile.objects.get(user=self.user).ink_balance, 510)

    def test_wrong_price_rolls_back_event_and_payment(self):
        self.record['amount_with_breakdown']['gross_amount']['value'] = '0.01'
        with self.assertRaises(paypal.PayPalError): self.deliver()
        self.assertEqual(PayPalWebhook.objects.count(), 0)
        self.assertEqual(Transaction.objects.count(), 0)
        self.assertEqual(Profile.objects.get(user=self.user).ink_balance, 10)

    def test_wrong_currency_and_receiver_are_rejected(self):
        self.record['amount_with_breakdown']['gross_amount']['currency_code'] = 'CLP'
        with self.assertRaises(paypal.PayPalError): self.deliver()
        self.record['amount_with_breakdown']['gross_amount']['currency_code'] = 'USD'
        self.event['resource']['payee']['merchant_id'] = 'OTHER'
        with self.assertRaises(paypal.PayPalError): self.deliver()

    def test_payment_must_be_confirmed_in_merchant_subscription(self):
        self.record['status'] = 'PENDING'
        with self.assertRaises(paypal.PayPalError): self.deliver()
        self.record['status'] = 'COMPLETED'
        self.remote['custom_id'] = 'another-user'
        with self.assertRaises(paypal.PayPalError): self.deliver()

    def test_signature_rejection_never_credits(self):
        with patch('finance.subscription_views.paypal.verify_webhook', return_value=False):
            self.assertEqual(self.client.post('/api/v1/finance/paypal/webhook/', self.event, format='json').status_code, 403)
        self.assertEqual(Transaction.objects.count(), 0)

    def test_cancel_keeps_paid_period_and_ink(self):
        self.deliver()
        with patch('finance.subscription_views.paypal.api', return_value={}):
            self.assertEqual(self.client.post('/api/v1/finance/subscription/cancel/').status_code, 200)
        self.sub.refresh_from_db()
        self.assertTrue(has_paid_access(self.sub))
        self.assertTrue(self.sub.cancel_at_period_end)
        self.assertEqual(Profile.objects.get(user=self.user).ink_balance, 510)

    def test_cosmetics_expire_and_restore_owned_frame(self):
        self.deliver()
        item = ShopItem.objects.create(code='old-frame', name='Marco', item_type='profile_frame', value='frame-old', cost_ink=10)
        UserInventoryItem.objects.create(user=self.user, item=item)
        Profile.objects.filter(user=self.user).update(equipped_frame='frame-old')
        self.assertEqual(self.client.post('/api/v1/finance/subscription/frame/').status_code, 200)
        self.sub.refresh_from_db()
        self.assertEqual(self.sub.previous_frame, 'frame-old')
        UserSubscription.objects.filter(pk=self.sub.pk).update(paid_until=timezone.now()-timedelta(seconds=1))
        self.assertFalse(cosmetics(self.user)['maestro'])
        self.assertEqual(Profile.objects.get(user=self.user).equipped_frame, 'frame-old')
        self.assertEqual(Profile.objects.get(user=self.user).ink_balance, 510)

    def test_invalid_previous_frame_falls_back_to_default(self):
        Profile.objects.filter(user=self.user).update(equipped_frame='frame-maestro')
        self.sub.previous_frame = 'no-longer-owned'
        self.sub.save()
        cosmetics(self.user)
        self.assertEqual(Profile.objects.get(user=self.user).equipped_frame, '')

    def test_change_waits_for_next_paid_cycle(self):
        self.deliver()
        with patch('finance.subscription_views.paypal.api', return_value={'links': [{'rel': 'approve', 'href': 'https://www.sandbox.paypal.com/approve'}]}):
            response = self.client.post('/api/v1/finance/subscription/change/', {'plan_code': 'aprendiz'})
        self.assertEqual(response.status_code, 200)
        self.sub.refresh_from_db()
        self.assertEqual(self.sub.plan_id, 'maestro')
        self.assertEqual(self.sub.pending_plan_id, 'aprendiz')
        self.remote['plan_id'] = 'P-APRENDIZ'
        self.record['amount_with_breakdown']['gross_amount']['value'] = '7.99'
        self.record['id'] = self.event['resource']['id'] = 'SALE-2'
        self.event['id'] = 'WH-2'
        self.record['time'] = self.event['resource']['create_time'] = (self.paid_at+timedelta(days=28)).isoformat()
        with patch('finance.subscriptions.timezone.now', return_value=self.paid_at+timedelta(days=29)):
            self.deliver()
        self.assertEqual(self.sub.plan_id, 'aprendiz')
        self.assertIsNone(self.sub.pending_plan)
        self.assertEqual(Profile.objects.get(user=self.user).ink_balance, 510)

    def test_old_payment_after_new_payment_does_not_shorten_vigency(self):
        self.deliver()
        previous = self.sub.paid_until
        self.record['id'] = self.event['resource']['id'] = 'SALE-older'
        self.event['id'] = 'WH-old'
        self.record['time'] = self.event['resource']['create_time'] = (self.paid_at-timedelta(days=60)).isoformat()
        self.deliver()
        self.assertEqual(self.sub.paid_until, previous)

    def test_reconciliation_recovers_missing_payment_once(self):
        with patch('finance.subscriptions.paypal.api', side_effect=self.api):
            reconcile_payments(self.sub)
            reconcile_payments(self.sub)
        self.sub.refresh_from_db()
        self.assertTrue(has_paid_access(self.sub))
        self.assertEqual(Profile.objects.get(user=self.user).ink_balance, 510)

    def test_delayed_old_contract_payment_credits_without_replacing_new_plan(self):
        self.sub.provider_subscription_id = 'I-NEW'
        self.sub.plan_id = 'aprendiz'
        self.sub.save()
        self.deliver()
        self.assertEqual(self.sub.plan_id, 'aprendiz')
        self.assertIsNone(self.sub.paid_until)
        self.assertEqual(Profile.objects.get(user=self.user).ink_balance, 510)

    def test_catalog_is_public_and_has_agreed_prices(self):
        self.client.force_authenticate(None)
        data = self.client.get('/api/v1/finance/plans/').json()
        self.assertEqual([(p['code'], p['price']) for p in data], [('aprendiz', '7.99'), ('maestro', '14.99')])
        self.assertEqual(self.client.get('/api/v1/finance/ink-packages/').status_code, 200)

    def test_fake_reward_endpoint_is_disabled(self):
        response = self.client.post('/api/v1/users/me/add_ink/', {'amount': 100000})
        self.assertEqual(response.status_code, 410)
        self.assertEqual(Profile.objects.get(user=self.user).ink_balance, 10)

    def test_profile_update_cannot_change_balance_or_entitlement(self):
        response = self.client.patch('/api/v1/users/profile/', {'ink_balance': 90000, 'xp': 90000, 'equipped_frame': 'frame-maestro'}, format='json')
        self.assertEqual(response.status_code, 200)
        profile = Profile.objects.get(user=self.user)
        self.assertEqual(profile.ink_balance, 10)
        self.assertNotEqual(profile.equipped_frame, 'frame-maestro')

    def test_webpay_repeat_callback_delivers_one_coffer(self):
        transaction = Transaction.objects.create(user=self.user, buy_order='WB-TEST', session_id='SESSION', token='TOKEN',
            amount='990', item_type='ink', item_reference='200')
        self.client.force_authenticate(None)
        with patch('finance.views.webpay_service.confirm_transaction', return_value={'response_code': 0, 'buy_order': 'WB-TEST', 'session_id': 'SESSION', 'amount': 990}) as confirm:
            self.assertEqual(self.client.post('/api/v1/finance/confirm/?token_ws=TOKEN').status_code, 302)
            self.assertEqual(self.client.post('/api/v1/finance/confirm/?token_ws=TOKEN').status_code, 302)
            self.assertEqual(confirm.call_count, 1)
        self.assertEqual(Profile.objects.get(user=self.user).ink_balance, 210)
        self.assertEqual(InkTransaction.objects.filter(concept='ink_purchase').count(), 1)

    def test_webpay_wrong_amount_does_not_deliver_ink(self):
        Transaction.objects.create(user=self.user, buy_order='WB-TEST', session_id='SESSION', token='TOKEN',
            amount='990', item_type='ink', item_reference='200')
        with patch('finance.views.webpay_service.confirm_transaction', return_value={'response_code': 0, 'buy_order': 'WB-TEST', 'session_id': 'SESSION', 'amount': 1}):
            self.client.get('/api/v1/finance/confirm/?token_ws=TOKEN')
        self.assertEqual(Profile.objects.get(user=self.user).ink_balance, 10)

    def test_daily_reward_cannot_be_claimed_twice(self):
        self.assertEqual(self.client.post('/api/v1/library/daily-reward/claim/').status_code, 200)
        self.assertEqual(self.client.post('/api/v1/library/daily-reward/claim/').status_code, 400)
        self.assertEqual(InkTransaction.objects.filter(concept='daily_reward').count(), 1)

    def test_maximum_shields_does_not_spend_ink(self):
        from learning.services import purchase_shop_item
        Profile.objects.filter(user=self.user).update(streak_shields=2)
        ShopItem.objects.create(code='shield-test', name='Escudo', item_type='streak_shield', cost_ink=5)
        result = purchase_shop_item(self.user, 'shield-test')
        self.assertFalse(result['success'])
        self.assertEqual(Profile.objects.get(user=self.user).ink_balance, 10)

    def test_month_end_anchor_uses_provider_period(self):
        paid = datetime(2026, 2, 28, 12, tzinfo=utc.utc)
        end = datetime(2026, 3, 31, 12, tzinfo=utc.utc)
        self.remote['billing_info'] = {'last_payment': {'time': paid.isoformat()}, 'next_billing_time': end.isoformat()}
        self.record['time'] = self.event['resource']['create_time'] = paid.isoformat()
        self.deliver()
        self.assertEqual(self.sub.paid_until, end)

    def test_old_last_payment_does_not_grant_two_unpaid_months(self):
        self.remote['billing_info']['next_billing_time'] = (self.paid_at+timedelta(days=60)).isoformat()
        self.deliver()
        self.assertLessEqual(self.sub.paid_until, self.paid_at+timedelta(days=32))

    def test_contract_creation_retry_uses_same_provider_request(self):
        user = User.objects.create_user(username='checkout-new', email='checkout@example.invalid', password='test')
        self.client.force_authenticate(user)
        created = {'id': 'I-NEW', 'status': 'APPROVAL_PENDING', 'links': [{'rel': 'approve', 'href': 'https://www.sandbox.paypal.com/approve'}]}
        with patch('finance.subscription_views.paypal.api', side_effect=[paypal.PayPalError('Timeout'), created]) as api:
            self.assertEqual(self.client.post('/api/v1/finance/subscription/subscribe/', {'plan_code': 'maestro', 'price': '0'}).status_code, 502)
            response = self.client.post('/api/v1/finance/subscription/subscribe/', {'plan_code': 'maestro', 'price': '0'})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(api.call_args_list[0].args[3], api.call_args_list[1].args[3])
            self.assertEqual(api.call_args_list[1].args[2]['plan_id'], 'P-MAESTRO')
        self.assertFalse(has_paid_access(UserSubscription.objects.get(user=user)))
        self.assertEqual(PayPalSubscriptionBinding.objects.filter(subscription__user=user).count(), 1)

    def test_profile_edit_does_not_overwrite_a_new_balance(self):
        stale = Profile.objects.get(user=self.user)
        Profile.objects.filter(user=self.user).update(ink_balance=5)
        with patch('users.views.ProfileView.get_object', return_value=stale):
            response = self.client.patch('/api/v1/users/profile/', {'bio': 'Mi lectura'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Profile.objects.get(user=self.user).ink_balance, 5)

    def test_legacy_spend_rejects_invalid_amount(self):
        self.assertEqual(self.client.post('/api/v1/users/me/spend_ink/', {'amount': 'invalid'}).status_code, 400)
        self.assertEqual(Profile.objects.get(user=self.user).ink_balance, 10)

    def test_audio_keeps_its_price_without_overwriting_other_spending(self):
        def generate(*args):
            Profile.objects.filter(user=self.user).update(ink_balance=9)
            return 'YQ=='
        with patch('ai_engine.views.azure_tts.is_configured', return_value=False), patch('ai_engine.views.KokoroTTSService.generate_audio_base64', side_effect=generate):
            response = self.client.post('/api/v1/ai/audio/generate/', {'text': 'Hola'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Profile.objects.get(user=self.user).ink_balance, 7)
        self.assertEqual(InkTransaction.objects.get(concept='ai_audio').amount, -2)
