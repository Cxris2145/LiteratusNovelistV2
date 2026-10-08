from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

import json

from catalog.models import Book, Chapter, Edition
from library.models import UserBookmark, UserFavorite, UserHighlight, UserInventory, UserPostIt


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


class UserBookmarkAPITests(APITestCase):
    """Marcadores de página del lector: GET ?inventory=<id>, POST y DELETE."""

    def setUp(self):
        self.user = User.objects.create_user(username='reader-one', email='one@example.com', password='x-pass-123')
        self.other_user = User.objects.create_user(username='reader-two', email='two@example.com', password='x-pass-123')
        book = Book.objects.create(title='Marianela', status=Book.StatusChoices.PUBLISHED, is_published=True)
        other_book = Book.objects.create(title='María', status=Book.StatusChoices.PUBLISHED, is_published=True)
        self.inventory = UserInventory.objects.create(user=self.user, edition=Edition.objects.create(book=book, price=0))
        self.second_inventory = UserInventory.objects.create(
            user=self.user, edition=Edition.objects.create(book=other_book, price=0))
        self.foreign_inventory = UserInventory.objects.create(user=self.other_user, edition=self.inventory.edition)
        self.url = '/api/v1/library/bookmarks/'
        self.position = json.dumps({'v': 1, 'cid': 'c1', 'ch': 0, 'w': 120})

    def test_lists_only_the_bookmarks_of_one_book_without_pagination(self):
        UserBookmark.objects.create(inventory=self.inventory, position_cfi=self.position)
        UserBookmark.objects.create(inventory=self.second_inventory, position_cfi=self.position)
        UserBookmark.objects.create(inventory=self.foreign_inventory, position_cfi=self.position)
        self.client.force_authenticate(self.user)

        response = self.client.get(self.url, {'inventory': str(self.inventory.pk)})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([b['inventory'] for b in response.data], [self.inventory.pk])

        self.assertEqual(len(self.client.get(self.url).data), 2)  # sin filtro: todos los del usuario
        self.assertEqual(self.client.get(self.url, {'inventory': 'no-es-un-uuid'}).data, [])

    def test_create_and_delete_a_page_bookmark(self):
        self.client.force_authenticate(self.user)
        created = self.client.post(self.url, {
            'inventory': str(self.inventory.pk), 'position_cfi': self.position,
            'note': 'Se puso el sol...', 'color': '#b3261e',
        }, format='json')
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)

        deleted = self.client.delete(f"{self.url}{created.data['id']}/")
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(UserBookmark.objects.filter(pk=created.data['id']).exists())

    def test_cannot_add_or_move_bookmarks_into_someone_elses_library(self):
        self.client.force_authenticate(self.user)
        created = self.client.post(self.url, {
            'inventory': str(self.foreign_inventory.pk), 'position_cfi': self.position,
        }, format='json')
        self.assertEqual(created.status_code, status.HTTP_403_FORBIDDEN)

        bookmark = UserBookmark.objects.create(inventory=self.inventory, position_cfi=self.position)
        moved = self.client.patch(f'{self.url}{bookmark.pk}/', {'inventory': str(self.foreign_inventory.pk)}, format='json')
        self.assertEqual(moved.status_code, status.HTTP_403_FORBIDDEN)
        bookmark.refresh_from_db()
        self.assertEqual(bookmark.inventory_id, self.inventory.pk)


