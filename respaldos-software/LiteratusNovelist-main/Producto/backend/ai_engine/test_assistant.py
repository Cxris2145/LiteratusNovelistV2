from django.test import TestCase
from rest_framework.test import APIClient
from users.models import User
from .models import AssistantConversation, AssistantMessage


class AssistantConversationDeleteTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='lector', email='lector@example.com', password='test')
        self.other = User.objects.create_user(username='otro', email='otro@example.com', password='test')
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def url(self, conversation):
        return f'/api/v1/ai/assistant/conversations/{conversation.pk}/'

    def test_owner_deletes_conversation_and_its_messages(self):
        conversation = AssistantConversation.objects.create(user=self.user)
        AssistantMessage.objects.create(conversation=conversation, role='assistant', content='Hola')
        AssistantMessage.objects.create(conversation=conversation, role='user', content='¿Cómo leo?')
        kept = AssistantConversation.objects.create(user=self.user)

        response = self.client.delete(self.url(conversation))

        self.assertEqual(response.status_code, 204)
        self.assertFalse(AssistantConversation.objects.filter(pk=conversation.pk).exists())
        self.assertFalse(AssistantMessage.objects.filter(conversation_id=conversation.pk).exists())
        self.assertTrue(AssistantConversation.objects.filter(pk=kept.pk).exists())
        # Borrado lógico: las filas siguen para auditoría, pero ya no salen en la API.
        self.assertEqual(AssistantMessage.all_objects.filter(conversation_id=conversation.pk).count(), 2)
        listed = [c['id'] for c in self.client.get('/api/v1/ai/assistant/conversations/').json()['results']]
        self.assertEqual(listed, [str(kept.pk)])
        self.assertEqual(self.client.get(f'{self.url(conversation)}messages/').status_code, 404)
        self.assertEqual(self.client.delete(self.url(conversation)).status_code, 404)

    def test_cannot_delete_someone_elses_conversation(self):
        foreign = AssistantConversation.objects.create(user=self.other)
        self.assertEqual(self.client.delete(self.url(foreign)).status_code, 404)
        self.assertTrue(AssistantConversation.objects.filter(pk=foreign.pk).exists())

    def test_anonymous_cannot_delete(self):
        conversation = AssistantConversation.objects.create(user=self.user)
        self.assertIn(APIClient().delete(self.url(conversation)).status_code, (401, 403))
        self.assertTrue(AssistantConversation.objects.filter(pk=conversation.pk).exists())
