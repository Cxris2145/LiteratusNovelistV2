import json
from unittest import mock

from django.contrib.auth import get_user_model
from django.core import mail
from django.test import TestCase, override_settings

from .utils import email_is_configured, send_password_reset_code_email

SMTP = 'django.core.mail.backends.smtp.EmailBackend'
SCRIPT_URL = 'https://script.google.com/macros/s/prueba/exec'
SECRET = 's' * 48


def provider_reply(body):
    urlopen = mock.MagicMock()
    urlopen.return_value.__enter__.return_value.read.return_value = body
    return urlopen


@override_settings(EMAIL_BACKEND=SMTP, EMAIL_HOST_PASSWORD='re_no-es-real',
                   DEFAULT_FROM_EMAIL='Literatus <onboarding@resend.dev>',
                   APPS_SCRIPT_MAIL_URL=SCRIPT_URL, APPS_SCRIPT_MAIL_SECRET=SECRET)
class AppsScriptMailTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username='lectora', email='lectora@gmail.com', password='LecturaSegura2026!')

    def test_sends_through_apps_script_before_resend(self):
        urlopen = provider_reply(b'{"ok": true, "remaining": 99}')
        with mock.patch('users.utils.urllib.request.urlopen', urlopen):
            send_password_reset_code_email(self.user, '123456', 10)

        urlopen.assert_called_once()
        request = urlopen.call_args.args[0]
        self.assertEqual(request.full_url, SCRIPT_URL)
        self.assertEqual(request.get_method(), 'POST')
        payload = json.loads(request.data)
        self.assertEqual(payload['secret'], SECRET)
        self.assertEqual(payload['to'], 'lectora@gmail.com')
        self.assertEqual(payload['name'], 'Literatus')
        self.assertIn('123456', payload['text'])
        self.assertIn('123456', payload['html'])

    def test_rejected_or_unexpected_reply_raises(self):
        for body, hint in ((b'{"ok": false, "error": "unauthorized"}', 'unauthorized'),
                           (b'<html>Inicia sesion</html>', 'Cualquier usuario')):
            with mock.patch('users.utils.urllib.request.urlopen', provider_reply(body)):
                with self.assertRaisesRegex(Exception, hint):
                    send_password_reset_code_email(self.user, '123456', 10)

    @override_settings(APPS_SCRIPT_MAIL_URL='', APPS_SCRIPT_MAIL_SECRET='')
    def test_without_apps_script_keeps_using_resend(self):
        urlopen = provider_reply(b'{}')
        with mock.patch('users.utils.urllib.request.urlopen', urlopen):
            send_password_reset_code_email(self.user, '123456', 10)
        self.assertEqual(urlopen.call_args.args[0].full_url, 'https://api.resend.com/emails')

    @override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
    def test_test_backends_never_call_apps_script(self):
        with mock.patch('users.utils.urllib.request.urlopen') as urlopen:
            send_password_reset_code_email(self.user, '123456', 10)
        urlopen.assert_not_called()
        self.assertEqual(len(mail.outbox), 1)

    @override_settings(EMAIL_HOST_PASSWORD='')
    def test_apps_script_alone_counts_as_configured(self):
        self.assertTrue(email_is_configured())
        with self.settings(APPS_SCRIPT_MAIL_URL=''):
            self.assertFalse(email_is_configured())
