"""Control parental: alta y vínculo de hijos, poderes del tutor, bloqueos al hijo e historial."""
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APITestCase

from ai_engine.models import AIAvatar, BlindInterrogationSession, ChatMessage, ChatSession
from catalog.models import Book, Chapter, Edition
from community.models import Friendship
from learning.models import LearningLevel, LearningUnit, UserExerciseAttempt, UserLevelProgress
from library.models import (InkTransaction, NotebookTab, ReadingProgress, ReadingSession, UserHighlight,
                            UserInventory, UserPostIt, UserVocabulary)
from users.guests import create_guest

from .history import notebook_text, session_minutes
from .models import ParentalLink
from .services import CHILD_EMAIL_DOMAIN, MAX_CHILDREN

User = get_user_model()
BASE = '/api/v1/parental/'
PASSWORD = 'LecturaSegura2026!'
CHILD_PASSWORD = 'CuentoDeHadas2026!'


def years_ago(years, days=0):
    today = timezone.localdate()
    try:
        born = today.replace(year=today.year - years)
    except ValueError:  # 29 de febrero
        born = today.replace(year=today.year - years, day=28)
    return born + timedelta(days=days)


class ParentalTestCase(APITestCase):
    def setUp(self):
        cache.clear()
        self.parent = self.make_user('mama', years_ago(40))

    def make_user(self, name, birth_date):
        user = User.objects.create_user(username=name, email=f'{name}@example.com', password=PASSWORD)
        user.profile.birth_date = birth_date
        user.profile.save(update_fields=['birth_date'])
        return user

    def create_child(self, parent=None, **overrides):
        self.client.force_authenticate(parent or self.parent)
        payload = {'username': 'tomas', 'password': CHILD_PASSWORD, 'birth_date': years_ago(10).isoformat(),
                   'first_name': 'Tomás', 'consent': True, **overrides}
        return self.client.post(BASE + 'children/', payload, format='json')

    def child(self, **overrides):
        response = self.create_child(**overrides)
        self.assertEqual(response.status_code, 201, response.data)
        return User.objects.get(pk=response.data['id'])


