from rest_framework.test import APITestCase
from rest_framework import status
from django.contrib.auth import get_user_model

User = get_user_model()

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
            'password': '123'
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

