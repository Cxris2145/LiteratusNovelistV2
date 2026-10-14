from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from catalog.models import Book, Chapter, Edition
from library.models import NotebookTab, UserHighlight, UserInventory, UserPostIt, UserVocabulary

User = get_user_model()

DOC = {'type': 'doc', 'content': [{'type': 'paragraph', 'content': [{'type': 'text', 'text': 'Hola'}]}]}


class NotebookAPITests(APITestCase):
    """Cuaderno flotante: pestañas propias, una por libro, guardado sin pisar otro dispositivo."""

    def setUp(self):
        self.user = User.objects.create_user(username='reader-one', email='one@example.com', password='x-pass-123')
        self.other_user = User.objects.create_user(username='reader-two', email='two@example.com', password='x-pass-123')
        self.book = Book.objects.create(title='Marianela', status=Book.StatusChoices.PUBLISHED, is_published=True)
        self.chapter = Chapter.objects.create(book=self.book, order=1, title='I',
                                              content_html='<p>Se puso el sol y la tarde quedó en calma.</p>')
        edition = Edition.objects.create(book=self.book, price=0)
        self.inventory = UserInventory.objects.create(user=self.user, edition=edition)
        self.foreign_inventory = UserInventory.objects.create(user=self.other_user, edition=edition)
        self.url = '/api/v1/library/notebook/'
        self.client.force_authenticate(self.user)

    def test_tabs_are_private_and_saving_needs_the_current_revision(self):
        foreign = NotebookTab.objects.create(user=self.other_user, title='Ajena')
        created = self.client.post(self.url, {'title': '  ', 'content': DOC}, format='json')
        tab_url = f"{self.url}{created.data['id']}/"

        saved = self.client.patch(tab_url, {'base_revision': 0, 'title': 'Ideas', 'content': DOC}, format='json')
        stale = self.client.patch(tab_url, {'base_revision': 0, 'title': 'Otra'}, format='json')
        listed = self.client.get(self.url)

        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertEqual(created.data['title'], 'Sin título')
        self.assertEqual(saved.data['revision'], 1)
        self.assertEqual(stale.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(stale.data['tab']['title'], 'Ideas')
        self.assertEqual([t['id'] for t in listed.data], [created.data['id']])
        self.assertNotIn('content', listed.data[0])
        self.assertEqual(self.client.get(f'{self.url}{foreign.pk}/').status_code, status.HTTP_404_NOT_FOUND)

    def test_one_tab_per_owned_book(self):
        first = self.client.post(f'{self.url}for-book/', {'inventory': str(self.inventory.pk)}, format='json')
        again = self.client.post(f'{self.url}for-book/', {'inventory': str(self.inventory.pk)}, format='json')
        foreign = self.client.post(f'{self.url}for-book/', {'inventory': str(self.foreign_inventory.pk)}, format='json')

        self.assertEqual(first.data['id'], again.data['id'])
        self.assertEqual(first.data['book_title'], 'Marianela')
        self.assertEqual(foreign.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(NotebookTab.objects.filter(user=self.user).count(), 1)

    def test_rejects_unsafe_links_and_malformed_drawings(self):
        tab = NotebookTab.objects.create(user=self.user, title='Notas')
        link = {'type': 'text', 'text': 'clic', 'marks': [
            {'type': 'link', 'attrs': {'href': 'javascript:alert(1)'}}, {'type': 'bold'}]}
        doc = {'type': 'doc', 'content': [{'type': 'paragraph', 'content': [link]}]}

        saved = self.client.patch(f'{self.url}{tab.pk}/', {'base_revision': 0, 'content': doc}, format='json')
        bad_drawing = self.client.patch(f'{self.url}{tab.pk}/', {
            'base_revision': 1, 'drawing': [{'c': 'red', 'w': 0.01, 'p': [[0.1, 0.1]]}]}, format='json')

        marks = saved.data['content']['content'][0]['content'][0]['marks']
        self.assertEqual(marks, [{'type': 'bold'}])
        self.assertEqual(bad_drawing.status_code, status.HTTP_400_BAD_REQUEST)

    def test_digest_collects_highlights_post_its_and_words(self):
        UserHighlight.objects.create(inventory=self.inventory, chapter=self.chapter, start_word=0, end_word=3,
                                     text='Se puso el sol', color='blue')
        UserPostIt.objects.create(inventory=self.inventory, chapter=self.chapter, word=5, text='Qué calma')
        UserPostIt.objects.create(inventory=self.foreign_inventory, chapter=self.chapter, word=1, text='Ajeno')
        UserVocabulary.objects.create(user=self.user, book=self.book, chapter=self.chapter, word='calma',
                                      definition='Paz, tranquilidad.')

        digest = self.client.get(f'/api/v1/library/inventory/{self.inventory.pk}/notebook-digest/').data

        self.assertEqual(digest['highlights'][0]['text'], 'Se puso el sol')
        self.assertEqual(digest['highlights'][0]['chapter_index'], 0)
        self.assertEqual([p['text'] for p in digest['post_its']], ['Qué calma'])
        self.assertIn('tarde', digest['post_its'][0]['context'])
        self.assertEqual(digest['words'][0]['definition'], 'Paz, tranquilidad.')
