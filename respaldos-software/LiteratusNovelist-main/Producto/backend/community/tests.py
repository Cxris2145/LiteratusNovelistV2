import importlib
from datetime import timedelta

from django.apps import apps as django_apps
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from catalog.models import Book, Edition
from learning.models import DailyActivityLog
from library.achievement_engine import reward_activity
from library.models import ReadingProgress, UserInventory
from users.models import FRIEND_CODE_ALPHABET, Profile

from .models import Brindis, Friendship

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
    def test_strangers_only_see_the_minimal_card(self):
        Profile.objects.filter(user=self.bruno).update(bio='Secreto', tagline='Hola')

        data = self.as_user(self.ana).get(f'{API}profiles/{code_of(self.bruno)}/').data

        self.assertEqual(set(data), {'full', 'friend_code', 'username', 'outfit', 'relation', 'request_id'})
        self.assertFalse(data['full'])

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

    def test_me_includes_code_stats_and_pending(self):
        self.as_user(self.bruno).post(f'{API}requests/', {'username': 'ana'})

        data = self.as_user(self.ana).get(f'{API}me/').data

        self.assertEqual(data['friend_code'], code_of(self.ana))
        self.assertEqual(data['pending_incoming'], 1)
        self.assertEqual(set(data['stats']), {'books_read', 'reviews', 'friends', 'brindis'})


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
