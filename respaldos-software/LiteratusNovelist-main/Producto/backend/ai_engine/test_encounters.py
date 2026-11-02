import uuid
from datetime import timedelta
from unittest.mock import patch
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from users.models import User, Profile
from catalog.models import Book, Edition
from finance.models import UserSubscription
from .models import AIAvatar, ChatSession, ChatMessage, AIUsageEvent
from .encounter_service import EncounterAIService, clean_reply
from . import usage

GENERATE = 'ai_engine.metered_service.MeteredAIService.generate_metered'


@override_settings(GOOGLE_API_KEY='test-key', GOOGLE_API_KEY_2='', DEEPSEEK_API_KEY='')
class EncounterTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='lector', email='lector@example.com', password='test')
        Profile.objects.filter(user=self.user).update(ink_balance=20)
        self.book = Book.objects.create(title='La isla')
        self.other_book = Book.objects.create(title='El faro')
        edition = Edition.objects.create(book=self.book, price=0)
        other_edition = Edition.objects.create(book=self.other_book, price=0)
        self.alicia = AIAvatar.objects.create(edition=edition, name='Alicia', system_prompt='Eres curiosa.', is_major_character=True)
        self.bruno = AIAvatar.objects.create(edition=other_edition, name='Bruno', system_prompt='Eres serio.', is_major_character=True)
        self.secundario = AIAvatar.objects.create(edition=other_edition, name='Carla', system_prompt='Eres secundaria.', is_major_character=False)
        UserSubscription.objects.create(user=self.user, plan_id='aprendiz', status='ACTIVE', paid_until=timezone.now() + timedelta(days=30))
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def result(self, text='Una respuesta válida.', tokens=100):
        return {'text': text, 'provider': 'gemini', 'model': 'test', 'input_tokens': tokens - 10, 'output_tokens': 10,
            'reasoning_tokens': 0, 'total_tokens': tokens, 'attempts': [{'estimated_cost': '0.0001'}]}

    def create(self, *avatars, **extra):
        ids = [str(a.pk) for a in (avatars or (self.alicia, self.bruno))]
        return self.client.post('/api/v1/ai/encounters/', {'avatar_ids': ids, **extra}, format='json')

    def turn(self, encounter_id, speaker, message='', request_id=None, mode='plan'):
        return self.client.post('/api/v1/ai/chat/', {'session_id': encounter_id, 'speaker_id': str(speaker.pk),
            'message': message, 'request_id': str(request_id or uuid.uuid4()), 'payment_mode': mode}, format='json')

    def test_create_reuses_the_pair_in_any_order_and_fresh_starts_over(self):
        first = self.create(topic='El mar')
        self.assertEqual(first.status_code, 201)
        self.assertEqual([p['name'] for p in first.data['participants']], ['Alicia', 'Bruno'])
        self.assertEqual(first.data['topic'], 'El mar')
        again = self.create(self.bruno, self.alicia)
        self.assertEqual(again.status_code, 200)
        self.assertEqual(again.data['id'], first.data['id'])
        fresh = self.create(fresh=True)
        self.assertEqual(fresh.status_code, 201)
        self.assertNotEqual(fresh.data['id'], first.data['id'])
        self.alicia.refresh_from_db()
        self.assertEqual(self.alicia.chat_count, 2)

    def test_rejects_the_same_character_twice(self):
        self.assertEqual(self.create(self.alicia, self.alicia).status_code, 400)
        homonimo = AIAvatar.objects.create(edition=self.bruno.edition, name='ALÍCIA', system_prompt='x', is_major_character=True)
        self.assertEqual(self.create(self.alicia, homonimo).status_code, 400)

    def test_minor_character_needs_the_book(self):
        response = self.create(self.alicia, self.secundario)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data['book_slug'], self.other_book.slug)
        self.assertIn('El faro', response.data['message'])

    @patch('library.achievement_engine.reward_activity')
    @patch(GENERATE)
    def test_turns_save_the_speaker_and_continuations_skip_the_reader_line(self, generate, reward):
        encounter = self.create().data['id']
        generate.return_value = self.result('Alicia: ¡Hola, Bruno!\nBruno: Hola.')
        first = self.turn(encounter, self.alicia, 'Preséntense')
        self.assertEqual(first.status_code, 200, first.data)
        self.assertEqual(first.data['speaker_id'], str(self.alicia.pk))
        # Sin el nombre al inicio y sin la línea que el modelo inventó para Bruno.
        self.assertEqual(first.data['reply'], '¡Hola, Bruno!')
        generate.return_value = self.result('Encantado.')
        second = self.turn(encounter, self.bruno)
        self.assertEqual(second.status_code, 200, second.data)
        lines = list(ChatMessage.objects.filter(session_id=encounter).order_by('created_at').values_list('role', 'speaker_id', 'content'))
        self.assertEqual(lines, [('user', None, 'Preséntense'), ('assistant', self.alicia.pk, '¡Hola, Bruno!'),
            ('assistant', self.bruno.pk, 'Encantado.')])
        # Solo el turno que escribió el lector da experiencia (los logros pueden premiar aparte).
        self.assertEqual([c.args[1] for c in reward.call_args_list].count('ai_interaction'), 1)
        self.assertEqual(usage.snapshot(self.user)['tokens_used'], 200)
        detail = self.client.get(f'/api/v1/ai/encounters/{encounter}/')
        self.assertEqual([m['speaker_id'] for m in detail.data['messages']], [None, str(self.alicia.pk), str(self.bruno.pk)])

    @patch(GENERATE)
    def test_retrying_the_same_request_does_not_charge_twice(self, generate):
        generate.return_value = self.result()
        encounter = self.create().data['id']
        request_id = uuid.uuid4()
        self.assertEqual(self.turn(encounter, self.alicia, 'Hola', request_id).status_code, 200)
        replay = self.turn(encounter, self.alicia, 'Hola', request_id)
        self.assertEqual(replay.status_code, 200)
        self.assertEqual(generate.call_count, 1)
        self.assertEqual(AIUsageEvent.objects.count(), 1)
        self.assertEqual(usage.snapshot(self.user)['tokens_used'], 100)

    def test_speaker_must_be_in_the_encounter_and_ink_is_not_offered(self):
        encounter = self.create().data['id']
        self.assertEqual(self.turn(encounter, self.secundario, 'Hola').data['error'], 'INVALID_SPEAKER')
        self.assertEqual(self.turn(encounter, self.alicia, 'Hola', mode='ink').data['error'], 'ENCOUNTER_NO_INK')
        session = ChatSession.objects.get(pk=encounter)
        with self.assertRaises(usage.UsageDenied):
            usage.quote(self.user, session, 'Hola')

    def test_single_chat_still_needs_a_message(self):
        session = ChatSession.objects.create(user=self.user, avatar=self.alicia)
        response = self.client.post('/api/v1/ai/chat/', {'session_id': str(session.pk), 'message': '  ',
            'request_id': str(uuid.uuid4())}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_prompt_shows_the_other_character_and_ends_with_a_cue(self):
        session = ChatSession.objects.create(user=self.user, avatar=self.alicia, partner=self.bruno,
            kind=ChatSession.Kind.ENCOUNTER, topic='El mar')
        ChatMessage.objects.create(session=session, role='user', content='Hola a los dos')
        ChatMessage.objects.create(session=session, role='assistant', content='Hola, soy Alicia.', speaker=self.alicia)
        ChatMessage.objects.create(session=session, role='assistant', content='Bruno, para servirle.', speaker=self.bruno)
        service = EncounterAIService(self.alicia, self.bruno, session)
        service.prepare('')
        system, *turns = service.messages
        self.assertTrue(system['content'].startswith('Eres Alicia.'))
        self.assertIn('Bruno, que viene de «El faro»', system['content'])
        self.assertIn('no se conocen', system['content'])
        self.assertIn('Tema del encuentro: El mar', system['content'])
        self.assertEqual([t['role'] for t in turns], ['user', 'assistant', 'user'])
        self.assertEqual(turns[0]['content'], 'lector: Hola a los dos')
        self.assertEqual(turns[2]['content'], 'Bruno: Bruno, para servirle.\n\n(Ahora habla Alicia.)')

    def test_prompt_merges_turns_and_starts_with_the_reader(self):
        session = ChatSession.objects.create(user=self.user, avatar=self.alicia, partner=self.bruno, kind=ChatSession.Kind.ENCOUNTER)
        ChatMessage.objects.create(session=session, role='assistant', content='Empiezo yo.', speaker=self.bruno)
        service = EncounterAIService(self.bruno, self.alicia, session)
        service.prepare('¿Y tú, Bruno?')
        roles = [m['role'] for m in service.messages[1:]]
        self.assertEqual(roles, ['user', 'assistant', 'user'])
        self.assertEqual(service.messages[-1]['content'], 'lector: ¿Y tú, Bruno?\n\n(Ahora habla Bruno.)')

    def test_same_book_characters_know_each_other(self):
        companero = AIAvatar.objects.create(edition=self.alicia.edition, name='Dora', system_prompt='x', is_major_character=True)
        session = ChatSession.objects.create(user=self.user, avatar=self.alicia, partner=companero, kind=ChatSession.Kind.ENCOUNTER)
        service = EncounterAIService(companero, self.alicia, session)
        service.prepare('Hola')
        self.assertIn('de tu misma historia («La isla»)', service.messages[0]['content'])
        self.assertIn('se conocen según la historia', service.messages[0]['content'])

    def test_clean_reply(self):
        self.assertEqual(clean_reply('**Alicia:** Hola', 'Alicia', ['Bruno']), 'Hola')
        self.assertEqual(clean_reply('Hola.\n\nBruno: yo también', 'Alicia', ['Bruno']), 'Hola.')
        self.assertEqual(clean_reply('Te diré, Bruno: no.', 'Alicia', ['Bruno']), 'Te diré, Bruno: no.')

    def test_single_chat_session_is_not_confused_with_an_encounter(self):
        encounter = self.create().data['id']
        response = self.client.get(f'/api/v1/ai/sessions/?avatar_id={self.alicia.pk}')
        self.assertEqual(response.status_code, 200)
        self.assertNotEqual(response.data['id'], encounter)
        recent = self.client.get('/api/v1/ai/hub/recent/')
        self.assertEqual(recent.status_code, 200)

    def test_conversations_and_parental_history_name_both_characters(self):
        encounter = self.create().data['id']
        session = ChatSession.objects.get(pk=encounter)
        ChatMessage.objects.create(session=session, role='assistant', content='Hola.', speaker=self.bruno)
        items = self.client.get('/api/v1/ai/conversations/').data
        item = next(i for i in items if i['session_id'] == encounter)
        self.assertEqual(item['kind'], 'encounter')
        self.assertEqual(item['name'], 'Alicia y Bruno')
        self.assertEqual(item['book_title'], 'La isla · El faro')
        self.assertEqual(item['partner']['id'], str(self.bruno.pk))
        self.assertEqual(item['last_speaker'], 'Bruno')
        from parental.history import chat_detail, chats
        self.assertEqual(chats(self.user)['characters'][0]['character'], 'Alicia y Bruno')
        self.assertEqual(chat_detail(self.user, encounter)['messages'][0]['speaker'], 'Bruno')

    def test_topic_can_change(self):
        encounter = self.create().data['id']
        response = self.client.patch(f'/api/v1/ai/encounters/{encounter}/', {'topic': 'La amistad'}, format='json')
        self.assertEqual(response.data['topic'], 'La amistad')
        other = User.objects.create_user(username='otro', email='otro@example.com', password='test')
        self.client.force_authenticate(other)
        self.assertEqual(self.client.get(f'/api/v1/ai/encounters/{encounter}/').status_code, 404)
