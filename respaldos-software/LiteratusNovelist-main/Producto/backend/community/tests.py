import importlib
from datetime import timedelta
from unittest import mock

from django.apps import apps as django_apps
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from catalog.models import Book, Chapter, Edition, Genre, Review
from learning.models import DailyActivityLog
from library.achievement_engine import reward_activity
from library.models import ReadingProgress, UserInventory
from users.models import FRIEND_CODE_ALPHABET, Profile

from . import live
from .models import Brindis, FriendMessage, Friendship, ReadingClub, ReadingClubMember, TavernInvitation, TavernMessage

User = get_user_model()
API = '/api/v1/community/'


def make_user(name, **extra):
    return User.objects.create_user(username=name, email=f'{name}@example.com', password='StrongPassword123!', **extra)


def code_of(user):
    return Profile.objects.get(user=user).friend_code


class FriendCodeTests(APITestCase):
    def test_every_new_user_gets_a_valid_unique_code(self):
        codes = {code_of(make_user(f'lector{i}')) for i in range(50)}

        self.assertEqual(len(codes), 50)
        for code in codes:
            self.assertEqual(len(code), 6)
            self.assertTrue(set(code) <= set(FRIEND_CODE_ALPHABET))

    def test_code_survives_partial_saves(self):
        user = make_user('ana')
        code = code_of(user)
        profile = Profile.objects.get(user=user)
        profile.bio = 'Hola'
        profile.save(update_fields=['bio'])

        self.assertEqual(code_of(user), code)

    def test_backfill_migration_fills_missing_codes_once(self):
        users = [make_user(f'viejo{i}') for i in range(5)]
        Profile.objects.update(friend_code=None)
        backfill = importlib.import_module('users.migrations.0010_backfill_friend_codes').backfill

        backfill(django_apps, None)
        first = {u.pk: code_of(u) for u in users}
        backfill(django_apps, None)

        self.assertTrue(all(first.values()))
        self.assertEqual(len(set(first.values())), 5)
        self.assertEqual(first, {u.pk: code_of(u) for u in users})


class CommunityAPITestCase(APITestCase):
    def setUp(self):
        cache.clear()  # los límites de peticiones usan la caché
        self.ana = make_user('ana')
        self.bruno = make_user('bruno')
        self.carla = make_user('carla')

    def as_user(self, user):
        self.client.force_authenticate(user)
        return self.client

    def befriend(self, a, b):
        return Friendship.objects.create(requester=a, addressee=b, status=Friendship.Status.ACCEPTED)


class TavernInvitationTests(CommunityAPITestCase):
    def invite(self):
        self.befriend(self.ana, self.bruno)
        return self.as_user(self.ana).post(f'{API}tavern/invitations/', {'friend_code': code_of(self.bruno)})

    def test_invitation_is_private_to_sender_and_recipient_and_idempotent(self):
        first = self.invite()
        again = self.client.post(f'{API}tavern/invitations/', {'friend_code': code_of(self.bruno)})
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.data['id'], again.data['id'])
        self.assertEqual(TavernInvitation.objects.count(), 1)
        incoming = self.as_user(self.bruno).get(f'{API}tavern/activity/').data['invitations']['incoming']
        self.assertEqual(incoming[0]['user']['friend_code'], code_of(self.ana))
        self.assertEqual(self.as_user(self.ana).get(f'{API}tavern/activity/').data['invitations']['outgoing'][0]['id'], first.data['id'])
        self.assertEqual(self.as_user(self.carla).get(f'{API}tavern/activity/').data['invitations'], {'incoming': [], 'outgoing': []})

    def test_self_stranger_and_pending_friend_cannot_be_invited(self):
        client = self.as_user(self.ana)
        for target in [self.ana, self.bruno]:
            self.assertEqual(client.post(f'{API}tavern/invitations/', {'friend_code': code_of(target)}).status_code, 403)
        Friendship.objects.create(requester=self.ana, addressee=self.bruno)
        self.assertEqual(client.post(f'{API}tavern/invitations/', {'friend_code': code_of(self.bruno)}).status_code, 403)

    def test_only_recipient_can_accept_and_acceptance_updates_presence(self):
        pk = self.invite().data['id']
        url = f'{API}tavern/invitations/{pk}/respond/'
        self.assertEqual(self.as_user(self.ana).post(url, {'action': 'accept'}).status_code, 404)
        self.assertEqual(self.as_user(self.carla).post(url, {'action': 'accept'}).status_code, 404)
        self.assertEqual(self.as_user(self.bruno).post(url, {'action': 'accept'}).status_code, 200)
        self.assertIsNotNone(Profile.objects.get(user=self.bruno).last_seen_in_tavern)
        self.assertFalse(TavernInvitation.objects.exists())
        self.assertEqual(self.client.post(url, {'action': 'accept'}).status_code, 404)

    def test_expired_invitation_is_hidden_and_cannot_be_accepted(self):
        pk = self.invite().data['id']
        TavernInvitation.objects.filter(pk=pk).update(expires_at=timezone.now() - timedelta(seconds=1))
        client = self.as_user(self.bruno)
        self.assertEqual(client.get(f'{API}tavern/activity/').data['invitations']['incoming'], [])
        self.assertEqual(client.post(f'{API}tavern/invitations/{pk}/respond/', {'action': 'accept'}).status_code, 404)
        self.assertEqual(self.as_user(self.ana).post(f'{API}tavern/invitations/', {'friend_code': code_of(self.bruno)}).status_code, 200)
        self.assertEqual(TavernInvitation.objects.count(), 1)

    def test_decline_removes_invitation_without_claiming_rewards(self):
        pk = self.invite().data['id']
        before = Profile.objects.get(user=self.bruno)
        self.assertEqual(self.as_user(self.bruno).post(f'{API}tavern/invitations/{pk}/respond/', {'action': 'decline'}).status_code, 200)
        after = Profile.objects.get(user=self.bruno)
        self.assertEqual((after.xp, after.ink_balance), (before.xp, before.ink_balance))
        self.assertIsNone(after.last_seen_in_tavern)
        self.assertFalse(TavernInvitation.objects.exists())

    def test_unfriend_revokes_visibility_and_response(self):
        pk = self.invite().data['id']
        Friendship.objects.all().delete()
        client = self.as_user(self.bruno)
        self.assertEqual(client.get(f'{API}tavern/activity/').data['invitations']['incoming'], [])
        self.assertEqual(client.post(f'{API}tavern/invitations/{pk}/respond/', {'action': 'accept'}).status_code, 404)

    def test_authentication_and_response_validation(self):
        pk = self.invite().data['id']
        client = self.as_user(self.bruno)
        self.assertEqual(client.post(f'{API}tavern/invitations/{pk}/respond/', {'action': 'dance'}).status_code, 400)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.post(f'{API}tavern/invitations/', {'friend_code': code_of(self.bruno)}).status_code, 401)