class CreateChildTests(ParentalTestCase):
    def test_parent_creates_a_child_that_can_log_in_with_its_username(self):
        response = self.create_child()
        self.assertEqual(response.status_code, 201, response.data)
        child = User.objects.get(username='tomas')
        self.assertTrue(child.is_active)
        self.assertTrue(child.email.endswith('@' + CHILD_EMAIL_DOMAIN))
        self.assertFalse(child.profile.is_public)
        self.assertFalse(child.profile.has_completed_onboarding)
        self.assertEqual(child.profile.birth_date, years_ago(10))
        link = ParentalLink.objects.get(child=child)
        self.assertEqual(link.parent, self.parent)
        self.assertEqual(link.origin, ParentalLink.Origin.CREATED)
        self.assertIsNotNone(link.consent_at)
        self.assertFalse(response.data['has_own_email'])

        self.client.force_authenticate(None)
        login = self.client.post('/api/v1/users/login/', {'username': 'tomas', 'password': CHILD_PASSWORD},
                                 format='json')
        self.assertEqual(login.status_code, 200)

    def test_consent_is_required(self):
        response = self.create_child(consent=False)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'CONSENT_REQUIRED')
        self.assertFalse(User.objects.filter(username='tomas').exists())

    def test_child_must_be_a_minor(self):
        response = self.create_child(birth_date=years_ago(18).isoformat())
        self.assertEqual(response.data['code'], 'CHILD_NOT_MINOR')
        self.assertEqual(self.create_child(birth_date=years_ago(18, days=1).isoformat()).status_code, 201)

    def test_username_and_password_are_validated(self):
        User.objects.create_user(username='Ocupado', email='ocupado@example.com', password=PASSWORD)
        self.assertIn('username', self.create_child(username='ocupado').data)
        self.assertIn('username', self.create_child(username='con@arroba').data)
        self.assertIn('password', self.create_child(password='123').data)

    def test_only_adults_with_their_own_account_can_be_parents(self):
        minor = self.make_user('adolescente', years_ago(15))
        no_date = self.make_user('sinfecha', None)
        guest = create_guest()
        for user, code in ((minor, 'MINOR'), (no_date, 'NO_BIRTH_DATE'), (guest, 'GUEST')):
            with self.subTest(code=code):
                response = self.create_child(parent=user, username=f'hijo{code.lower()}')
                self.assertEqual(response.status_code, 403)
                self.assertEqual(response.data['code'], code)

    def test_a_child_account_cannot_have_children(self):
        child = self.child()
        response = self.create_child(parent=child, username='nieto')
        self.assertEqual(response.data['code'], 'CHILD_ACCOUNT')

    def test_there_is_a_limit_of_children(self):
        for n in range(MAX_CHILDREN):
            self.child(username=f'hijo{n}')
        response = self.create_child(username='uno_mas')
        self.assertEqual(response.data['code'], 'TOO_MANY_CHILDREN')

    def test_the_child_domain_is_reserved_at_registration(self):
        self.client.force_authenticate(None)
        response = self.client.post('/api/v1/users/register/', {
            'username': 'colado', 'email': f'colado@{CHILD_EMAIL_DOMAIN}', 'password': PASSWORD,
            'birth_date': '2001-02-03'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('email', response.data)

    def test_status_lists_the_children_and_tells_the_child_who_is_in_charge(self):
        child = self.child()
        self.client.force_authenticate(self.parent)
        data = self.client.get(BASE + 'status/').data
        self.assertTrue(data['can_be_parent'])
        self.assertFalse(data['is_child'])
        self.assertEqual([c['username'] for c in data['children']], ['tomas'])
        self.assertEqual(data['children'][0]['age'], 10)

        self.client.force_authenticate(child)
        data = self.client.get(BASE + 'status/').data
        self.assertTrue(data['is_child'])
        self.assertEqual(data['guardian']['username'], 'mama')
        self.assertFalse(data['can_be_parent'])
        self.assertEqual(data['children'], [])

    def test_status_requires_login(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(BASE + 'status/').status_code, 401)


class LinkExistingTests(ParentalTestCase):
    def setUp(self):
        super().setUp()
        self.kid = self.make_user('sofia', years_ago(12))

    def link(self, **overrides):
        self.client.force_authenticate(self.parent)
        payload = {'identifier': 'sofia', 'password': PASSWORD, 'consent': True, **overrides}
        return self.client.post(BASE + 'children/link/', payload, format='json')

    def test_links_an_existing_account_with_its_password(self):
        response = self.link(identifier='sofia@example.com')
        self.assertEqual(response.status_code, 201, response.data)
        link = ParentalLink.objects.get(child=self.kid)
        self.assertEqual(link.origin, ParentalLink.Origin.LINKED)
        self.assertTrue(response.data['has_own_email'])

    def test_wrong_password_or_unknown_user_give_the_same_answer(self):
        self.assertEqual(self.link(password='otra-cosa').data['code'], 'LINK_CREDENTIALS')
        self.assertEqual(self.link(identifier='nadie').data['code'], 'LINK_CREDENTIALS')
        self.assertFalse(ParentalLink.objects.exists())

    def test_rejects_adults_linked_accounts_and_self(self):
        adult = self.make_user('grande', years_ago(20))
        self.assertEqual(self.link(identifier='grande').data['code'], 'CHILD_NOT_MINOR')
        self.assertEqual(self.link(identifier='mama').data['code'], 'LINK_SELF')
        other_parent = self.make_user('papa', years_ago(45))
        ParentalLink.objects.create(parent=other_parent, child=self.kid, consent_at=timezone.now())
        response = self.link()
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data['code'], 'ALREADY_LINKED')
        self.assertFalse(ParentalLink.objects.filter(child=adult).exists())

    def test_asks_for_the_birth_date_when_the_account_has_none(self):
        self.kid.profile.birth_date = None
        self.kid.profile.save(update_fields=['birth_date'])
        self.assertEqual(self.link().data['code'], 'BIRTH_DATE_REQUIRED')
        response = self.link(birth_date=years_ago(9).isoformat())
        self.assertEqual(response.status_code, 201, response.data)
        self.kid.profile.refresh_from_db()
        self.assertEqual(self.kid.profile.birth_date, years_ago(9))

    def test_linking_is_throttled(self):
        codes = [self.link(password='mala').status_code for _ in range(11)]
        self.assertEqual(codes[:10], [400] * 10)
        self.assertEqual(codes[10], 429)


class GuardianPowersTests(ParentalTestCase):
    def setUp(self):
        super().setUp()
        self.kid = self.child()
        self.stranger = self.make_user('extrano', years_ago(35))

    def post(self, user, path, payload):
        self.client.force_authenticate(user)
        return self.client.post(f'{BASE}children/{self.kid.pk}/{path}/', payload, format='json')

    def test_strangers_get_404_everywhere(self):
        self.client.force_authenticate(self.stranger)
        for section in ('', 'reading/', 'games/', 'writing/', 'chats/', 'activity/'):
            with self.subTest(section=section):
                self.assertEqual(self.client.get(f'{BASE}children/{self.kid.pk}/{section}').status_code, 404)
        for action in ('password', 'unlink', 'delete'):
            with self.subTest(action=action):
                self.assertEqual(self.post(self.stranger, action, {'parent_password': PASSWORD}).status_code, 404)

    def test_parent_changes_the_child_password(self):
        response = self.post(self.parent, 'password', {'parent_password': 'mala', 'new_password': 'NuevaClave2026!'})
        self.assertEqual(response.data['code'], 'PASSWORD_INVALID')
        response = self.post(self.parent, 'password', {'parent_password': PASSWORD, 'new_password': '123'})
        self.assertEqual(response.data['code'], 'PASSWORD_WEAK')
        response = self.post(self.parent, 'password', {'parent_password': PASSWORD, 'new_password': 'NuevaClave2026!'})
        self.assertEqual(response.status_code, 200)
        self.kid.refresh_from_db()
        self.assertTrue(self.kid.check_password('NuevaClave2026!'))
        self.assertFalse(self.kid.check_password(CHILD_PASSWORD))

    def test_parent_unlinks_the_child(self):
        self.assertEqual(self.post(self.parent, 'unlink', {'parent_password': 'mala'}).status_code, 400)
        self.assertEqual(self.post(self.parent, 'unlink', {'parent_password': PASSWORD}).status_code, 204)
        self.assertFalse(ParentalLink.all_objects.filter(child=self.kid).exists())
        self.assertTrue(User.objects.filter(pk=self.kid.pk).exists())

    def test_parent_deletes_the_child_account(self):
        self.assertEqual(self.post(self.parent, 'delete', {'parent_password': PASSWORD}).status_code, 204)
        self.assertFalse(User.all_objects.filter(pk=self.kid.pk).exists())

    def test_the_child_cannot_delete_its_account_nor_pay(self):
        self.client.force_authenticate(self.kid)
        response = self.client.post('/api/v1/users/me/delete/', {'password': CHILD_PASSWORD}, format='json')
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data['code'], 'CHILD_ACCOUNT_MANAGED')
        self.assertTrue(User.objects.filter(pk=self.kid.pk).exists())
        for url, payload in (('/api/v1/finance/pay/', {'item_type': 'ink', 'item_reference': '100'}),
                             ('/api/v1/finance/subscription/subscribe/', {'plan_code': 'maestro'})):
            with self.subTest(url=url):
                response = self.client.post(url, payload, format='json')
                self.assertEqual(response.status_code, 403)
                self.assertEqual(response.data['code'], 'child_no_payments')

    def test_when_the_parent_deletes_its_account_the_child_stays(self):
        self.client.force_authenticate(self.parent)
        response = self.client.post('/api/v1/users/me/delete/', {'password': PASSWORD}, format='json')
        self.assertEqual(response.status_code, 204)
        self.assertFalse(ParentalLink.all_objects.exists())
        self.assertTrue(User.objects.filter(pk=self.kid.pk).exists())

    def test_the_child_internal_email_gets_no_recovery_code(self):
        from django.core import mail
        self.client.force_authenticate(None)
        self.client.post('/api/v1/users/password-reset/', {'email': self.parent.email}, format='json')
        self.assertEqual(len(mail.outbox), 1)  # el correo funciona…
        self.client.post('/api/v1/users/password-reset/', {'email': self.kid.email}, format='json')
        self.assertEqual(len(mail.outbox), 1)  # …pero el interno del hijo no recibe nada


