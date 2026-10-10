"""Local test/preview settings: never connect to the shared Supabase database."""
from .settings import *  # noqa: F403
import os
DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': os.environ.get('LITERATUS_TEST_DB', ':memory:')}}
if os.environ.get('LITERATUS_TEST_DATABASE_URL'):
    from urllib.parse import urlparse
    test_url = os.environ['LITERATUS_TEST_DATABASE_URL']
    if not urlparse(test_url).path.lstrip('/').startswith('literatus_test'):
        raise ValueError('La base aislada PostgreSQL debe llamarse literatus_test…')
    DATABASES = {'default': env.db_url('LITERATUS_TEST_DATABASE_URL')}
PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']
EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
if os.environ.get('LITERATUS_PREVIEW_EMAIL_DIR'):
    EMAIL_BACKEND = 'django.core.mail.backends.filebased.EmailBackend'
    EMAIL_FILE_PATH = os.environ['LITERATUS_PREVIEW_EMAIL_DIR']
ALLOWED_HOSTS = ['testserver', 'localhost', '127.0.0.1']
DEBUG = True
CORS_ALLOWED_ORIGINS = ['http://localhost:4300', 'http://127.0.0.1:4300']
