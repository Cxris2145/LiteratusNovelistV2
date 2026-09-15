from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from catalog.models import Book
from library.models import UserFavorite


User = get_user_model()


class UserFavoriteAPITests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='reader-one',
            email='reader-one@example.com',
            password='test-password-123',
        )
        self.other_user = User.objects.create_user(
            username='reader-two',
            email='reader-two@example.com',
            password='test-password-123',
        )
        self.book = Book.objects.create(
            title='La obra favorita',
            status=Book.StatusChoices.PUBLISHED,
            is_published=True,
        )
        self.url = '/api/v1/library/favorites/'

    def test_authentication_is_required(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_favorites_are_isolated_by_user(self):
        UserFavorite.objects.create(user=self.user, book=self.book)

        self.client.force_authenticate(self.other_user)
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])

    def test_create_list_remove_and_restore_favorite(self):
        self.client.force_authenticate(self.user)

        created = self.client.post(self.url, {'book_id': str(self.book.id)}, format='json')
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertEqual(created.data['book']['id'], str(self.book.id))

        duplicate = self.client.post(self.url, {'book_id': str(self.book.id)}, format='json')
        self.assertEqual(duplicate.status_code, status.HTTP_201_CREATED)
        self.assertEqual(UserFavorite.objects.filter(user=self.user, book=self.book).count(), 1)

        listed = self.client.get(self.url)
        self.assertEqual(len(listed.data), 1)

        removed = self.client.delete(f'{self.url}book/{self.book.id}/')
        self.assertEqual(removed.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(UserFavorite.objects.filter(user=self.user, book=self.book).exists())

        restored = self.client.post(self.url, {'book_id': str(self.book.id)}, format='json')
        self.assertEqual(restored.status_code, status.HTTP_201_CREATED)
        self.assertEqual(UserFavorite.objects.filter(user=self.user, book=self.book).count(), 1)

    def test_clear_only_removes_current_users_favorites(self):
        UserFavorite.objects.create(user=self.user, book=self.book)
        UserFavorite.objects.create(user=self.other_user, book=self.book)
        self.client.force_authenticate(self.user)

        response = self.client.delete(f'{self.url}clear/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(UserFavorite.objects.filter(user=self.user).exists())
        self.assertTrue(UserFavorite.objects.filter(user=self.other_user).exists())
