import json
from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework.throttling import ScopedRateThrottle

from catalog.models import Book
from library.models import UserInventory
from . import guests
from .models import Profile

GUEST = '/api/v1/users/guest/'
PING = '/api/v1/users/guest/ping/'
LEAVE = '/api/v1/users/guest/leave/'
ME = '/api/v1/users/me/'
REGISTER = '/api/v1/users/register/'


class GuestAccountTests(APITestCase):
    def setUp(self):
        cache.clear()  # el límite por IP se guarda en la caché

    def start(self):
        response = self.client.post(GUEST)
        self.assertEqual(response.status_code, 201, response.data)
        return response.data

    def user_of(self, data):
        return get_user_model().objects.get(pk=data['user']['id'])

    def auth(self, data):
        self.client.credentials(HTTP_AUTHORIZATION='Bearer ' + data['access'])

    def age(self, user, *, idle=timedelta(0), joined=timedelta(0)):
        now = timezone.now()
        get_user_model().objects.filter(pk=user.pk).update(last_login=now - idle, date_joined=now - joined)

    def test_each_click_is_a_new_adult_reader_without_admin_rights(self):
        first, second = self.start(), self.start()
        self.assertNotEqual(first['user']['id'], second['user']['id'])
        user = self.user_of(first)
        self.assertTrue(first['user']['is_guest'])
        self.assertTrue(first['user']['has_completed_onboarding'])
        self.assertFalse(user.is_staff or user.is_superuser)
        self.assertFalse(user.has_usable_password())
        profile = Profile.objects.get(user=user)
        self.assertEqual(profile.birth_date, guests.GUEST_BIRTH_DATE)
        self.assertFalse(profile.is_public)
        # Con su token entra a lo que requiere sesión, pero no al panel de administración.
        self.auth(first)
        self.assertEqual(self.client.get(ME).status_code, 200)
        self.assertEqual(self.client.get('/api/v1/dashboard/users/').status_code, 403)

    def test_ping_keeps_it_alive_and_sweep_leaves_it_alone(self):
        data = self.start()
        user = self.user_of(data)
        self.age(user, idle=timedelta(minutes=2, seconds=50))
        self.auth(data)
        self.assertEqual(self.client.post(PING).status_code, 204)
        self.assertEqual(guests.sweep(), 0)
        self.assertTrue(get_user_model().objects.filter(pk=user.pk).exists())

    def test_closing_the_page_deletes_it_after_the_grace_unless_it_comes_back(self):
        data = self.start()
        user = self.user_of(data)
        # sendBeacon: texto plano, sin cabeceras, con el token en el cuerpo.
        body = json.dumps({'token': data['access']})
        self.assertEqual(self.client.post(LEAVE, body, content_type='text/plain').status_code, 204)
        self.assertEqual(guests.sweep(), 0)  # dentro del margen: podría ser una recarga
        # Recargó: el primer latido la revive.
        self.auth(data)
        self.client.post(PING)
        self.assertEqual(guests.sweep(timezone.now() + guests.LEAVE_GRACE + timedelta(seconds=5)), 0)
        # Ahora la cerró de verdad.
        self.client.credentials()
        self.client.post(LEAVE, body, content_type='text/plain')
        self.assertEqual(guests.sweep(timezone.now() + guests.LEAVE_GRACE + timedelta(seconds=5)), 1)
        self.assertFalse(get_user_model().all_objects.filter(pk=user.pk).exists())

    def test_signing_out_deletes_it_at_once(self):
        data = self.start()
        self.auth(data)
        self.assertEqual(self.client.post(LEAVE, {'final': True}, format='json').status_code, 204)
        self.assertFalse(get_user_model().all_objects.filter(pk=data['user']['id']).exists())
        # Su token ya no sirve.
        self.assertEqual(self.client.get(ME).status_code, 401)

    def test_sweep_deletes_idle_and_old_guests_with_their_data_but_not_real_accounts(self):
        idle, old, fresh = self.user_of(self.start()), self.user_of(self.start()), self.user_of(self.start())
        self.age(idle, idle=guests.INACTIVE_AFTER + timedelta(seconds=1))
        self.age(old, joined=guests.MAX_AGE + timedelta(seconds=1))
        real = get_user_model().objects.create_user(username='lectora', email='lectora@example.com', password='Clave2026!')
        get_user_model().objects.filter(pk=real.pk).update(last_login=timezone.now() - timedelta(days=30))
        pending = Book.objects.create(title='Mi novela', submitted_by=idle, status=Book.StatusChoices.PENDING_REVIEW)
        published = Book.objects.create(title='Ya publicada', submitted_by=idle, status=Book.StatusChoices.PUBLISHED)
        edition = published.editions.create(price=0)
        UserInventory.objects.create(user=idle, edition=edition)

        self.assertEqual(guests.sweep(), 2)
        remaining = set(get_user_model().all_objects.values_list('pk', flat=True))
        self.assertNotIn(idle.pk, remaining)
        self.assertNotIn(old.pk, remaining)
        self.assertIn(fresh.pk, remaining)
        self.assertIn(real.pk, remaining)
        self.assertFalse(UserInventory.all_objects.filter(user_id=idle.pk).exists())
        self.assertFalse(Book.all_objects.filter(pk=pending.pk).exists())
        self.assertTrue(Book.all_objects.filter(pk=published.pk).exists())

    def test_guests_cannot_pay_with_real_money(self):
        self.auth(self.start())
        for url, body in (('/api/v1/finance/subscription/subscribe/', {'plan_code': 'maestro'}),
                          ('/api/v1/finance/pay/', {'item_type': 'ink', 'item_reference': '200'})):
            response = self.client.post(url, body, format='json')
            self.assertEqual(response.status_code, 403, url)
            self.assertEqual(response.data['code'], 'guest_no_payments')

    def test_the_guest_domain_is_reserved(self):
        response = self.client.post(REGISTER, {
            'username': 'colado', 'email': 'colado@invitado.literatus', 'password': 'LecturaSegura2026!',
            'birth_date': '2001-02-03'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('email', response.data)
        # Y un invitado no se vuelve permanente cambiando su correo.
        self.auth(self.start())
        self.assertEqual(self.client.patch(ME, {'email': 'mio@example.com'}, format='json').status_code, 400)

    def test_ping_and_leave_ignore_real_accounts(self):
        real = get_user_model().objects.create_user(username='lector', email='lector@example.com', password='Clave2026!')
        self.client.force_authenticate(real)
        self.assertEqual(self.client.post(PING).status_code, 204)
        self.client.post(LEAVE, {'final': True}, format='json')
        self.assertTrue(get_user_model().objects.filter(pk=real.pk).exists())

    @mock.patch.object(guests, 'MAX_ALIVE', 2)
    def test_too_many_open_guests_waits_for_a_spot(self):
        first = self.user_of(self.start())
        self.start()
        response = self.client.post(GUEST)
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data['code'], 'guest_limit')
        # Cuando uno cierra su página y vence, hay cupo otra vez.
        self.age(first, idle=guests.INACTIVE_AFTER + timedelta(seconds=1))
        self.assertEqual(self.client.post(GUEST).status_code, 201)

    def test_creation_is_rate_limited_per_ip(self):
        with mock.patch.object(ScopedRateThrottle, 'THROTTLE_RATES', {'guest_create': '2/hour'}):
            self.start()
            self.start()
            self.assertEqual(self.client.post(GUEST).status_code, 429)