class FriendRequestTests(CommunityAPITestCase):
    def test_send_by_code_and_by_username(self):
        by_code = self.as_user(self.ana).post(f'{API}requests/', {'friend_code': '#' + code_of(self.bruno).lower()})
        by_name = self.as_user(self.ana).post(f'{API}requests/', {'username': 'CARLA'})

        self.assertEqual(by_code.status_code, status.HTTP_201_CREATED)
        self.assertEqual(by_name.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Friendship.objects.filter(requester=self.ana, status='pending').count(), 2)

    def test_duplicate_and_self_requests_are_rejected(self):
        self.as_user(self.ana).post(f'{API}requests/', {'username': 'bruno'})

        duplicate = self.client.post(f'{API}requests/', {'username': 'bruno'})
        to_self = self.client.post(f'{API}requests/', {'friend_code': code_of(self.ana)})

        self.assertEqual(duplicate.data['error'], 'ALREADY_SENT')
        self.assertEqual(to_self.data['error'], 'SELF_REQUEST')
        self.assertEqual(Friendship.objects.count(), 1)

    def test_inviting_back_accepts_the_pending_request(self):
        self.as_user(self.ana).post(f'{API}requests/', {'username': 'bruno'})

        response = self.as_user(self.bruno).post(f'{API}requests/', {'username': 'ana'})

        self.assertEqual(response.data['state'], 'accepted')
        self.assertEqual(Friendship.objects.get().status, Friendship.Status.ACCEPTED)

    def test_only_the_addressee_can_answer(self):
        pk = self.as_user(self.ana).post(f'{API}requests/', {'username': 'bruno'}).data['id']

        by_requester = self.as_user(self.ana).post(f'{API}requests/{pk}/accept/')
        by_stranger = self.as_user(self.carla).post(f'{API}requests/{pk}/accept/')
        by_addressee = self.as_user(self.bruno).post(f'{API}requests/{pk}/accept/')

        self.assertEqual(by_requester.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(by_stranger.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(by_addressee.status_code, status.HTTP_201_CREATED)

    def test_decline_has_a_cooldown_for_the_requester_only(self):
        pk = self.as_user(self.ana).post(f'{API}requests/', {'username': 'bruno'}).data['id']
        self.as_user(self.bruno).post(f'{API}requests/{pk}/decline/')

        again = self.as_user(self.ana).post(f'{API}requests/', {'username': 'bruno'})
        self.assertEqual(again.data['error'], 'COOLDOWN')

        Friendship.objects.update(responded_at=timezone.now() - timedelta(days=8))
        later = self.as_user(self.ana).post(f'{API}requests/', {'username': 'bruno'})
        self.assertEqual(later.status_code, status.HTTP_201_CREATED)

    def test_who_declined_can_change_their_mind(self):
        pk = self.as_user(self.ana).post(f'{API}requests/', {'username': 'bruno'}).data['id']
        self.as_user(self.bruno).post(f'{API}requests/{pk}/decline/')

        response = self.as_user(self.bruno).post(f'{API}requests/', {'username': 'ana'})

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        friendship = Friendship.objects.get()
        self.assertEqual((friendship.requester, friendship.status), (self.bruno, Friendship.Status.PENDING))

    def test_cancel_removes_the_row_and_only_the_requester_can(self):
        pk = self.as_user(self.ana).post(f'{API}requests/', {'username': 'bruno'}).data['id']

        by_addressee = self.as_user(self.bruno).delete(f'{API}requests/{pk}/')
        by_requester = self.as_user(self.ana).delete(f'{API}requests/{pk}/')

        self.assertEqual(by_addressee.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(by_requester.status_code, status.HTTP_200_OK)
        self.assertEqual(Friendship.all_objects.count(), 0)

    def test_unverified_accounts_cannot_be_invited(self):
        sleepy = make_user('dormida', is_active=False)

        response = self.as_user(self.ana).post(f'{API}requests/', {'friend_code': code_of(sleepy)})

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_requests_overview_lists_both_directions(self):
        self.as_user(self.ana).post(f'{API}requests/', {'username': 'bruno'})
        self.as_user(self.carla).post(f'{API}requests/', {'username': 'ana'})

        data = self.as_user(self.ana).get(f'{API}requests/').data

        self.assertEqual([r['user']['username'] for r in data['incoming']], ['carla'])
        self.assertEqual([r['user']['username'] for r in data['outgoing']], ['bruno'])

    def test_unfriend_removes_friendship_and_brindis_both_ways(self):
        self.befriend(self.ana, self.bruno)
        Brindis.objects.create(giver=self.ana, receiver=self.bruno)
        Brindis.objects.create(giver=self.bruno, receiver=self.ana)

        response = self.as_user(self.bruno).delete(f'{API}friends/{code_of(self.ana)}/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Friendship.all_objects.count(), 0)
        self.assertEqual(Brindis.all_objects.count(), 0)


class PrivacyTests(CommunityAPITestCase):
    def test_strangers_only_see_the_minimal_card_of_a_private_profile(self):
        Profile.objects.filter(user=self.bruno).update(bio='Secreto', tagline='Hola', is_public=False)

        data = self.as_user(self.ana).get(f'{API}profiles/{code_of(self.bruno)}/').data

        self.assertEqual(set(data), {'full', 'friend_code', 'username', 'outfit', 'equipped_frame', 'equipped_title',
                                     'is_public', 'relation', 'request_id'})
        self.assertFalse(data['full'])
        self.assertFalse(data['is_public'])

    def test_profiles_are_public_by_default_and_strangers_see_the_full_card(self):
        Profile.objects.filter(user=self.bruno).update(bio='Leo de noche')
        pk = self.as_user(self.ana).post(f'{API}requests/', {'username': 'bruno'}).data['id']

        data = self.client.get(f'{API}profiles/{code_of(self.bruno)}/').data

        self.assertTrue(Profile.objects.get(user=self.carla).is_public)
        self.assertTrue(data['full'])
        self.assertEqual(data['bio'], 'Leo de noche')
        self.assertEqual((data['relation'], data['request_id']), ('outgoing', pk))
        self.assertIn('stats', data)
        self.assertNotIn('brindis_given', data)
        self.assertNotIn('avatar', data)

    def test_friends_see_the_full_card_even_if_private(self):
        self.befriend(self.ana, self.bruno)
        Profile.objects.filter(user=self.bruno).update(is_public=False)

        data = self.as_user(self.ana).get(f'{API}profiles/{code_of(self.bruno)}/').data

        self.assertTrue(data['full'])
        self.assertEqual(data['relation'], 'friend')

    def test_friends_see_the_full_profile_with_stats(self):
        self.befriend(self.ana, self.bruno)
        Profile.objects.filter(user=self.bruno).update(bio='Leo de noche')

        data = self.as_user(self.ana).get(f'{API}profiles/{code_of(self.bruno)}/').data

        self.assertTrue(data['full'])
        self.assertEqual(data['bio'], 'Leo de noche')
        self.assertEqual(data['stats']['friends'], 1)
        self.assertNotIn('avatar', data)

    def test_unknown_code_is_404_and_anonymous_is_401(self):
        self.assertEqual(self.as_user(self.ana).get(f'{API}profiles/ZZZZZZ/').status_code, 404)
        self.client.force_authenticate(None)
        for url in ('me/', 'friends/', 'requests/', 'ranking/', f'profiles/{code_of(self.ana)}/'):
            self.assertEqual(self.client.get(API + url).status_code, status.HTTP_401_UNAUTHORIZED, url)

    def test_search_by_code_or_name_excludes_me_and_inactive(self):
        make_user('anabel')
        make_user('anastasia', is_active=False)

        by_name = self.as_user(self.ana).get(f'{API}search/', {'q': 'ana'}).data['results']
        by_code = self.client.get(f'{API}search/', {'q': '#' + code_of(self.bruno).lower()}).data['results']

        self.assertEqual([r['username'] for r in by_name], ['anabel'])
        self.assertEqual([r['username'] for r in by_code], ['bruno'])
        self.assertEqual(by_code[0]['relation'], 'none')

    def test_private_profiles_are_found_only_by_code(self):
        Profile.objects.filter(user=self.bruno).update(is_public=False)
        client = self.as_user(self.ana)

        by_name = client.get(f'{API}search/', {'q': 'bru'}).data['results']
        by_code = client.get(f'{API}search/', {'q': code_of(self.bruno)}).data['results']

        self.assertEqual(by_name, [])
        self.assertEqual([r['username'] for r in by_code], ['bruno'])

    def test_me_includes_code_stats_and_pending(self):
        self.as_user(self.bruno).post(f'{API}requests/', {'username': 'ana'})

        data = self.as_user(self.ana).get(f'{API}me/').data

        self.assertEqual(data['friend_code'], code_of(self.ana))
        self.assertEqual(data['pending_incoming'], 1)
        self.assertEqual(set(data['stats']), {'books', 'books_read', 'reviews', 'friends', 'brindis'})
        self.assertTrue(data['is_public'])


class ProfileStatsTests(CommunityAPITestCase):
    def stats(self):
        return self.as_user(self.ana).get(f'{API}me/').data['stats']

    def test_books_counts_every_book_in_the_library_once(self):
        rayuela = Book.objects.create(title='Rayuela', status=Book.StatusChoices.PUBLISHED, is_published=True)
        ficciones = Book.objects.create(title='Ficciones', status=Book.StatusChoices.PUBLISHED, is_published=True)
        for edition in (Edition.objects.create(book=rayuela, price=0), Edition.objects.create(book=rayuela, price=1),
                        Edition.objects.create(book=ficciones, price=0)):
            UserInventory.objects.create(user=self.ana, edition=edition)
        UserInventory.objects.create(user=self.bruno, edition=Edition.objects.create(book=ficciones, price=2))

        stats = self.stats()

        self.assertEqual(stats['books'], 2)
        self.assertEqual(stats['books_read'], 0)

    def test_reviews_and_friends_ignore_inactive_accounts(self):
        book = Book.objects.create(title='Rayuela', status=Book.StatusChoices.PUBLISHED, is_published=True)
        Review.objects.create(user=self.ana, book=book, rating=5, comment='Genial')
        self.befriend(self.ana, self.bruno)
        self.befriend(self.carla, self.ana)
        User.objects.filter(pk=self.carla.pk).update(is_active=False)

        stats = self.stats()

        self.assertEqual((stats['reviews'], stats['friends']), (1, 1))

    def test_is_public_can_be_changed_from_the_profile(self):
        response = self.as_user(self.ana).patch('/api/v1/users/profile/', {'is_public': False}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['is_public'])
        self.assertFalse(Profile.objects.get(user=self.ana).is_public)


class BrindisTests(CommunityAPITestCase):
    def test_only_friends_can_toast_and_it_is_idempotent(self):
        url = f'{API}profiles/{code_of(self.bruno)}/brindis/'
        self.assertEqual(self.as_user(self.ana).post(url).status_code, status.HTTP_403_FORBIDDEN)

        self.befriend(self.ana, self.bruno)
        first = self.client.post(url)
        second = self.client.post(url)
        removed = self.client.delete(url)

        self.assertEqual((first.data['brindis_count'], second.data['brindis_count']), (1, 1))
        self.assertEqual(removed.data['brindis_count'], 0)

    def test_toasting_yourself_does_not_count(self):
        response = self.as_user(self.ana).post(f'{API}profiles/{code_of(self.ana)}/brindis/')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class RankingTests(CommunityAPITestCase):
    def setUp(self):
        super().setUp()
        self.befriend(self.ana, self.bruno)
        Profile.objects.filter(user=self.ana).update(xp=100)
        Profile.objects.filter(user=self.bruno).update(xp=300)
        Profile.objects.filter(user=self.carla).update(xp=9999)  # no es amiga de Ana

    def ranking(self, scope, **params):
        return self.as_user(self.ana).get(f'{API}ranking/', {'scope': scope, **params}).data

    def test_all_time_uses_total_xp_and_only_friends(self):
        data = self.ranking('all')

        self.assertEqual([(e['username'], e['points']) for e in data['entries']], [('bruno', 300), ('ana', 100)])
        self.assertEqual(data['me']['rank'], 2)

    def test_week_counts_only_this_week(self):
        today = timezone.localdate()
        monday = today - timedelta(days=today.weekday())
        DailyActivityLog.objects.create(user=self.ana, date=today, xp_earned=40)
        DailyActivityLog.objects.create(user=self.bruno, date=monday - timedelta(days=1), xp_earned=500)

        data = self.ranking('week')

        self.assertEqual([(e['username'], e['points']) for e in data['entries']], [('ana', 40), ('bruno', 0)])

    def test_ties_share_rank_and_me_is_returned_outside_the_top(self):
        Profile.objects.filter(user=self.ana).update(xp=300)
        self.befriend(self.carla, self.ana)

        data = self.ranking('all', limit=1)

        self.assertEqual(len(data['entries']), 1)
        self.assertEqual(data['me']['rank'], 2)  # carla 9999; ana y bruno empatan en 300
        self.assertEqual(data['participants'], 3)

    def test_invalid_scope(self):
        self.assertEqual(self.as_user(self.ana).get(f'{API}ranking/', {'scope': 'year'}).status_code, 400)

    def test_reward_activity_feeds_the_daily_log(self):
        reward_activity(self.ana, 'chapter_read')
        reward_activity(self.ana, 'chapter_read')

        log = DailyActivityLog.objects.get(user=self.ana, date=timezone.localdate())
        self.assertEqual(log.xp_earned, 20)


class TavernAchievementTests(CommunityAPITestCase):
    def test_first_friend_unlocks_for_both_and_pays_ink(self):
        from library.models import UserAchievement

        ink_before = Profile.objects.get(user=self.bruno).ink_balance
        pk = self.as_user(self.ana).post(f'{API}requests/', {'username': 'bruno'}).data['id']
        self.as_user(self.bruno).post(f'{API}requests/{pk}/accept/')

        for user in (self.ana, self.bruno):
            unlocked = UserAchievement.objects.get(user=user, achievement__code='tavern_first_friend')
            self.assertTrue(unlocked.is_unlocked)
        self.assertEqual(Profile.objects.get(user=self.bruno).ink_balance, ink_before + 10)


class PresenceTests(CommunityAPITestCase):
    def setUp(self):
        super().setUp()
        self.befriend(self.ana, self.bruno)

    def status_of_bruno(self):
        friends = self.as_user(self.ana).get(f'{API}friends/').data['results']
        return friends[0]['status']

    def test_heartbeat_shows_friend_in_the_tavern(self):
        self.as_user(self.bruno).post(f'{API}presence/')

        self.assertEqual(self.status_of_bruno()['kind'], 'tavern')

    def test_recent_reading_progress_shows_the_book(self):
        book = Book.objects.create(title='Rayuela', status=Book.StatusChoices.PUBLISHED, is_published=True)
        inventory = UserInventory.objects.create(user=self.bruno, edition=Edition.objects.create(book=book, price=0))
        ReadingProgress.objects.get_or_create(inventory=inventory)

        status_ = self.status_of_bruno()

        self.assertEqual((status_['kind'], status_['book_title']), ('reading', 'Rayuela'))

    def test_without_activity_friend_is_away(self):
        self.assertEqual(self.status_of_bruno()['kind'], 'away')

    def test_recent_reading_progress_shows_chapter_label(self):
        book = Book.objects.create(title='Cien años de soledad', status=Book.StatusChoices.PUBLISHED, is_published=True)
        inventory = UserInventory.objects.create(user=self.bruno, edition=Edition.objects.create(book=book, price=0))
        progress, _ = ReadingProgress.objects.get_or_create(inventory=inventory)
        progress.current_page = 4
        progress.save(update_fields=['current_page'])

        status_ = self.status_of_bruno()
        self.assertEqual(status_['kind'], 'reading')
        self.assertEqual(status_['book_title'], 'Cien años de soledad')
        self.assertEqual(status_['chapter'], 4)
        self.assertEqual(status_['label'], 'Leyendo · Capítulo 4')


class TavernChatTests(CommunityAPITestCase):
    def setUp(self):
        super().setUp()
        self.befriend(self.ana, self.bruno)

    def test_send_and_list_tavern_messages(self):
        resp = self.as_user(self.ana).post(f'{API}tavern/messages/', {'content': '¡Salud por las letras! 🍺'})
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data['message']['username'], 'ana')
        self.assertEqual(resp.data['message']['content'], '¡Salud por las letras! 🍺')
        self.assertTrue(resp.data['message']['is_me'])

        # Bruno reads the tavern messages
        list_resp = self.as_user(self.bruno).get(f'{API}tavern/messages/')
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)
        messages = list_resp.data['results']
        self.assertEqual(len(messages), 1)
        self.assertEqual(messages[0]['username'], 'ana')
        self.assertFalse(messages[0]['is_me'])
        self.assertNotIn('reactions', messages[0])

    def test_history_limit_is_capped(self):
        start = timezone.now() - timedelta(hours=1)
        for i in range(55):
            msg = TavernMessage.objects.create(user=self.bruno, content=f'Mensaje {i}')
            TavernMessage.objects.filter(pk=msg.pk).update(created_at=start + timedelta(seconds=i))
        client = self.as_user(self.ana)

        self.assertEqual(len(client.get(f'{API}tavern/messages/').data['results']), 30)
        latest = client.get(f'{API}tavern/messages/', {'limit': 500}).data['results']
        self.assertEqual(len(latest), 50)
        self.assertEqual(latest[0]['content'], 'Mensaje 54')

    def test_delete_own_message_and_forbidden_for_others(self):
        resp = self.as_user(self.ana).post(f'{API}tavern/messages/', {'content': 'Mensaje efímero'})
        msg_id = resp.data['message']['id']

        # Bruno attempts to delete Ana's message
        del_forbidden = self.as_user(self.bruno).delete(f'{API}tavern/messages/{msg_id}/')
        self.assertEqual(del_forbidden.status_code, status.HTTP_403_FORBIDDEN)

        # Ana deletes her own message
        del_resp = self.as_user(self.ana).delete(f'{API}tavern/messages/{msg_id}/')
        self.assertEqual(del_resp.status_code, status.HTTP_200_OK)

        # Confirm list is now empty
        list_resp = self.as_user(self.ana).get(f'{API}tavern/messages/')
        self.assertEqual(len(list_resp.data['results']), 0)

    def test_message_cooldown_rate_limit(self):
        self.as_user(self.ana).post(f'{API}tavern/messages/', {'content': 'Primer mensaje'})
        second = self.as_user(self.ana).post(f'{API}tavern/messages/', {'content': 'Segundo mensaje muy rápido'})
        self.assertEqual(second.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(second.data['error'], 'SPAM_COOLDOWN')


class TavernReactionTests(CommunityAPITestCase):
    def test_send_valid_reaction_and_activity(self):
        resp = self.as_user(self.ana).post(f'{API}tavern/reactions/', {'reaction': 'beer'})
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data['reaction']['symbol'], '🍺')
        self.assertEqual(resp.data['reaction']['reaction'], 'beer')

        # Check tavern activity endpoint
        act = self.as_user(self.ana).get(f'{API}tavern/activity/')
        self.assertEqual(act.status_code, status.HTTP_200_OK)
        self.assertTrue(len(act.data['reactions']) >= 1)
        self.assertEqual(act.data['reactions'][0]['reaction'], 'beer')

    def test_reactions_reach_friends_only_and_are_not_stored(self):
        self.befriend(self.ana, self.bruno)
        self.as_user(self.ana).post(f'{API}tavern/reactions/', {'reaction': '❤'})  # corazón sin U+FE0F

        seen_by_bruno = self.as_user(self.bruno).get(f'{API}tavern/activity/').data['reactions']
        seen_by_carla = self.as_user(self.carla).get(f'{API}tavern/activity/').data['reactions']

        self.assertEqual([(r['username'], r['reaction'], r['is_me']) for r in seen_by_bruno], [('ana', 'heart', False)])
        self.assertEqual(seen_by_carla, [])
        self.assertNotIn('tavernreaction', {m._meta.model_name for m in django_apps.get_models()})

    def test_reactions_fade_after_a_few_seconds(self):
        self.as_user(self.ana).post(f'{API}tavern/reactions/', {'reaction': 'clap'})
        later = timezone.now() + timedelta(seconds=25)

        with mock.patch('community.live.timezone.now', return_value=later):
            reactions = self.client.get(f'{API}tavern/activity/').data['reactions']

        self.assertEqual(reactions, [])

    def test_one_reaction_per_second(self):
        client = self.as_user(self.ana)

        first = client.post(f'{API}tavern/reactions/', {'reaction': 'beer'})
        second = client.post(f'{API}tavern/reactions/', {'reaction': 'book'})

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_send_invalid_reaction(self):
        resp = self.as_user(self.ana).post(f'{API}tavern/reactions/', {'reaction': 'rocket_ship'})
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp.data['error'], 'INVALID_REACTION')


class FriendChatTests(CommunityAPITestCase):
    def setUp(self):
        super().setUp()
        self.befriend(self.ana, self.bruno)

    def chat_url(self, user):
        return f'{API}chats/{code_of(user)}/'

    def send(self, sender, recipient, content):
        # Corre los mensajes anteriores para no chocar con la pausa de un segundo.
        FriendMessage.objects.filter(sender=sender).update(created_at=timezone.now() - timedelta(seconds=5))
        return self.as_user(sender).post(self.chat_url(recipient), {'content': content})

    def test_friends_can_talk_and_reading_marks_as_read(self):
        sent = self.send(self.ana, self.bruno, 'Hola, que lees?')
        self.send(self.ana, self.bruno, 'Yo voy por Rayuela.')

        self.assertEqual(sent.status_code, status.HTTP_201_CREATED)
        self.assertTrue(sent.data['item']['is_me'])
        unread = self.as_user(self.bruno).get(f'{API}tavern/activity/').data['chat_unread']
        self.assertEqual(unread, {'total': 2, 'by_friend': {code_of(self.ana): 2}})

        data = self.client.get(self.chat_url(self.ana)).data
        self.assertEqual([m['content'] for m in data['messages']], ['Hola, que lees?', 'Yo voy por Rayuela.'])
        self.assertFalse(data['messages'][0]['is_me'])
        self.assertEqual(self.client.get(f'{API}tavern/activity/').data['chat_unread']['total'], 0)
        self.assertTrue(all(m['read'] for m in self.as_user(self.ana).get(self.chat_url(self.bruno)).data['messages']))

    def test_after_returns_only_newer_messages(self):
        first = self.send(self.ana, self.bruno, 'Uno').data['item']['id']
        self.send(self.bruno, self.ana, 'Dos')

        data = self.as_user(self.ana).get(self.chat_url(self.bruno), {'after': first}).data

        self.assertTrue(data['incremental'])
        self.assertEqual([m['content'] for m in data['messages']], ['Dos'])
        self.assertFalse(self.client.get(self.chat_url(self.bruno), {'after': 'basura'}).data['incremental'])

    def test_only_friends_can_talk(self):
        client = self.as_user(self.ana)

        to_stranger = client.post(self.chat_url(self.carla), {'content': 'Hola'})
        read_stranger = client.get(self.chat_url(self.carla))
        to_self = client.post(self.chat_url(self.ana), {'content': 'Hola'})

        self.assertEqual((to_stranger.status_code, read_stranger.status_code), (403, 403))
        self.assertEqual(to_self.data['error'], 'SELF_CHAT')
        self.assertEqual(client.get(f'{API}chats/ZZZZZZ/').status_code, 404)

    def test_unfriending_hides_the_conversation(self):
        self.send(self.ana, self.bruno, 'Hola')
        Friendship.objects.all().delete()

        self.assertEqual(self.as_user(self.bruno).get(self.chat_url(self.ana)).status_code, 403)
        self.assertEqual(self.client.get(f'{API}tavern/activity/').data['chat_unread']['total'], 0)

    def test_validation_and_cooldown(self):
        client = self.as_user(self.ana)

        empty = client.post(self.chat_url(self.bruno), {'content': '   '})
        too_long = client.post(self.chat_url(self.bruno), {'content': 'a' * 501})
        first = client.post(self.chat_url(self.bruno), {'content': 'Hola'})
        too_fast = client.post(self.chat_url(self.bruno), {'content': 'Hola otra vez'})

        self.assertEqual((empty.data['error'], too_long.data['error']), ('EMPTY_MESSAGE', 'MESSAGE_TOO_LONG'))
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(too_fast.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_threads_list_friends_with_last_message_first(self):
        self.befriend(self.ana, self.carla)
        self.send(self.bruno, self.ana, 'Te guarde un libro')

        data = self.as_user(self.ana).get(f'{API}chats/').data

        self.assertEqual([t['username'] for t in data['threads']], ['bruno', 'carla'])
        self.assertEqual(data['threads'][0]['last_message']['content'], 'Te guarde un libro')
        self.assertEqual((data['threads'][0]['unread'], data['unread_total']), (1, 1))
        self.assertIsNone(data['threads'][1]['last_message'])


class SuggestionTests(CommunityAPITestCase):
    def suggestions(self, user=None):
        return self.as_user(user or self.ana).get(f'{API}suggestions/').data['results']

    def test_lists_every_account_with_its_relation(self):
        self.befriend(self.ana, self.bruno)
        Friendship.objects.create(requester=self.carla, addressee=self.ana)
        Friendship.objects.create(requester=self.ana, addressee=make_user('diego'))
        make_user('dormida', is_active=False)
        make_user('equipo', is_staff=True)
        Profile.objects.filter(user=make_user('reservada')).update(is_public=False)
        rechazo = make_user('rechazo')
        Profile.objects.filter(user=rechazo).update(is_public=False)
        Friendship.objects.create(requester=self.ana, addressee=rechazo, status=Friendship.Status.DECLINED)
        secreta = make_user('secreta')
        Profile.objects.filter(user=secreta).update(is_public=False)
        self.befriend(secreta, self.ana)
        make_user('nueva')

        results = self.suggestions()

        # Primero a quien puedes agregar (los más nuevos antes), luego las solicitudes y al final
        # tus amigos. Fuera: tú, las cuentas inactivas y los privados sin relación contigo.
        self.assertEqual([(s['username'], s['relation']) for s in results], [
            ('nueva', 'none'), ('equipo', 'none'), ('carla', 'incoming'), ('diego', 'outgoing'),
            ('secreta', 'friend'), ('bruno', 'friend'),
        ])
        self.assertEqual(results[2]['reason'], 'Te envió una solicitud')
        self.assertIsNotNone(results[2]['request_id'])
        self.assertEqual(results[3]['reason'], 'Le enviaste una solicitud')

    def test_friends_of_friends_and_shared_genres_come_first(self):
        fantasia = Genre.objects.create(name='Fantasia', slug='fantasia')
        self.befriend(self.ana, self.bruno)
        dario = make_user('dario')
        self.befriend(self.bruno, dario)
        Profile.objects.get(user=self.ana).favorite_genres.add(fantasia)
        Profile.objects.get(user=self.carla).favorite_genres.add(fantasia)
        make_user('zoe')

        results = self.suggestions()

        self.assertEqual([s['username'] for s in results][:2], ['dario', 'carla'])
        self.assertEqual(results[0]['reason'], '1 amigo en común')
        self.assertEqual(results[1]['reason'], 'También le gusta Fantasia')
        self.assertEqual(results[0]['relation'], 'none')


class ReadingClubTestCase(CommunityAPITestCase):
    """Un libro de 6 capítulos que Ana y Bruno leen juntos; Carla no es amiga de Ana."""

    def setUp(self):
        super().setUp()
        self.befriend(self.ana, self.bruno)
        self.book = Book.objects.create(title='La isla del tesoro', status=Book.StatusChoices.PUBLISHED, is_published=True)
        self.edition = Edition.objects.create(book=self.book, price=0)
        for order in range(1, 7):
            Chapter.objects.create(book=self.book, order=order, title=f'Capítulo {order}', content_html='<p>Texto</p>')
        UserInventory.objects.create(user=self.ana, edition=self.edition)

    def read_in_reader(self, user, chapter):
        """Lo que guarda el lector al pasar de página (ReadingProgress.current_page es el capítulo)."""
        inventory, _ = UserInventory.objects.get_or_create(user=user, edition=self.edition)
        progress, _ = ReadingProgress.objects.get_or_create(inventory=inventory)
        progress.current_page = chapter
        progress.save()
        return progress

    def create_club(self, mode='spoiler_safe', friends=()):
        res = self.as_user(self.ana).post(f'{API}clubs/', {
            'book_id': str(self.book.id), 'mode': mode, 'friend_codes': [code_of(f) for f in friends],
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        return res.data['club']['id']

    def member(self, club_id, user):
        return ReadingClubMember.objects.get(club_id=club_id, user=user)


class ReadingClubTests(ReadingClubTestCase):
    def test_create_adds_only_friends_and_starts_where_they_read(self):
        self.read_in_reader(self.bruno, 3)
        club_id = self.create_club(friends=[self.bruno, self.carla])

        members = {m.user_id: m.current_chapter for m in ReadingClubMember.objects.filter(club_id=club_id)}
        self.assertEqual(members, {self.ana.pk: 1, self.bruno.pk: 3})

    def test_book_list_shows_only_my_library(self):
        other = Book.objects.create(title='Moby Dick', status=Book.StatusChoices.PUBLISHED, is_published=True)
        Chapter.objects.create(book=other, order=1, title='Capítulo 1', content_html='<p>Texto</p>')

        res = self.as_user(self.ana).get(f'{API}clubs/books/')

        self.assertEqual([b['id'] for b in res.data['results']], [str(self.book.id)])
        self.assertEqual(res.data['results'][0]['chapters_count'], 6)

    def test_cannot_create_club_with_book_outside_my_library(self):
        res = self.as_user(self.bruno).post(f'{API}clubs/', {'book_id': str(self.book.id)}, format='json')

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data['error'], 'BOOK_NOT_IN_LIBRARY')
        self.assertFalse(ReadingClub.objects.exists())

    def test_strangers_cannot_open_the_club(self):
        club_id = self.create_club(friends=[self.bruno])

        res = self.as_user(self.carla).get(f'{API}clubs/{club_id}/')

        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_spoiler_safe_locks_chapters_ahead_of_my_progress(self):
        club_id = self.create_club(friends=[self.bruno])
        url = f'{API}clubs/{club_id}/chapters/4/messages/'

        locked = self.as_user(self.bruno).get(url)
        self.read_in_reader(self.bruno, 4)
        unlocked = self.as_user(self.bruno).get(url)

        self.assertEqual(locked.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(locked.data['error'], 'CHAPTER_LOCKED')
        self.assertEqual(unlocked.status_code, status.HTTP_200_OK)

    def test_lowering_my_chapter_by_hand_sticks_until_i_read_again(self):
        club_id = self.create_club(friends=[self.bruno])
        self.read_in_reader(self.ana, 5)
        self.assertEqual(self.as_user(self.ana).get(f'{API}clubs/{club_id}/').data['club']['my_chapter'], 5)

        res = self.as_user(self.ana).post(f'{API}clubs/{club_id}/progress/', {'chapter_order': 2}, format='json')
        again = self.as_user(self.ana).get(f'{API}clubs/{club_id}/')

        self.assertEqual(res.data['club']['my_chapter'], 2)
        self.assertEqual(again.data['club']['my_chapter'], 2)

        self.read_in_reader(self.ana, 6)
        self.assertEqual(self.as_user(self.ana).get(f'{API}clubs/{club_id}/').data['club']['my_chapter'], 6)

    def test_friend_sees_my_reader_chapter_in_the_club(self):
        club_id = self.create_club(friends=[self.bruno])
        self.read_in_reader(self.ana, 4)

        members = self.as_user(self.bruno).get(f'{API}clubs/{club_id}/').data['club']['members']

        self.assertEqual({m['username']: m['current_chapter'] for m in members}, {'ana': 4, 'bruno': 1})


class ReadingClubLiveTests(ReadingClubTestCase):
    def setUp(self):
        super().setUp()
        self.club_id = self.create_club(friends=[self.bruno])
        self.live_url = f'{API}clubs/{self.club_id}/live/'

    def report(self, user, **position):
        return self.as_user(user).post(self.live_url, position, format='json')

    def seen_by(self, viewer, username):
        res = self.as_user(viewer).get(self.live_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        return next(m for m in res.data['members'] if m['username'] == username)

    def test_friend_sees_where_i_am_reading_right_now(self):
        res = self.report(self.ana, chapter=3, word=120, fraction=0.42)

        ana = self.seen_by(self.bruno, 'ana')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['poll_ms'], 5000)
        self.assertTrue(ana['reading_now'])
        self.assertEqual((ana['position']['chapter'], ana['position']['word'], ana['position']['fraction']), (3, 120, 0.42))

    def test_reading_now_fades_when_the_reader_stops_reporting(self):
        self.report(self.ana, chapter=2, word=10)

        later = timezone.now() + live.CLUB_LIVE_WINDOW + timedelta(seconds=1)
        with mock.patch('community.live.timezone.now', return_value=later):
            ana = self.seen_by(self.bruno, 'ana')

        self.assertFalse(ana['reading_now'])
        self.assertEqual(ana['position']['chapter'], 2)

    def test_closing_the_reader_keeps_the_last_position(self):
        self.report(self.ana, chapter=2, word=10)

        res = self.as_user(self.ana).delete(self.live_url)
        ana = self.seen_by(self.bruno, 'ana')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(ana['reading_now'])
        self.assertEqual(ana['position']['word'], 10)

    def test_heartbeat_without_position_keeps_the_last_one(self):
        self.report(self.ana, chapter=4, word=7, fraction=0.5)
        self.as_user(self.ana).delete(self.live_url)

        self.report(self.ana)
        ana = self.seen_by(self.bruno, 'ana')

        self.assertTrue(ana['reading_now'])
        self.assertEqual((ana['position']['chapter'], ana['position']['word']), (4, 7))

    def test_reading_ahead_moves_my_club_chapter_but_going_back_does_not(self):
        self.report(self.bruno, chapter=5, word=0)
        self.report(self.bruno, chapter=2, word=0)

        self.assertEqual(self.member(self.club_id, self.bruno).current_chapter, 5)
        res = self.as_user(self.bruno).get(f'{API}clubs/{self.club_id}/chapters/5/messages/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_invalid_positions_are_rejected(self):
        for position in ({'chapter': 7}, {'chapter': 0}, {'chapter': 'dos'}):
            res = self.report(self.ana, **position)
            self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST, position)
            self.assertEqual(res.data['error'], 'INVALID_POSITION')

    def test_odd_word_and_fraction_are_cleaned(self):
        self.report(self.ana, chapter=1, word=-3, fraction=9)

        position = self.seen_by(self.bruno, 'ana')['position']

        self.assertEqual((position['word'], position['fraction']), (None, 1.0))

    def test_only_members_follow_the_live_reading(self):
        for method in ('get', 'post', 'delete'):
            res = getattr(self.as_user(self.carla), method)(self.live_url)
            self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND, method)

    def test_club_detail_marks_who_is_reading_now(self):
        self.report(self.bruno, chapter=1, word=3)

        members = self.as_user(self.ana).get(f'{API}clubs/{self.club_id}/').data['club']['members']

        self.assertEqual({m['username']: m['reading_now'] for m in members}, {'ana': False, 'bruno': True})

    def test_reader_finds_my_clubs_for_the_open_book(self):
        other = Book.objects.create(title='Otro libro', status=Book.StatusChoices.PUBLISHED, is_published=True)

        mine = self.as_user(self.bruno).get(f'{API}clubs/by-book/{self.book.id}/').data['results']
        none = self.as_user(self.bruno).get(f'{API}clubs/by-book/{other.id}/').data['results']
        stranger = self.as_user(self.carla).get(f'{API}clubs/by-book/{self.book.id}/').data['results']

        self.assertEqual([c['id'] for c in mine], [self.club_id])
        self.assertEqual((none, stranger), ([], []))
