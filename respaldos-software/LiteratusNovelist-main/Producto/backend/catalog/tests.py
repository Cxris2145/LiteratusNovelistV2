from rest_framework.test import APITestCase
from rest_framework import status
from django.contrib.auth import get_user_model
from catalog.models import Book, Author

User = get_user_model()

class CatalogAPITests(APITestCase):
    def setUp(self):
        # Crear usuario para las pruebas
        self.user = User.objects.create_user(
            username='testuser_catalog',
            email='testuser@example.com',
            password='testpassword123',
            first_name='Test',
            last_name='User'
        )
        
        # Crear un autor y un libro de prueba
        self.author = Author.objects.create(full_name='Gabriel Garcia Marquez')
        self.book = Book.objects.create(
            title='Cien Anos de Soledad',
            synopsis='Una historia epica.',
            status=Book.StatusChoices.PUBLISHED,
            is_published=True
        )

    def test_get_books_list_unauthenticated(self):
        """
        Prueba que un usuario no autenticado pueda ver la lista de libros publicados.
        (El permiso por defecto en settings es IsAuthenticatedOrReadOnly).
        """
        response = self.client.get('/api/v1/catalog/books/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Verificamos que el libro devuelto sea el que creamos (puede haber paginación)
        self.assertIn('results', response.data)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['title'], 'Cien Anos de Soledad')

    def test_create_book_unauthenticated(self):
        """
        Prueba que un usuario no autenticado NO pueda crear un libro.
        Debe devolver 401 Unauthorized.
        """
        data = {
            'title': 'El amor en los tiempos del colera',
            'synopsis': 'Otra historia epica.'
        }
        response = self.client.post('/api/v1/catalog/books/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_search_books(self):
        """
        Prueba el filtro de búsqueda por título de libro.
        """
        response = self.client.get('/api/v1/catalog/books/?search=Cien')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        
        # Búsqueda que no coincide
        response_empty = self.client.get('/api/v1/catalog/books/?search=Inexistente')
        self.assertEqual(response_empty.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response_empty.data['results']), 0)
