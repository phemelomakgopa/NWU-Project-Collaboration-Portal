"""
Django settings for the Project Collaboration Portal backend.

Secrets and environment-specific values are read from environment variables.
For local development nothing needs to be set: the app runs with DEBUG on and
a local SQLite database. In production (e.g. Render) set at least:

    DJANGO_SECRET_KEY, DJANGO_DEBUG=False,
    DB_HOST, DB_NAME, DB_USER, DB_PASSWORD (and optionally DB_PORT)
"""

import os
import mimetypes
from datetime import timedelta
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent

ON_RENDER = bool(os.environ.get('RENDER'))


def env_bool(name, default):
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in ('1', 'true', 'yes', 'on')


def env_list(name, default):
    value = os.environ.get(name)
    if not value:
        return default
    return [item.strip() for item in value.split(',') if item.strip()]


DEBUG = env_bool('DJANGO_DEBUG', default=not ON_RENDER)

SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', '')
if not SECRET_KEY:
    if not DEBUG:
        raise ImproperlyConfigured('DJANGO_SECRET_KEY must be set when DEBUG is off.')
    SECRET_KEY = 'dev-only-insecure-key-do-not-use-in-production'

ALLOWED_HOSTS = env_list('DJANGO_ALLOWED_HOSTS', [
    'localhost',
    '127.0.0.1',
    'pcp-backend-f4a2.onrender.com',
])

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'corsheaders',
    'pcp_webapp',
    'django_cleanup',  # Deletes stored files when their Document row is deleted
]

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

ROOT_URLCONF = 'pcp_backend.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'pcp_backend.wsgi.application'

# Database: PostgreSQL when DB_HOST is configured, otherwise local SQLite.
if os.environ.get('DB_HOST'):
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.environ.get('DB_NAME', 'postgres'),
            'USER': os.environ.get('DB_USER', 'postgres'),
            'PASSWORD': os.environ.get('DB_PASSWORD', ''),
            'HOST': os.environ['DB_HOST'],
            'PORT': os.environ.get('DB_PORT', '5432'),
        }
    }
elif ON_RENDER:
    raise ImproperlyConfigured('DB_HOST and related database variables must be set on Render.')
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': os.environ.get('SQLITE_PATH', BASE_DIR / 'local.sqlite3'),
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# Portal access tokens. There is no refresh flow, so a working day is a
# sensible lifetime; the frontend signs the user out when a token expires.
ACCESS_TOKEN_LIFETIME = timedelta(hours=10)
PASSWORD_RESET_TOKEN_MAX_AGE = 15 * 60  # seconds

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': ACCESS_TOKEN_LIFETIME,
    'SIGNING_KEY': SECRET_KEY,
}

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Africa/Johannesburg'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

CORS_ALLOWED_ORIGINS = env_list('CORS_ALLOWED_ORIGINS', [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://icy-stone-092219c03.2.azurestaticapps.net',
])
CORS_EXPOSE_HEADERS = ['Content-Disposition']

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'pcp_webapp.auth.PortalJWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'UNAUTHENTICATED_USER': None,
    'EXCEPTION_HANDLER': 'pcp_webapp.exceptions.portal_exception_handler',
    'DEFAULT_THROTTLE_RATES': {
        'auth': '10/min',
    },
}

# Uploads
MEDIA_URL = '/media/'
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')
MAX_UPLOAD_SIZE = 20 * 1024 * 1024  # 20 MB per document
FILE_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024
DATA_UPLOAD_MAX_MEMORY_SIZE = MAX_UPLOAD_SIZE + 1024 * 1024
FILE_UPLOAD_PERMISSIONS = 0o644

mimetypes.add_type('application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.docx')
mimetypes.add_type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xlsx')
mimetypes.add_type('application/vnd.openxmlformats-officedocument.presentationml.presentation', '.pptx')
mimetypes.add_type('application/msword', '.doc')
mimetypes.add_type('application/vnd.ms-excel', '.xls')
mimetypes.add_type('application/vnd.ms-powerpoint', '.ppt')

# Security headers
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    SECURE_SSL_REDIRECT = env_bool('DJANGO_SECURE_SSL_REDIRECT', True)
    SECURE_HSTS_SECONDS = 60 * 60 * 24 * 30
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {'console': {'class': 'logging.StreamHandler'}},
    'loggers': {'pcp_webapp': {'handlers': ['console'], 'level': 'INFO'}},
}
