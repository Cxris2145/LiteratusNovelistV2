from unittest import mock

from rest_framework.test import APITestCase
from rest_framework import status
from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.test import override_settings

User = get_user_model()

REGISTER_URL = '/api/v1/users/register/'
LOGIN_URL = '/api/v1/users/login/'


class RegistrationTests(APITestCase):
    """Alta de cuentas: verificación por correo, duplicados y mensajes de login."""

    payload = {'username': 'lectora', 'email': 'Lectora@Example.com', 'password': 'StrongPassword123!', 'birth_date': '2001-04-23'}

    def setUp(self):
        cache.clear()

    def test_register_creates_inactive_account_and_sends_link(self):
        response = self.client.post(REGISTER_URL, self.payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data['requires_verification'])
        user = User.objects.get(username='lectora')
        self.assertFalse(user.is_active)
        self.assertEqual(user.email, 'lectora@example.com')
        self.assertTrue(hasattr(user, 'profile'))
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('/verify-email?uid=', mail.outbox[0].body)

    @override_settings(DEBUG=False)
    def test_register_rolls_back_when_email_fails(self):
        with mock.patch('users.views.send_verification_email', side_effect=RuntimeError('smtp caído')):
            response = self.client.post(REGISTER_URL, self.payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertFalse(User.objects.filter(username='lectora').exists())
        # El usuario y el correo siguen libres para reintentar.
        response = self.client.post(REGISTER_URL, self.payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    @override_settings(DEBUG=True)
    def test_register_without_email_service_in_debug_activates_account(self):
        with mock.patch('users.views.email_is_configured', return_value=False):
            response = self.client.post(REGISTER_URL, self.payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertFalse(response.data['requires_verification'])
        login = self.client.post(LOGIN_URL, {'username': 'lectora', 'password': self.payload['password']}, format='json')
        self.assertEqual(login.status_code, status.HTTP_200_OK)

    def test_register_rejects_email_and_username_in_other_case(self):
        self.client.post(REGISTER_URL, self.payload, format='json')

        response = self.client.post(REGISTER_URL, {
            'username': 'LECTORA', 'email': 'LECTORA@example.com', 'password': 'StrongPassword123!',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('email', response.data)
        self.assertIn('username', response.data)

    def test_login_of_unverified_account_explains_why(self):
        self.client.post(REGISTER_URL, self.payload, format='json')

        right = self.client.post(LOGIN_URL, {'username': 'lectora', 'password': self.payload['password']}, format='json')
        wrong = self.client.post(LOGIN_URL, {'username': 'lectora', 'password': 'otraCosa123!'}, format='json')

        self.assertEqual(right.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(right.data['code'], 'account_not_verified')
        self.assertEqual(wrong.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertNotEqual(wrong.data.get('code'), 'account_not_verified')

    def test_login_with_email_in_any_case(self):
        User.objects.create_user(username='activa', email='activa@example.com', password='StrongPassword123!')

        response = self.client.post(LOGIN_URL, {'username': 'ACTIVA@example.com', 'password': 'StrongPassword123!'}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['user']['username'], 'activa')

    def test_resend_verification_only_for_unverified_accounts(self):
        self.client.post(REGISTER_URL, self.payload, format='json')
        User.objects.create_user(username='activa', email='activa@example.com', password='StrongPassword123!')
        mail.outbox.clear()

        for identifier in ({'username': 'lectora'}, {'email': 'activa@example.com'}, {'email': 'nadie@example.com'}):
            response = self.client.post('/api/v1/users/verify-email/resend/', identifier, format='json')
            self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ['lectora@example.com'])

    def test_profile_patch_cannot_change_outfit_or_friend_code(self):
        user = User.objects.create_user(username='vestida', email='vestida@example.com', password='StrongPassword123!')
        code = user.profile.friend_code
        self.client.force_authenticate(user)

        response = self.client.patch('/api/v1/users/profile/', {
            'outfit': {'head': 'crown'}, 'friend_code': 'AAAAAA', 'tagline': '  Lector   de mundos ',
        }, format='json')
        too_long = self.client.patch('/api/v1/users/profile/', {'tagline': 'x' * 81}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        user.profile.refresh_from_db()
        self.assertEqual(user.profile.outfit, {})
        self.assertEqual(user.profile.friend_code, code)
        self.assertEqual(user.profile.tagline, 'Lector de mundos')
        self.assertEqual(too_long.status_code, status.HTTP_400_BAD_REQUEST)

    def test_register_saves_birth_date_and_rejects_future_dates(self):
        response = self.client.post(REGISTER_URL, {**self.payload, 'birth_date': '2001-04-23'}, format='json')
        future = self.client.post(REGISTER_URL, {
            'username': 'futura', 'email': 'futura@example.com', 'password': 'StrongPassword123!',
            'birth_date': '2999-01-01',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(str(User.objects.get(username='lectora').profile.birth_date), '2001-04-23')
        self.assertEqual(future.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('birth_date', future.data)

    def test_registration_requires_a_valid_birth_date(self):
        without_date = {k: v for k, v in self.payload.items() if k != 'birth_date'}
        for value in ('missing', None, '', 'not-a-date', '2008-02-30', '1800-01-01'):
            with self.subTest(value=value):
                payload = without_date if value == 'missing' else {**without_date, 'birth_date': value}
                response = self.client.post(REGISTER_URL, payload, format='json')
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn('birth_date', response.data)
                self.assertFalse(User.objects.filter(username=self.payload['username']).exists())

    def test_minor_can_register_and_birth_date_cannot_be_changed(self):
        with mock.patch('users.views.send_verification_email'):
            response = self.client.post(REGISTER_URL, {**self.payload, 'birth_date': '2012-04-23'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(username=self.payload['username'])
        self.assertEqual(str(user.profile.birth_date), '2012-04-23')
        self.client.force_authenticate(user)
        changed = self.client.patch('/api/v1/users/profile/', {'birth_date': '1980-01-01'}, format='json')
        self.assertEqual(changed.status_code, status.HTTP_400_BAD_REQUEST)

    def test_birth_date_can_only_be_set_once(self):
        user = User.objects.create_user(username='antigua', email='antigua@example.com', password='StrongPassword123!')
        self.client.force_authenticate(user)
        url = '/api/v1/users/profile/'

        first = self.client.patch(url, {'birth_date': '1999-12-31'}, format='json')
        change = self.client.patch(url, {'birth_date': '1980-01-01'}, format='json')
        erase = self.client.patch(url, {'birth_date': None}, format='json')
        same = self.client.patch(url, {'birth_date': '1999-12-31', 'bio': 'Sigo aquí'}, format='json')
        # Usuario recién leído, como en una petición real: la señal post_save de User
        # vuelve a guardar user.profile, y el objeto de arriba tiene el perfil en caché.
        self.client.force_authenticate(User.objects.get(pk=user.pk))
        via_me = self.client.patch('/api/v1/users/me/', {'birth_date': '1980-01-01'}, format='json')

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(change.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('birth_date', change.data)
        self.assertEqual(erase.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(same.status_code, status.HTTP_200_OK)
        self.assertEqual(via_me.status_code, status.HTTP_200_OK)
        user.profile.refresh_from_db()
        self.assertEqual(str(user.profile.birth_date), '1999-12-31')
        self.assertEqual(user.profile.bio, 'Sigo aquí')

    def test_each_new_account_starts_with_its_own_profile(self):
        first = User.objects.create_user(username='uno', email='uno@example.com', password='StrongPassword123!')
        first.profile.bio = 'Bio de la primera cuenta'
        first.profile.save()
        User.objects.create_user(username='dos', email='dos@example.com', password='StrongPassword123!')

        token = self.client.post(LOGIN_URL, {'username': 'dos', 'password': 'StrongPassword123!'}, format='json').data['access']
        self.client.credentials(HTTP_AUTHORIZATION='Bearer ' + token)
        response = self.client.get('/api/v1/users/profile/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['bio'], '')
        self.assertNotEqual(response.data['id'], str(first.profile.id))

class UsersAPITests(APITestCase):
    def setUp(self):
        # Crear usuario para pruebas
        self.user_data = {
            'username': 'authtestuser',
            'email': 'authuser@example.com',
            'password': 'StrongPassword123!',
            'first_name': 'Auth',
            'last_name': 'Test'
        }
        self.user = User.objects.create_user(**self.user_data)

    def test_login_success(self):
        """
        Verifica que un usuario pueda hacer login y recibir un token JWT.
        """
        response = self.client.post('/api/v1/users/login/', {
            'username': self.user_data['username'],
            'password': self.user_data['password']
        }, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)

    def test_login_invalid_credentials(self):
        """
        Verifica que credenciales inválidas retornen un error.
        """
        response = self.client.post('/api/v1/users/login/', {
            'username': self.user_data['username'],
            'password': 'wrongpassword'
        }, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertNotIn('access', response.data)

    def test_get_me_authenticated(self):
        """
        Verifica que el usuario pueda obtener su perfil con un token válido.
        """
        # Obtenemos token
        login_resp = self.client.post('/api/v1/users/login/', {
            'username': self.user_data['username'],
            'password': self.user_data['password']
        }, format='json')
        token = login_resp.data['access']
        
        # Consultamos /me/
        self.client.credentials(HTTP_AUTHORIZATION='Bearer ' + token)
        response = self.client.get('/api/v1/users/me/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['email'], self.user_data['email'])

    def test_get_me_unauthenticated(self):
        """
        Verifica que sin token, no se pueda acceder al perfil (/me/).
        """
        response = self.client.get('/api/v1/users/me/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_register_weak_password_rejected(self):
        """
        Verifica que contraseñas débiles sean rechazadas en el registro.
        """
        response = self.client.post('/api/v1/users/register/', {
            'username': 'newuser',
            'email': 'newuser@example.com',
            'password': '123', 'birth_date': '2001-04-23'
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('password', response.data)

    def test_update_me_password_hashing(self):
        """
        Verifica que actualizar la contraseña en /users/me/ la almacene hasheada y no en texto plano.
        """
        login_resp = self.client.post('/api/v1/users/login/', {
            'username': self.user_data['username'],
            'password': self.user_data['password']
        }, format='json')
        token = login_resp.data['access']
        self.client.credentials(HTTP_AUTHORIZATION='Bearer ' + token)

        new_password = 'NewStrongPassword2026!'
        response = self.client.patch('/api/v1/users/me/', {'password': new_password}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(new_password))
        self.assertNotEqual(self.user.password, new_password)

    def test_update_me_role_escalation_blocked(self):
        """
        Verifica que un usuario no pueda auto-escalar su rol a administrador en /users/me/.
        """
        login_resp = self.client.post('/api/v1/users/login/', {
            'username': self.user_data['username'],
            'password': self.user_data['password']
        }, format='json')
        token = login_resp.data['access']
        self.client.credentials(HTTP_AUTHORIZATION='Bearer ' + token)

        response = self.client.patch('/api/v1/users/me/', {'role': 'admin', 'first_name': 'Hacker'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.user.refresh_from_db()
        self.assertNotEqual(self.user.role, 'admin')
        self.assertEqual(self.user.first_name, 'Hacker')

