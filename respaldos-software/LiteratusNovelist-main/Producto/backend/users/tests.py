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
