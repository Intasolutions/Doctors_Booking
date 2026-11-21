"""
Django settings for the CareSlot doctor booking backend.
"""

import os
import sys
from datetime import timedelta
from pathlib import Path

import dj_database_url
from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / ".env")


def env_bool(name, default=False):
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in ("1", "true", "yes", "on")


def env_list(name, default=""):
    return [v.strip() for v in os.environ.get(name, default).split(",") if v.strip()]


RUNNING_TESTS = "test" in sys.argv

# Off unless .env explicitly sets DEBUG=True.
DEBUG = env_bool("DEBUG", False)

SECRET_KEY = os.environ.get("SECRET_KEY")
if not SECRET_KEY:
    if DEBUG or RUNNING_TESTS:
        SECRET_KEY = "django-insecure-dev-key-change-in-production"
    else:
        raise ImproperlyConfigured("SECRET_KEY must be set when DEBUG is off.")

ALLOWED_HOSTS = env_list("ALLOWED_HOSTS", "localhost,127.0.0.1")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt",
    "corsheaders",
    "accounts",
    "clinic",
    "whatsapp",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# Database: Neon/PostgreSQL when DATABASE_URL is set, SQLite otherwise.
DATABASE_URL = os.environ.get("DATABASE_URL")
if DATABASE_URL and not RUNNING_TESTS:
    DATABASES = {
        "default": dj_database_url.parse(
            DATABASE_URL,
            conn_max_age=600,
            ssl_require=env_bool("DATABASE_SSL_REQUIRE", True),
        )
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3" if not RUNNING_TESTS else ":memory:",
        }
    }

AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
# dd/mm/yyyy dates and 12-hour times in the admin (see config/formats/en).
FORMAT_MODULE_PATH = "config.formats"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"
        if not DEBUG and not RUNNING_TESTS
        else "django.contrib.staticfiles.storage.StaticFilesStorage"
    },
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_THROTTLE_RATES": {"otp": "5/hour", "login": "10/minute"},
    "NUM_PROXIES": 1,
}
if not DEBUG:
    REST_FRAMEWORK["DEFAULT_RENDERER_CLASSES"] = ("rest_framework.renderers.JSONRenderer",)

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=60),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=30),
    "ROTATE_REFRESH_TOKENS": True,
    "UPDATE_LAST_LOGIN": True,
}

CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS", "http://localhost:3000")
# Local testing from phones on the same Wi-Fi, whose address can change.
# Only ever honoured with DEBUG on.
CORS_ALLOW_ALL_ORIGINS = DEBUG and env_bool("CORS_ALLOW_ALL", False)
CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS", "")

if not DEBUG and not RUNNING_TESTS:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True

# ---------------------------------------------------------------------------
# CareSlot / WhatsApp Cloud API
# ---------------------------------------------------------------------------
# Leave WHATSAPP_TOKEN empty to run in "console mode": every outgoing message
# is stored in the message log (and printed) instead of being sent to Meta.
# The admin WhatsApp simulator uses this to test the bot without a number.
WHATSAPP = {
    "TOKEN": os.environ.get("WHATSAPP_TOKEN", ""),
    "PHONE_NUMBER_ID": os.environ.get("WHATSAPP_PHONE_NUMBER_ID", ""),
    "VERIFY_TOKEN": os.environ.get("WHATSAPP_VERIFY_TOKEN", "careslot-verify"),
    "APP_SECRET": os.environ.get("WHATSAPP_APP_SECRET", ""),
    "API_VERSION": os.environ.get("WHATSAPP_API_VERSION", "v22.0"),
    # Public business number patients message, digits only with country code.
    "BUSINESS_NUMBER": os.environ.get("WHATSAPP_BUSINESS_NUMBER", "919000000000"),
    "TEMPLATE_LANGUAGE": os.environ.get("WHATSAPP_TEMPLATE_LANGUAGE", "en"),
}

CARESLOT = {
    "BRAND": os.environ.get("CARESLOT_BRAND", "CareSlot"),
    "SITE_URL": os.environ.get("CARESLOT_SITE_URL", "http://localhost:3000"),
    "DEFAULT_COUNTRY_CODE": "91",
    "BOOKING_WINDOW_DAYS": int(os.environ.get("BOOKING_WINDOW_DAYS", "14")),
    # Patients cannot book a slot starting sooner than this.
    "MIN_LEAD_MINUTES": int(os.environ.get("MIN_LEAD_MINUTES", "15")),
    "OTP_TTL_MINUTES": 10,
    # In DEBUG the OTP is returned in the API response so you can log in
    # locally without WhatsApp. Never enabled when DEBUG is off.
    "OTP_ECHO": DEBUG and env_bool("OTP_ECHO", True),
}

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "loggers": {
        "careslot": {"handlers": ["console"], "level": "INFO"},
    },
}