class UserHighlightAPITests(APITestCase):
    """Subrayados del lector: GET ?inventory=<id>, POST, PATCH (color) y DELETE."""

    def setUp(self):
        self.user = User.objects.create_user(username='reader-one', email='one@example.com', password='x-pass-123')
        self.other_user = User.objects.create_user(username='reader-two', email='two@example.com', password='x-pass-123')
        book = Book.objects.create(title='Marianela', status=Book.StatusChoices.PUBLISHED, is_published=True)
        other_book = Book.objects.create(title='María', status=Book.StatusChoices.PUBLISHED, is_published=True)
        self.chapter = Chapter.objects.create(book=book, order=1, title='I', content_html='<p>Se puso el sol.</p>')
        self.other_chapter = Chapter.objects.create(book=other_book, order=1, content_html='<p>Era yo niño.</p>')
        self.inventory = UserInventory.objects.create(user=self.user, edition=Edition.objects.create(book=book, price=0))
        self.foreign_inventory = UserInventory.objects.create(user=self.other_user, edition=self.inventory.edition)
        self.url = '/api/v1/library/highlights/'
        self.client.force_authenticate(self.user)

    def payload(self, **changes):
        data = {'inventory': str(self.inventory.pk), 'chapter': str(self.chapter.pk),
                'start_word': 0, 'end_word': 3, 'text': '  Se puso\n el sol. ', 'color': 'blue'}
        data.update(changes)
        return data

    def highlight(self, inventory=None):
        return UserHighlight.objects.create(inventory=inventory or self.inventory, chapter=self.chapter,
                                            start_word=0, end_word=1, text='Se puso')

    def test_create_list_recolor_and_delete(self):
        created = self.client.post(self.url, self.payload(), format='json')
        self.highlight(inventory=self.foreign_inventory)

        listed = self.client.get(self.url, {'inventory': str(self.inventory.pk)})
        recolored = self.client.patch(f"{self.url}{created.data['id']}/",
                                      {'color': 'pink', 'start_word': 2}, format='json')
        deleted = self.client.delete(f"{self.url}{created.data['id']}/")

        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertEqual(created.data['text'], 'Se puso el sol.')
        self.assertNotIn('note', created.data)
        self.assertEqual([h['id'] for h in listed.data], [created.data['id']])
        self.assertEqual(recolored.status_code, status.HTTP_200_OK)
        self.assertEqual(recolored.data['color'], 'pink')
        self.assertEqual(recolored.data['start_word'], 0)  # el pasaje no se mueve después de creado
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(UserHighlight.objects.filter(pk=created.data['id']).exists())

    def test_rejects_other_books_chapters_bad_ranges_and_unknown_colors(self):
        for bad in ({'chapter': str(self.other_chapter.pk)}, {'start_word': 5, 'end_word': 2},
                    {'end_word': UserHighlight.MAX_WORDS}, {'color': 'red'}, {'text': '   '}):
            response = self.client.post(self.url, self.payload(**bad), format='json')
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, bad)
        self.assertFalse(UserHighlight.objects.exists())

    def test_cannot_highlight_or_edit_in_someone_elses_library(self):
        foreign = self.highlight(inventory=self.foreign_inventory)

        created = self.client.post(self.url, self.payload(inventory=str(self.foreign_inventory.pk)), format='json')
        edited = self.client.patch(f'{self.url}{foreign.pk}/', {'color': 'pink'}, format='json')

        self.assertEqual(created.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(edited.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(UserHighlight.objects.filter(inventory=self.foreign_inventory).count(), 1)


class UserPostItAPITests(APITestCase):
    """Post-its del lector (botón "Post-it"): pegar en una palabra, editar el texto, despegar; máx. 30 por libro."""

    def setUp(self):
        self.user = User.objects.create_user(username='reader-one', email='one@example.com', password='x-pass-123')
        self.other_user = User.objects.create_user(username='reader-two', email='two@example.com', password='x-pass-123')
        book = Book.objects.create(title='Marianela', status=Book.StatusChoices.PUBLISHED, is_published=True)
        other_book = Book.objects.create(title='María', status=Book.StatusChoices.PUBLISHED, is_published=True)
        self.chapter = Chapter.objects.create(book=book, order=1, title='I', content_html='<p>Se puso el sol.</p>')
        self.other_chapter = Chapter.objects.create(book=other_book, order=1, content_html='<p>Era yo niño.</p>')
        self.inventory = UserInventory.objects.create(user=self.user, edition=Edition.objects.create(book=book, price=0))
        self.foreign_inventory = UserInventory.objects.create(user=self.other_user, edition=self.inventory.edition)
        self.url = '/api/v1/library/postits/'
        self.client.force_authenticate(self.user)

    def payload(self, **changes):
        data = {'inventory': str(self.inventory.pk), 'chapter': str(self.chapter.pk), 'word': 3,
                'text': '  Qué atardecer  '}
        data.update(changes)
        return data

    def post_it(self, inventory=None, text='Nota'):
        return UserPostIt.objects.create(inventory=inventory or self.inventory, chapter=self.chapter, word=1, text=text)

    def test_stick_list_edit_and_peel_off(self):
        created = self.client.post(self.url, self.payload(), format='json')
        self.post_it(inventory=self.foreign_inventory)

        listed = self.client.get(self.url, {'inventory': str(self.inventory.pk)})
        edited = self.client.patch(f"{self.url}{created.data['id']}/", {'text': 'Reescrita'}, format='json')
        moved = self.client.patch(f"{self.url}{created.data['id']}/",
                                  {'word': 9, 'chapter': str(self.other_chapter.pk)}, format='json')
        emptied = self.client.patch(f"{self.url}{created.data['id']}/", {'text': '   '}, format='json')
        peeled = self.client.delete(f"{self.url}{created.data['id']}/")

        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertEqual((created.data['text'], created.data['word']), ('Qué atardecer', 3))
        self.assertEqual([p['id'] for p in listed.data], [created.data['id']])
        self.assertEqual(edited.data['text'], 'Reescrita')
        # Arrastrarlo cambia la palabra; el capítulo no se mueve.
        self.assertEqual((moved.data['word'], moved.data['chapter']), (9, self.chapter.pk))
        self.assertEqual(emptied.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(peeled.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(UserPostIt.objects.filter(pk=created.data['id']).exists())

    def test_rejects_other_books_chapters_empty_or_long_text_and_foreign_libraries(self):
        for bad in ({'chapter': str(self.other_chapter.pk)}, {'text': '  '}, {'text': 'x' * 501}):
            self.assertEqual(self.client.post(self.url, self.payload(**bad), format='json').status_code,
                             status.HTTP_400_BAD_REQUEST, bad)
        foreign = self.client.post(self.url, self.payload(inventory=str(self.foreign_inventory.pk)), format='json')
        self.assertEqual(foreign.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(UserPostIt.objects.exists())

    def test_thirty_per_book(self):
        stuck = [self.post_it(text=f'Nota {n}') for n in range(UserPostIt.MAX_PER_BOOK)]
        self.post_it(inventory=self.foreign_inventory, text='No cuenta: es de otra persona')

        one_more = self.client.post(self.url, self.payload(), format='json')
        edit = self.client.patch(f'{self.url}{stuck[0].pk}/', {'text': 'Reescrita'}, format='json')
        self.client.delete(f'{self.url}{stuck[1].pk}/')
        after_peeling_one = self.client.post(self.url, self.payload(), format='json')

        self.assertEqual(one_more.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('30 post-its', str(one_more.data))
        self.assertEqual(edit.status_code, status.HTTP_200_OK)
        self.assertEqual(after_peeling_one.status_code, status.HTTP_201_CREATED)
