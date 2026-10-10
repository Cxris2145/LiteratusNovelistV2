import re
from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from .models import PasswordResetChallenge

REQUEST = '/api/v1/users/password-reset/'
VERIFY = '/api/v1/users/password-reset-verify/'
CONFIRM = '/api/v1/users/password-reset-confirm/'
LOGIN = '/api/v1/users/login/'


@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
class PasswordRecoveryTests(APITestCase):
    old_password = 'LecturaAnterior2026!'
    new_password = 'HistoriasNuevas2026!'

    def setUp(self):
        cache.clear()
        self.user = get_user_model().objects.create_user(
            username='lectora', email='lectora@example.com', password=self.old_password)

    def request_code(self, email=None):
        response = self.client.post(REQUEST, {'email': email or self.user.email}, format='json')
        self.assertEqual(response.status_code, 200)
        return re.search(r'es: ([0-9]{6})', mail.outbox[-1].body).group(1)

    def verify(self, code, email=None):
        return self.client.post(VERIFY, {'email': email or self.user.email, 'code': code}, format='json')

    def token(self):
        response = self.verify(self.request_code())
        self.assertEqual(response.status_code, 200)
        return response.data['reset_token']

    def confirm(self, token, password=None, **extra):
        password = password or self.new_password
        return self.client.post(CONFIRM, {'email': self.user.email, 'reset_token': token,
                                         'new_password': password, 'confirm_password': password, **extra}, format='json')

    def allow_resend(self):
        PasswordResetChallenge.objects.filter(user=self.user).update(sent_at=timezone.now() - timedelta(seconds=61))

    def test_request_sends_code_in_text_and_html_without_exposing_it_in_api_or_database(self):
        with mock.patch('users.password_reset.secrets.randbelow', return_value=12345):
            response = self.client.post(REQUEST, {'email': ' LECTORA@Example.com '}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['expires_in'], 600)
        self.assertEqual(response.data['resend_after'], 60)
        self.assertNotIn('012345', str(response.data))
        self.assertEqual(mail.outbox[0].to, [self.user.email])
        self.assertIn('012345', mail.outbox[0].body)
        self.assertIn('012345', mail.outbox[0].alternatives[0].content)
        self.assertNotIn('/reset-password?', mail.outbox[0].body)
        challenge = PasswordResetChallenge.objects.get(user=self.user)
        self.assertNotEqual(challenge.code_digest, '012345')
        self.assertEqual(self.verify('012345').status_code, 200)

    def test_unknown_inactive_and_passwordless_accounts_receive_identical_response(self):
        known = self.client.post(REQUEST, {'email': self.user.email}, format='json')
        self.user.is_active = False
        self.user.save(update_fields=['is_active'])
        inactive = self.client.post(REQUEST, {'email': self.user.email}, format='json')
        unknown = self.client.post(REQUEST, {'email': 'nobody@example.com'}, format='json')
        self.user.is_active = True
        self.user.set_unusable_password()
        self.user.save(update_fields=['is_active', 'password'])
        passwordless = self.client.post(REQUEST, {'email': self.user.email}, format='json')
        self.assertEqual(known.data, unknown.data)
        self.assertEqual(known.data, inactive.data)
        self.assertEqual(known.data, passwordless.data)
        self.assertEqual(len(mail.outbox), 1)

    def test_invalid_email_and_code_shape_rejected(self):
        for email in ['', 'not-an-email', ['lectora@example.com']]:
            self.assertEqual(self.client.post(REQUEST, {'email': email}, format='json').status_code, 400)
        for code in ['12345', '1234567', 'abcdef', '１２３４５６']:
            self.assertEqual(self.verify(code).status_code, 400)

    def test_cooldown_does_not_send_again_or_invalidate_original_code(self):
        code = self.request_code()
        self.client.post(REQUEST, {'email': self.user.email}, format='json')
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(self.verify(code).status_code, 200)

    def test_resend_invalidates_old_code_and_existing_grant(self):
        with mock.patch('users.password_reset.secrets.randbelow', return_value=111111):
            old_code = self.request_code()
        old_token = self.verify(old_code).data['reset_token']
        self.allow_resend()
        with mock.patch('users.password_reset.secrets.randbelow', return_value=222222):
            new_code = self.request_code()
        self.assertEqual(self.verify(old_code).status_code, 400)
        self.assertEqual(self.confirm(old_token).status_code, 400)
        self.assertEqual(self.verify(new_code).status_code, 200)

    def test_account_request_limit_is_persisted(self):
        for _ in range(5):
            self.request_code()
            self.allow_resend()
        cache.clear()  # Un worker nuevo no debe reiniciar el límite por cuenta.
        self.client.post(REQUEST, {'email': self.user.email}, format='json')
        self.assertEqual(len(mail.outbox), 5)
        PasswordResetChallenge.objects.filter(user=self.user).update(request_window_start=timezone.now() - timedelta(hours=2))
        self.request_code()
        self.assertEqual(len(mail.outbox), 6)

    def test_ip_request_throttle(self):
        for _ in range(10):
            self.assertEqual(self.client.post(REQUEST, {'email': 'nobody@example.com'}, format='json').status_code, 200)
        self.assertEqual(self.client.post(REQUEST, {'email': 'nobody@example.com'}, format='json').status_code, 429)

    def test_wrong_attempts_persist_and_fifth_failure_locks_code(self):
        code = self.request_code()
        wrong = '999999' if code != '999999' else '888888'
        for attempt in range(1, 6):
            self.assertEqual(self.verify(wrong).status_code, 400)
            self.assertEqual(PasswordResetChallenge.objects.get(user=self.user).attempts, attempt)
        cache.clear()
        self.assertEqual(self.verify(code).status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_active)
        self.assertTrue(self.user.check_password(self.old_password))

    def test_expired_code_rejected(self):
        code = self.request_code()
        PasswordResetChallenge.objects.filter(user=self.user).update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.verify(code).status_code, 400)

    def test_code_is_bound_to_email(self):
        code = self.request_code()
        self.assertEqual(self.verify(code, email='different@example.com').status_code, 400)
        self.assertEqual(self.verify(code).status_code, 200)

    def test_code_can_only_be_verified_once(self):
        code = self.request_code()
        response = self.verify(code)
        self.assertEqual(response.status_code, 200)
        challenge = PasswordResetChallenge.objects.get(user=self.user)
        self.assertEqual(response['Cache-Control'], 'no-store')
        self.assertEqual(challenge.code_digest, '')
        self.assertNotEqual(challenge.reset_token_digest, response.data['reset_token'])
        self.assertEqual(self.verify(code).status_code, 400)

    def test_original_password_rejected_and_verification_remains_usable(self):
        token = self.token()
        response = self.confirm(token, self.old_password)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'PASSWORD_REUSED')
        self.assertEqual(self.confirm(token).status_code, 200)

    def test_weak_password_rejected(self):
        token = self.token()
        response = self.confirm(token, '12345678')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'PASSWORD_WEAK')
        self.assertTrue(response.data['details'])
        self.assertEqual(self.confirm(token).status_code, 200)

    def test_password_confirmation_must_match(self):
        token = self.token()
        response = self.confirm(token, confirm_password='DifferentPassword2026!')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'PASSWORD_MISMATCH')
        self.assertEqual(self.confirm(token).status_code, 200)

    def test_invalid_and_expired_reset_grants_rejected(self):
        token = self.token()
        self.assertEqual(self.confirm('made-up-token').status_code, 400)
        PasswordResetChallenge.objects.filter(user=self.user).update(verified_expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.confirm(token).status_code, 400)

    def test_verification_grant_has_its_own_expiry(self):
        token = self.token()
        PasswordResetChallenge.objects.filter(user=self.user).update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.confirm(token).status_code, 200)

    def test_cannot_reset_without_verification_or_with_legacy_link(self):
        code = self.request_code()
        self.assertEqual(self.confirm(code).status_code, 400)
        response = self.client.post(CONFIRM, {'uid': str(self.user.pk), 'token': 'old-link',
                                            'new_password': self.new_password}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_password_changed_elsewhere_invalidates_code_and_grant(self):
        code = self.request_code()
        token = self.verify(code).data['reset_token']
        self.user.set_password('ChangedElsewhere2026!')
        self.user.save(update_fields=['password'])
        self.assertEqual(self.confirm(token).status_code, 400)

    def test_email_changed_elsewhere_invalidates_grant(self):
        token = self.token()
        self.user.email = 'updated@example.com'
        self.user.save(update_fields=['email'])
        self.assertEqual(self.confirm(token, email=self.user.email).status_code, 400)

    def test_new_password_login_and_single_use(self):
        token = self.token()
        self.assertEqual(self.confirm(token).status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(self.new_password))
        self.assertEqual(self.confirm(token).status_code, 400)
        self.assertIn('se ha actualizado', mail.outbox[-1].body)
        self.assertNotIn(self.new_password, mail.outbox[-1].body)
        self.assertEqual(self.client.post(LOGIN, {'username': self.user.email, 'password': self.old_password}, format='json').status_code, 401)
        self.assertEqual(self.client.post(LOGIN, {'username': self.user.email, 'password': self.new_password}, format='json').status_code, 200)

    def test_existing_access_and_refresh_tokens_are_revoked(self):
        login = self.client.post(LOGIN, {'username': self.user.username, 'password': self.old_password}, format='json').data
        token = self.token()
        self.assertEqual(self.confirm(token).status_code, 200)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login['access']}")
        self.assertEqual(self.client.get('/api/v1/users/me/').status_code, 401)
        self.client.credentials()
        self.assertEqual(self.client.post(LOGIN + 'refresh/', {'refresh': login['refresh']}, format='json').status_code, 401)
        fresh_login = self.client.post(LOGIN, {'username': self.user.username, 'password': self.new_password}, format='json').data
        self.assertEqual(self.client.post(LOGIN + 'refresh/', {'refresh': fresh_login['refresh']}, format='json').status_code, 200)

    def test_recovery_ignores_expired_login_header(self):
        self.client.credentials(HTTP_AUTHORIZATION='Bearer expired-token')
        self.assertEqual(self.client.post(REQUEST, {'email': self.user.email}, format='json').status_code, 200)

    @override_settings(EMAIL_BACKEND='django.core.mail.backends.smtp.EmailBackend', EMAIL_HOST_PASSWORD='')
    def test_missing_mail_configuration_never_claims_code_was_sent(self):
        with self.assertLogs('users.views', level='ERROR'):
            known = self.client.post(REQUEST, {'email': self.user.email}, format='json')
            unknown = self.client.post(REQUEST, {'email': 'nobody@example.com'}, format='json')
        self.assertEqual(known.status_code, 503)
        self.assertEqual(unknown.status_code, 503)
        self.assertEqual(known.data, unknown.data)
        self.assertEqual(known.data['code'], 'EMAIL_UNAVAILABLE')
        self.assertFalse(PasswordResetChallenge.objects.filter(user=self.user).exists())
        self.assertEqual(len(mail.outbox), 0)

    def test_email_failure_invalidates_code_and_allows_retry(self):
        with mock.patch('users.password_reset.send_password_reset_code_email', side_effect=RuntimeError('provider offline')):
            with self.assertLogs('users.password_reset', level='ERROR'):
                response = self.client.post(REQUEST, {'email': self.user.email}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(PasswordResetChallenge.objects.get(user=self.user).code_digest, '')
        code = self.request_code()
        self.assertEqual(self.verify(code).status_code, 200)

    def test_notification_failure_does_not_undo_password_change(self):
        token = self.token()
        with mock.patch('users.password_reset.send_password_changed_email', side_effect=RuntimeError('provider offline')):
            with self.assertLogs('users.password_reset', level='ERROR'):
                self.assertEqual(self.confirm(token).status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(self.new_password))

    @override_settings(EMAIL_HOST_PASSWORD='re_this-is-not-a-real-key')
    def test_testing_mail_backend_never_calls_live_provider(self):
        with mock.patch('users.utils.urllib.request.urlopen') as provider:
            self.request_code()
        provider.assert_not_called()
