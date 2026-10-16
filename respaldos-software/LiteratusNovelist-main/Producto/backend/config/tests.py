"""Regresiones de configuración local y cabeceras CORS del navegador."""
import os
from pathlib import Path
import runpy
from unittest.mock import patch

from django.test import SimpleTestCase, override_settings


class LocalFrontendCorsTests(SimpleTestCase):
    @staticmethod
    def configured_origins(debug):
        # Reproduce una lista explícita que omite loopback sin leerla ni exponerla.
        with patch.dict(os.environ, {
            'DEBUG': 'True' if debug else 'False',
            'CORS_ALLOWED_ORIGINS': 'https://lectura.example',
        }):
            namespace = runpy.run_path(str(Path(__file__).with_name('settings.py')))
        return namespace['CORS_ALLOWED_ORIGINS']

    def preflight(self, origin, path, method):
        return self.client.options(
            path,
            HTTP_ORIGIN=origin,
            HTTP_ACCESS_CONTROL_REQUEST_METHOD=method,
            HTTP_ACCESS_CONTROL_REQUEST_HEADERS='authorization,content-type',
        )

    def test_both_local_frontends_can_send_authenticated_tavern_requests(self):
        with override_settings(CORS_ALLOWED_ORIGINS=self.configured_origins(True),
                               CORS_ALLOW_ALL_ORIGINS=False):
            for origin in ('http://localhost:4200', 'http://127.0.0.1:4200'):
                for path, method in (('/api/v1/community/me/', 'GET'),
                                     ('/api/v1/community/presence/', 'POST')):
                    with self.subTest(origin=origin, path=path):
                        response = self.preflight(origin, path, method)
                        self.assertEqual(response.status_code, 200)
                        self.assertEqual(response['Access-Control-Allow-Origin'], origin)
                        allowed_headers = response['Access-Control-Allow-Headers'].lower().split(', ')
                        self.assertTrue({'authorization', 'content-type'}.issubset(allowed_headers))
                        self.assertIn(method, response['Access-Control-Allow-Methods'])

    def test_debug_does_not_allow_unconfigured_external_frontends(self):
        with override_settings(CORS_ALLOWED_ORIGINS=self.configured_origins(True),
                               CORS_ALLOW_ALL_ORIGINS=False):
            response = self.preflight('https://untrusted.example', '/api/v1/community/me/', 'GET')
            self.assertNotIn('Access-Control-Allow-Origin', response)

    def test_production_keeps_configured_origins_without_adding_loopback(self):
        origins = self.configured_origins(False)
        self.assertEqual(origins, ['https://lectura.example'])
        with override_settings(CORS_ALLOWED_ORIGINS=origins, CORS_ALLOW_ALL_ORIGINS=False):
            for origin in ('http://localhost:4200', 'http://127.0.0.1:4200'):
                response = self.preflight(origin, '/api/v1/community/me/', 'GET')
                self.assertNotIn('Access-Control-Allow-Origin', response)
