"""Vista local con SQLite aislada y el proveedor real de correo configurado en .env."""
from .test_settings import *  # noqa: F403
from django.conf import global_settings

# Las pruebas conservan locmem/filebased; solo este servidor usa SMTP o Resend.
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
FRONTEND_URL = 'http://127.0.0.1:4300'

# Las cuentas creadas desde la página usan los hashers normales de Django.
# MD5 solo permite iniciar sesión con las cuentas ficticias ya sembradas.
PASSWORD_HASHERS = [*global_settings.PASSWORD_HASHERS, 'django.contrib.auth.hashers.MD5PasswordHasher']
