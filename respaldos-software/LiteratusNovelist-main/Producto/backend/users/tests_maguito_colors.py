"""El color del Maguito: se elige al crear la cuenta, se edita en el perfil y lo ven los amigos."""
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from catalog.models import Genre
from community.models import Friendship

from .models import Profile

User = get_user_model()
PROFILE = '/api/v1/users/profile/'
ONBOARDING = '/api/v1/users/onboarding/'
GREEN = {'bodyA': '#7EE081', 'bodyB': '#1f8f5f', 'capeA': '#c8f7c5'}
GREEN_SAVED = {'bodyA': '#7ee081', 'bodyB': '#1f8f5f', 'capeA': '#c8f7c5'}


def make_user(name):
    return User.objects.create_user(username=name, email=f'{name}@example.com', password='StrongPassword123!')


def outfit_of(user):
    return Profile.objects.get(user=user).outfit


class ProfileColorTests(APITestCase):
    def setUp(self):
        self.user = make_user('tintera')
        self.client.force_authenticate(self.user)

    def test_saving_keeps_the_clothes_and_returns_the_outfit(self):
        Profile.objects.filter(user=self.user).update(outfit={'head': 'crown'})

        response = self.client.patch(PROFILE, {'maguito_colors': GREEN}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['outfit'], {'head': 'crown', 'colors': GREEN_SAVED})
        self.assertNotIn('maguito_colors', response.data)
        self.assertEqual(outfit_of(self.user), {'head': 'crown', 'colors': GREEN_SAVED})

    def test_null_and_empty_go_back_to_the_classic_maguito(self):
        for classic in (None, {}):
            Profile.objects.filter(user=self.user).update(outfit={'head': 'crown', 'colors': GREEN_SAVED})

            response = self.client.patch(PROFILE, {'maguito_colors': classic}, format='json')

            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertEqual(outfit_of(self.user), {'head': 'crown'})

    def test_invalid_colors_are_rejected_and_nothing_changes(self):
        for bad in ('#12345', 'red', 'url(x)', '#12345g', 'var(--x)', 7, None, '#123456\n'):
            response = self.client.patch(PROFILE, {'maguito_colors': {'bodyA': bad}}, format='json')

            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, bad)
            self.assertIn('maguito_colors', response.data)
        self.assertEqual(self.client.patch(PROFILE, {'maguito_colors': 'verde'}, format='json').status_code,
                         status.HTTP_400_BAD_REQUEST)
        self.assertEqual(outfit_of(self.user), {})

    def test_unknown_parts_are_ignored(self):
        self.client.patch(PROFILE, {'maguito_colors': {'bodyA': '#112233', 'tail': '#445566'}}, format='json')

        self.assertEqual(outfit_of(self.user), {'colors': {'bodyA': '#112233'}})

    def test_the_rest_of_the_outfit_stays_read_only(self):
        self.client.patch(PROFILE, {'outfit': {'colors': GREEN, 'head': 'crown'}}, format='json')

        self.assertEqual(outfit_of(self.user), {})

    def test_a_profile_edit_without_colors_keeps_them(self):
        Profile.objects.filter(user=self.user).update(outfit={'colors': GREEN_SAVED})

        self.client.patch(PROFILE, {'tagline': 'Lectora verde'}, format='json')

        self.assertEqual(outfit_of(self.user), {'colors': GREEN_SAVED})

    def test_changing_clothes_keeps_the_color(self):
        Profile.objects.filter(user=self.user).update(ink_balance=1000, outfit={'colors': GREEN_SAVED})

        bought = self.client.post('/api/v1/learning/shop/buy/', {'item_code': 'wear_head_hood'}, format='json')
        self.assertEqual(bought.data['outfit'], {'colors': GREEN_SAVED, 'head': 'hood'})

        removed = self.client.post('/api/v1/learning/shop/unequip/', {'slot': 'head'}, format='json')
        self.assertEqual(removed.data['outfit'], {'colors': GREEN_SAVED})


class OnboardingColorTests(APITestCase):
    def setUp(self):
        self.user = make_user('novata')
        self.client.force_authenticate(self.user)
        self.genres = [str(Genre.objects.create(name=name, slug=name).id) for name in ('uno', 'dos', 'tres')]

    def finish(self, **extra):
        return self.client.post(ONBOARDING, {'role': 'reader', 'favorite_genres': self.genres, **extra}, format='json')

    def test_the_chosen_color_is_saved_with_the_rest_of_the_onboarding(self):
        response = self.finish(maguito_colors=GREEN)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['profile']['outfit'], {'colors': GREEN_SAVED})
        self.assertTrue(Profile.objects.get(user=self.user).has_completed_onboarding)

    def test_without_a_color_the_maguito_stays_classic(self):
        self.assertEqual(self.finish().status_code, status.HTTP_200_OK)
        self.assertEqual(outfit_of(self.user), {})
        self.assertTrue(Profile.objects.get(user=self.user).has_completed_onboarding)

    def test_an_invalid_color_does_not_finish_the_onboarding(self):
        response = self.finish(maguito_colors={'bodyA': 'verde'})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Profile.objects.get(user=self.user).has_completed_onboarding)


class FriendsSeeTheColorTests(APITestCase):
    def setUp(self):
        self.ana = make_user('ana')
        self.bruno = make_user('bruno')
        self.as_ana = APIClient()
        self.as_ana.force_authenticate(self.ana)
        self.as_bruno = APIClient()
        self.as_bruno.force_authenticate(self.bruno)
        self.as_bruno.patch(PROFILE, {'maguito_colors': GREEN}, format='json')
        self.code = Profile.objects.get(user=self.bruno).friend_code

    def test_in_the_friend_list_and_on_the_card(self):
        Friendship.objects.create(requester=self.ana, addressee=self.bruno, status=Friendship.Status.ACCEPTED)

        friends = self.as_ana.get('/api/v1/community/friends/').data['results']
        card = self.as_ana.get(f'/api/v1/community/profiles/{self.code}/').data

        self.assertEqual(friends[0]['outfit']['colors'], GREEN_SAVED)
        self.assertEqual(card['outfit']['colors'], GREEN_SAVED)

    def test_on_the_minimal_card_of_a_private_profile(self):
        Profile.objects.filter(user=self.bruno).update(is_public=False)

        card = self.as_ana.get(f'/api/v1/community/profiles/{self.code}/').data

        self.assertFalse(card['full'])
        self.assertEqual(card['outfit']['colors'], GREEN_SAVED)
