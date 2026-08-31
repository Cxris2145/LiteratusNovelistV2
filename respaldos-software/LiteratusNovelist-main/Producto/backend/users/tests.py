from datetime import datetime, timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.test import override_settings
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import status
from rest_framework.test import APITestCase


User = get_user_model()


@override_settings(
    EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
    REQUIRE_EMAIL_VERIFICATION=False,
    PASSWORD_RESET_TIMEOUT=3600,
)
class UsersAPITests(APITestCase):
    password = 'StrongPassword123!'
    new_password = 'NewStrongPassword456!'

    def user_payload(self, suffix=''):
        return {
            'username': f'authtestuser{suffix}',
            'email': f'authtest{suffix}@example.com',
            'password': self.password,
            'first_name': 'Auth',
            'last_name': 'Test',
        }

    def create_user(self, suffix=''):
        payload = self.user_payload(suffix)
        return User.objects.create_user(**payload)

    def uid_for(self, user):
        return urlsafe_base64_encode(force_bytes(user.pk))

    def token_for(self, user):
        return default_token_generator.make_token(user)

    def login(self, identifier, password=None):
        return self.client.post(
            '/api/v1/users/login/',
            {'username': identifier, 'password': password or self.password},
            format='json',
        )

    def assert_has_tokens(self, response):
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)

    def test_register_success_creates_active_user(self):
        payload = self.user_payload('register')
        response = self.client.post('/api/v1/users/register/', payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertFalse(response.data['requires_email_verification'])
        self.assertNotIn('password', response.data)

        user = User.objects.get(username=payload['username'])
        self.assertTrue(user.is_active)

    def test_login_immediately_after_register_with_same_credentials(self):
        payload = self.user_payload('immediate')
        self.client.post('/api/v1/users/register/', payload, format='json')

        response = self.login(payload['username'], payload['password'])

        self.assert_has_tokens(response)

    def test_wrong_password_is_rejected(self):
        user = self.create_user('wrongpass')

        response = self.login(user.username, 'WrongPassword123!')

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertNotIn('access', response.data)
        self.assertEqual(response.data.get('detail'), 'La contraseña ingresada es incorrecta.')

    def test_nonexistent_email_is_rejected(self):
        response = self.login('missing@example.com', 'WrongPassword123!')

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertNotIn('access', response.data)
        self.assertEqual(response.data.get('detail'), 'No existe ninguna cuenta registrada con este usuario o correo.')

    def test_duplicate_email_registration_is_rejected_case_insensitive(self):
        self.create_user('dupe')
        payload = self.user_payload('dupe2')
        payload['email'] = ' AUTHTESTDUPE@example.com '

        response = self.client.post('/api/v1/users/register/', payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('email', response.data)

    def test_register_normalizes_email(self):
        payload = self.user_payload('normal')
        payload['email'] = ' AuthTestNormal@Example.COM '

        response = self.client.post('/api/v1/users/register/', payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(username=payload['username'])
        self.assertEqual(user.email, 'authtestnormal@example.com')

    def test_password_is_stored_as_hash(self):
        payload = self.user_payload('hash')
        self.client.post('/api/v1/users/register/', payload, format='json')

        user = User.objects.get(username=payload['username'])

        self.assertNotEqual(user.password, payload['password'])
        self.assertTrue(user.has_usable_password())

    def test_check_password_returns_true_for_registered_password(self):
        payload = self.user_payload('check')
        self.client.post('/api/v1/users/register/', payload, format='json')

        user = User.objects.get(username=payload['username'])

        self.assertTrue(user.check_password(payload['password']))

    def test_login_accepts_normalized_email_identifier(self):
        payload = self.user_payload('emailid')
        self.client.post('/api/v1/users/register/', payload, format='json')

        response = self.login(f' {payload["email"].upper()} ', payload['password'])

        self.assert_has_tokens(response)

    def test_request_password_reset_existing_email_sends_email(self):
        user = self.create_user('resetmail')

        response = self.client.post(
            '/api/v1/users/password-reset/',
            {'email': f' {user.email.upper()} '},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('/reset-password?uid=', mail.outbox[0].body)

    def test_request_password_reset_nonexistent_email_does_not_enumerate(self):
        response = self.client.post(
            '/api/v1/users/password-reset/',
            {'email': 'missing@example.com'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 0)
        self.assertEqual(
            response.data['message'],
            'Si existe una cuenta asociada a ese correo, recibirás instrucciones.',
        )

    def test_password_reset_token_valid(self):
        user = self.create_user('validtoken')

        response = self.client.post(
            '/api/v1/users/password-reset-validate/',
            {'uid': self.uid_for(user), 'token': self.token_for(user)},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_password_reset_token_invalid(self):
        user = self.create_user('badtoken')

        response = self.client.post(
            '/api/v1/users/password-reset-validate/',
            {'uid': self.uid_for(user), 'token': 'not-a-valid-token'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @override_settings(PASSWORD_RESET_TIMEOUT=1)
    def test_password_reset_token_expired(self):
        user = self.create_user('expired')
        now = datetime.now()

        with patch.object(default_token_generator, '_now', return_value=now):
            token = self.token_for(user)

        with patch.object(default_token_generator, '_now', return_value=now + timedelta(seconds=2)):
            response = self.client.post(
                '/api/v1/users/password-reset-validate/',
                {'uid': self.uid_for(user), 'token': token},
                format='json',
            )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_change_password_with_valid_reset_token(self):
        user = self.create_user('changepass')

        response = self.client.post(
            '/api/v1/users/password-reset-confirm/',
            {
                'uid': self.uid_for(user),
                'token': self.token_for(user),
                'new_password': self.new_password,
                'confirm_password': self.new_password,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        user.refresh_from_db()
        self.assertTrue(user.check_password(self.new_password))

    def test_old_password_stops_working_after_reset(self):
        user = self.create_user('oldstops')
        self.client.post(
            '/api/v1/users/password-reset-confirm/',
            {
                'uid': self.uid_for(user),
                'token': self.token_for(user),
                'new_password': self.new_password,
                'confirm_password': self.new_password,
            },
            format='json',
        )

        response = self.login(user.username, self.password)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_new_password_allows_login_after_reset(self):
        user = self.create_user('newlogin')
        self.client.post(
            '/api/v1/users/password-reset-confirm/',
            {
                'uid': self.uid_for(user),
                'token': self.token_for(user),
                'new_password': self.new_password,
                'confirm_password': self.new_password,
            },
            format='json',
        )

        response = self.login(user.email, self.new_password)

        self.assert_has_tokens(response)

    def test_protected_endpoint_works_after_new_login(self):
        user = self.create_user('protected')
        self.client.post(
            '/api/v1/users/password-reset-confirm/',
            {
                'uid': self.uid_for(user),
                'token': self.token_for(user),
                'new_password': self.new_password,
                'confirm_password': self.new_password,
            },
            format='json',
        )
        login_response = self.login(user.email, self.new_password)

        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {login_response.data["access"]}')
        response = self.client.get('/api/v1/users/me/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['email'], user.email)

    def test_logout_clear_credentials_and_new_login(self):
        user = self.create_user('logout')
        login_response = self.login(user.username)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {login_response.data["access"]}')

        authenticated_response = self.client.get('/api/v1/users/me/')
        self.client.credentials()
        logged_out_response = self.client.get('/api/v1/users/me/')
        second_login_response = self.login(user.username)

        self.assertEqual(authenticated_response.status_code, status.HTTP_200_OK)
        self.assertEqual(logged_out_response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assert_has_tokens(second_login_response)

    def test_public_register_cannot_escalate_role(self):
        payload = self.user_payload('role')
        payload['role'] = 'admin'

        response = self.client.post('/api/v1/users/register/', payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(username=payload['username'])
        self.assertEqual(user.role, User.RoleChoices.READER)

    def test_me_update_rejects_role_and_password_changes(self):
        user = self.create_user('metamper')
        login_response = self.login(user.username)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {login_response.data["access"]}')

        response = self.client.patch(
            '/api/v1/users/me/',
            {'role': 'admin', 'password': 'PlainTextPass123!'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        user.refresh_from_db()
        self.assertEqual(user.role, User.RoleChoices.READER)
        self.assertTrue(user.check_password(self.password))