class HistoryTests(ParentalTestCase):
    """Datos sembrados del hijo y lo que ve el tutor en cada sección."""

    def setUp(self):
        super().setUp()
        self.kid = self.child()
        self.client.force_authenticate(self.parent)
        now = timezone.now()
        self.book = Book.objects.create(title='La isla del tesoro', is_published=True,
                                        status=Book.StatusChoices.PUBLISHED)
        self.chapters = [Chapter.objects.create(book=self.book, order=n, title=f'Parte {n}',
                                                content_html='<p>Había una vez un mapa.</p>') for n in range(1, 11)]
        self.edition = Edition.objects.create(book=self.book, price=0)
        self.inventory = UserInventory.objects.create(user=self.kid, edition=self.edition)
        ReadingProgress.objects.update_or_create(  # la señal del inventario ya creó el progreso
            inventory=self.inventory, defaults={'current_page': 4, 'completion_percentage': Decimal('40')})
        # 30 min, una pestaña olvidada (tope 3 h) y una sin cerrar de hace días (no cuenta)
        ReadingSession.objects.create(user=self.kid, book=self.book, started_at=now - timedelta(hours=2),
                                      ended_at=now - timedelta(hours=1, minutes=30))
        ReadingSession.objects.create(user=self.kid, book=self.book, started_at=now - timedelta(days=2, hours=10),
                                      ended_at=now - timedelta(days=2))
        ReadingSession.objects.create(user=self.kid, book=self.book, started_at=now - timedelta(days=3))

        unit = LearningUnit.objects.create(unit_number=1, slug='u1', title='Primeros pasos', description='', order=1)
        level = LearningLevel.objects.create(unit=unit, level_number=1, order=1, title='El narrador', description='')
        LearningLevel.objects.create(unit=unit, level_number=2, order=2, title='Los personajes', description='')
        UserLevelProgress.objects.create(user=self.kid, level=level, stars=2, best_score=80, is_completed=True,
                                         completed_at=now)
        UserExerciseAttempt.objects.create(user=self.kid, level=level, score=40, passed=False, duration_seconds=120)
        UserExerciseAttempt.objects.create(user=self.kid, level=level, score=80, passed=True, duration_seconds=180)

        InkTransaction.objects.create(user=self.kid, amount=15, concept='daily_enigma', balance_after=115)
        InkTransaction.objects.create(user=self.kid, amount=0, concept='daily_enigma_abandoned', reference_id='lost',
                                      balance_after=115)
        InkTransaction.objects.create(user=self.kid, amount=0, concept='daily_enigma_abandoned',
                                      reference_id='unsolved', balance_after=115)

        avatar = AIAvatar.objects.create(edition=self.edition, name='Long John Silver', system_prompt='x')
        BlindInterrogationSession.objects.create(
            user=self.kid, avatar=avatar, status='won', questions_used=2, ink_earned=10,
            dialogue_history=[{'role': 'user', 'content': '¿Tienes un loro?'},
                              {'role': 'character', 'content': 'Se llama Capitán Flint.'}])
        BlindInterrogationSession.objects.create(user=self.kid, avatar=avatar, status='playing',
                                                 dialogue_history=[{'role': 'user', 'content': '¿Eres pirata?'}])
        self.chat = ChatSession.objects.create(user=self.kid, avatar=avatar, title='Sobre el tesoro')
        ChatMessage.objects.create(session=self.chat, role='system', content='instrucciones privadas')
        ChatMessage.objects.create(session=self.chat, role='user', content='¿Dónde está el tesoro?')
        ChatMessage.objects.create(session=self.chat, role='assistant', content='Eso no te lo diré, grumete.')

        UserHighlight.objects.create(inventory=self.inventory, chapter=self.chapters[0], start_word=0, end_word=3,
                                     text='Había una vez')
        UserPostIt.objects.create(inventory=self.inventory, chapter=self.chapters[1], word=2, text='Me gustó el mapa')
        UserVocabulary.objects.create(user=self.kid, book=self.book, word='grumete', definition='Aprendiz de marinero')
        NotebookTab.objects.create(user=self.kid, title='Mis ideas', content={'type': 'doc', 'content': [
            {'type': 'heading', 'content': [{'type': 'text', 'text': 'Piratas'}]},
            {'type': 'paragraph', 'content': [{'type': 'text', 'text': 'Silver '},
                                              {'type': 'text', 'text': 'es el malo.'}]}]},
            drawing=[{'points': [[0, 0], [1, 1]]}])
        friend = self.make_user('amiga', years_ago(11))
        Friendship.objects.create(requester=self.kid, addressee=friend, status=Friendship.Status.ACCEPTED,
                                  responded_at=now)

    def get(self, section=''):
        response = self.client.get(f'{BASE}children/{self.kid.pk}/{section}')
        self.assertEqual(response.status_code, 200, getattr(response, 'data', None))
        return response.data

    def test_session_minutes_rule(self):
        now = timezone.now()
        self.assertEqual(session_minutes(now - timedelta(minutes=30), now, now), 30)
        self.assertEqual(session_minutes(now - timedelta(hours=10), now, now), 180)
        self.assertEqual(session_minutes(now - timedelta(minutes=20), None, now), 20)
        self.assertEqual(session_minutes(now - timedelta(hours=2), None, now), 0)

    def test_overview(self):
        data = self.get()
        self.assertEqual(data['child']['username'], 'tomas')
        self.assertEqual(data['reading']['minutes_7d'], 210)
        self.assertEqual(data['senda']['total_completed_levels'], 1)
        self.assertEqual(data['games']['enigmas_solved'], 1)
        self.assertEqual(data['games']['interrogations_won'], 1)
        self.assertEqual(data['writing'], {'highlights': 1, 'post_its': 1, 'vocabulary': 1, 'notebook_tabs': 1,
                                           'chats': 1})
        self.assertEqual(len(data['calendar']), 30)

    def test_reading(self):
        data = self.get('reading/')
        book = data['books'][0]
        self.assertEqual((book['title'], book['current_chapter'], book['total_chapters']),
                         ('La isla del tesoro', 4, 10))
        self.assertEqual(book['completion_percentage'], 40.0)
        self.assertEqual((book['minutes'], book['sessions']), (210, 3))
        self.assertIsNone(book['finished_at'])
        self.assertEqual(sum(day['minutes'] for day in data['daily_minutes']), 210)
        self.assertEqual(len(data['recent_sessions']), 3)

    def test_finished_book_has_a_date(self):
        progress = ReadingProgress.objects.get(inventory=self.inventory)
        progress.completion_percentage = Decimal('100')
        progress.save()
        book = self.get('reading/')['books'][0]
        self.assertIsNotNone(book['finished_at'])
        self.assertTrue(any(e['kind'] == 'book_finished' for e in self.get('activity/')['events']))

    def test_games(self):
        data = self.get('games/')
        senda = data['senda']
        self.assertEqual(senda['units'][0]['levels_completed'], 1)
        self.assertEqual(senda['units'][0]['levels_total'], 2)
        self.assertEqual(senda['units'][0]['stars'], 2)
        self.assertEqual((senda['total_attempts'], senda['total_passed']), (2, 1))
        self.assertEqual(len(senda['recent_attempts']), 2)
        self.assertEqual(data['enigma']['totals'], {'solved': 1, 'lost': 1, 'abandoned': 1})
        self.assertEqual(data['interrogation']['totals']['won'], 1)
        recent = {row['status']: row for row in data['interrogation']['recent']}
        self.assertEqual(recent['won']['character'], 'Long John Silver')
        self.assertIsNone(recent['playing']['character'])  # no se revela mientras juega

    def test_writing(self):
        data = self.get('writing/')
        self.assertEqual(data['highlights'][0]['text'], 'Había una vez')
        self.assertEqual(data['highlights'][0]['chapter'], 'Parte 1')
        self.assertEqual(data['post_its'][0]['text'], 'Me gustó el mapa')
        self.assertEqual(data['vocabulary'][0]['word'], 'grumete')
        self.assertEqual(data['notebook'][0]['text'], 'Piratas\nSilver es el malo.')
        self.assertTrue(data['notebook'][0]['has_drawing'])

    def test_chats(self):
        data = self.get('chats/')
        self.assertEqual(data['characters'][0]['character'], 'Long John Silver')
        self.assertEqual(data['characters'][0]['message_count'], 2)
        self.assertEqual(data['characters'][0]['questions'], 1)
        self.assertEqual(len(data['interrogations']), 2)
        detail = self.get(f'chats/{self.chat.pk}/')
        self.assertEqual([m['role'] for m in detail['messages']], ['user', 'assistant'])  # sin el prompt
        other = ChatSession.objects.create(user=self.parent, avatar=self.chat.avatar)
        self.assertEqual(self.client.get(f'{BASE}children/{self.kid.pk}/chats/{other.pk}/').status_code, 404)

    def test_activity_timeline(self):
        data = self.get('activity/')
        kinds = {event['kind'] for event in data['events']}
        self.assertTrue({'reading', 'senda', 'enigma', 'interrogation', 'highlight', 'post_it', 'vocabulary',
                         'chat', 'friend'} <= kinds)
        moments = [event['at'] for event in data['events']]
        self.assertEqual(moments, sorted(moments, reverse=True))
        self.assertEqual(len(data['days']), 30)
        self.assertEqual(sum(day['minutes'] for day in data['days']), 210)

    def test_notebook_text_ignores_garbage(self):
        self.assertEqual(notebook_text(None), '')
        self.assertEqual(notebook_text({'type': 'doc', 'content': 'nada'}), '')


class EnigmaLossTests(ParentalTestCase):
    def test_a_lost_enigma_is_recorded_apart_from_an_abandoned_one(self):
        self.client.force_authenticate(self.parent)
        response = self.client.post('/api/v1/library/daily-reward/abandon-enigma/', {'reason': 'lost'}, format='json')
        self.assertEqual(response.status_code, 200)
        tx = InkTransaction.objects.get(user=self.parent, concept='daily_enigma_abandoned')
        self.assertEqual(tx.reference_id, 'lost')
        status = self.client.get('/api/v1/library/daily-reward/enigma-status/').data
        self.assertFalse(status['can_play'])
