from datetime import date

from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework.test import APITestCase

from catalog.models import Book

User = get_user_model()


class ExploreAudienceFilterTests(APITestCase):
    """Explorar: botones "+18" / "-18" (?audience=adult|general) dentro de lo que cada lector puede ver."""

    def setUp(self):
        cache.clear()
        self.adult = self.make_user('adulta', date(1990, 5, 1))
        self.minor = self.make_user('menor', date(date.today().year - 15, 1, 1))
        for title, min_age in (('Para todos', 0), ('Desde trece', 13), ('Para adultos', 18)):
            Book.objects.create(title=title, min_age=min_age, is_published=True, status=Book.StatusChoices.PUBLISHED)

    def make_user(self, name, birth_date):
        user = User.objects.create_user(username=name, email=f'{name}@example.com', password='StrongPassword123!')
        user.profile.birth_date = birth_date
        user.profile.save(update_fields=['birth_date'])
        return user

    def titles(self, audience=''):
        response = self.client.get('/api/v1/catalog/books/', {'audience': audience} if audience else {})
        self.assertEqual(response.status_code, 200)
        return sorted(b['title'] for b in response.data['results'])

    def test_adult_can_split_the_catalog(self):
        self.client.force_authenticate(self.adult)
        self.assertEqual(self.titles(), ['Desde trece', 'Para adultos', 'Para todos'])
        self.assertEqual(self.titles('adult'), ['Para adultos'])
        self.assertEqual(self.titles('general'), ['Desde trece', 'Para todos'])

    def test_minor_asking_for_adult_books_gets_none(self):
        self.client.force_authenticate(self.minor)
        self.assertEqual(self.titles('adult'), [])
        self.client.force_authenticate(None)
        self.assertEqual(self.titles('adult'), [])
