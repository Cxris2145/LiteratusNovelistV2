"""
Configuración principal de Django para el proyecto Literatus Novelist.

Generado con 'django-admin startproject' y adaptado siguiendo
los estándares de Clean Code, PEP 8 y seguridad en entornos de producción.

Para más información sobre este archivo:
    https://docs.djangoproject.com/en/6.0/topics/settings/
"""

import environ
from pathlib import Path
from datetime import timedelta

# ---------------------------------------------------------------------------
# Rutas base del proyecto
# ---------------------------------------------------------------------------

# Directorio raíz del backend (donde vive manage.py)
BASE_DIR = Path(__file__).resolve().parent.parent

# ---------------------------------------------------------------------------
# Configuración de variables de entorno con django-environ
# ---------------------------------------------------------------------------

env = environ.Env(
    DEBUG=(bool, True),
)
environ.Env.read_env(BASE_DIR / '.env')

# ---------------------------------------------------------------------------
# Ajustes de seguridad
# ---------------------------------------------------------------------------

SECRET_KEY = env('SECRET_KEY')
DEBUG = env.bool('DEBUG', default=False)
ALLOWED_HOSTS = env.list('ALLOWED_HOSTS', default=['*'])

# ---------------------------------------------------------------------------
# Aplicaciones instaladas
# ---------------------------------------------------------------------------

INSTALLED_APPS = [
    # Aplicaciones nativas de Django
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Aplicaciones de terceros
    'rest_framework',
    'rest_framework_simplejwt',
    'drf_spectacular',
    'corsheaders',
    'django_filters',
    # Aplicaciones propias
    'core',
    'users.apps.UsersConfig',
    'catalog.apps.CatalogConfig',
    'finance.apps.FinanceConfig',
    'library.apps.LibraryConfig',
    'ai_engine.apps.AiEngineConfig',
    'dashboard',
]

# Modelo de usuario personalizado
AUTH_USER_MODEL = 'users.User'

# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

# ---------------------------------------------------------------------------
# URLs y WSGI
# ---------------------------------------------------------------------------

ROOT_URLCONF = 'config.urls'
WSGI_APPLICATION = 'config.wsgi.application'

# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

# ---------------------------------------------------------------------------
# Base de datos — PostgreSQL vía DATABASE_URL en .env
# ---------------------------------------------------------------------------

DATABASES = {
    'default': env.db(),
}

# ---------------------------------------------------------------------------
# Validación de contraseñas
# ---------------------------------------------------------------------------

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# ---------------------------------------------------------------------------
# Internacionalización
# ---------------------------------------------------------------------------

LANGUAGE_CODE = 'es-pe'
TIME_ZONE = 'America/Lima'
USE_I18N = True
USE_TZ = True

# ---------------------------------------------------------------------------
# Archivos estáticos y media
# ---------------------------------------------------------------------------

STATIC_URL = 'static/'

# Si tenemos Supabase configurado, usamos su URL publica para los media files
SUPABASE_URL = env('SUPABASE_URL', default=None)
if SUPABASE_URL:
    MEDIA_URL = f"{SUPABASE_URL}/storage/v1/object/public/literatus-media/"
else:
    MEDIA_URL = '/media/'

MEDIA_ROOT = BASE_DIR / 'media'
PRIVATE_MEDIA_ROOT = BASE_DIR / 'private_media'

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------

CORS_ALLOWED_ORIGINS = env.list('CORS_ALLOWED_ORIGINS', default=[
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:4200',
    'http://192.168.1.8:4200',
    'capacitor://localhost',
    'http://localhost',
])
# Desactivado para producción (Seguridad)
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOW_CREDENTIALS = True

# Flags de seguridad estrictos (activos cuando DEBUG=False en producción)
if not DEBUG:
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_BROWSER_XSS_FILTER = True
    SECURE_CONTENT_TYPE_NOSNIFF = True

# ---------------------------------------------------------------------------
# Django REST Framework
# ---------------------------------------------------------------------------

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticatedOrReadOnly',
    ],
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    # ── Paginación global: 12 por página, máx 50 ──────────────────────────────
    'DEFAULT_PAGINATION_CLASS': 'core.pagination.StandardResultsSetPagination',
    'PAGE_SIZE': 12,
    # ── Filtros globales: búsqueda y ordenamiento disponibles en todos los VSet
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
}

# ---------------------------------------------------------------------------
# drf-spectacular (Swagger UI)
# ---------------------------------------------------------------------------

SPECTACULAR_SETTINGS = {
    'TITLE': 'Literatus Novelist API',
    'DESCRIPTION': 'Documentación oficial de la API de Literatus Novelist.',
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
    'SECURITY': [{'jwtAuth': []}],
    'COMPONENT_SPLIT_REQUEST': True,
}

# ---------------------------------------------------------------------------
# SimpleJWT
# ---------------------------------------------------------------------------

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(days=1),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'UPDATE_LAST_LOGIN': True,
    'ALGORITHM': 'HS256',
    'SIGNING_KEY': SECRET_KEY,
    'AUTH_HEADER_TYPES': ('Bearer',),
}

# ---------------------------------------------------------------------------
# PK por defecto
# ---------------------------------------------------------------------------

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ---------------------------------------------------------------------------
# Inteligencia Artificial
# ---------------------------------------------------------------------------

GOOGLE_API_KEY = env('GOOGLE_API_KEY', default=None)
GOOGLE_API_KEY_2 = env('GOOGLE_API_KEY_2', default=None)
DEEPSEEK_API_KEY = env('DEEPSEEK_API_KEY', default=None)

# ---------------------------------------------------------------------------
# Webpay / Transbank
# ---------------------------------------------------------------------------

WEBPAY_COMMERCE_CODE = env('WEBPAY_COMMERCE_CODE', default='597055555532')
WEBPAY_API_KEY = env('WEBPAY_API_KEY', default='579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C')
WEBPAY_ENVIRONMENT = env('WEBPAY_ENVIRONMENT', default='INTEGRACION')
WEBPAY_RETURN_URL = env('WEBPAY_RETURN_URL', default='http://localhost:8000/api/v1/finance/confirm/')
FRONTEND_URL = env('FRONTEND_URL', default='http://localhost:4200')
ELEVENLABS_API_KEY = env('ELEVENLABS_API_KEY', default='PLACEHOLDER_KEY')

# ---------------------------------------------------------------------------
# Correos / SMTP (Resend o SendGrid)
# ---------------------------------------------------------------------------

EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = env('EMAIL_HOST', default='smtp.resend.com')
EMAIL_PORT = env.int('EMAIL_PORT', default=465)
EMAIL_USE_SSL = env.bool('EMAIL_USE_SSL', default=True)
EMAIL_USE_TLS = env.bool('EMAIL_USE_TLS', default=False)
EMAIL_HOST_USER = env('EMAIL_HOST_USER', default='resend')
EMAIL_HOST_PASSWORD = env('EMAIL_HOST_PASSWORD', default='')
DEFAULT_FROM_EMAIL = env('DEFAULT_FROM_EMAIL', default='no-reply@novelatus.tech')

# Auto-reload trigger
