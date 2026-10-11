import os
from pathlib import Path

import dj_database_url
from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")
ON_VERCEL = bool(os.getenv("VERCEL"))
DEBUG = not ON_VERCEL and os.getenv("DJANGO_DEBUG", "1") == "1"
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY") or (
    "local-development-only-not-for-deployment" if DEBUG else ""
)
if not SECRET_KEY:
    raise ImproperlyConfigured("Set DJANGO_SECRET_KEY before deploying.")
ALLOWED_HOSTS = [
    v.strip()
    for v in os.getenv("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,testserver").split(
        ","
    )
    if v.strip()
]
for host in (os.getenv("VERCEL_URL"), os.getenv("VERCEL_PROJECT_PRODUCTION_URL")):
    if host and host not in ALLOWED_HOSTS:
        ALLOWED_HOSTS.append(host)
CSRF_TRUSTED_ORIGINS = [
    v.strip()
    for v in os.getenv(
        "DJANGO_CSRF_TRUSTED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",")
    if v.strip()
]
INSTALLED_APPS = [
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.staticfiles",
    "rest_framework",
    "workflow",
]
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]
ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "frontend" / "dist"],
        "APP_DIRS": True,
        "OPTIONS": {"context_processors": []},
    }
]
database_url = os.getenv("DATABASE_URL")
if ON_VERCEL and not database_url:
    raise ImproperlyConfigured(
        "DATABASE_URL is required on Vercel; local SQLite is never deployed."
    )
DATABASES = {
    "default": dj_database_url.parse(
        database_url, conn_max_age=0, conn_health_checks=True
    )
    if database_url
    else {"ENGINE": "django.db.backends.sqlite3", "NAME": BASE_DIR / "db.sqlite3"}
}
if database_url:
    DATABASES["default"]["DISABLE_SERVER_SIDE_CURSORS"] = True
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
]
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_TZ = True
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = (
    [BASE_DIR / "frontend" / "dist"]
    if (BASE_DIR / "frontend" / "dist").exists()
    else []
)
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
CSRF_FAILURE_VIEW = "workflow.views.csrf_failure"
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = not DEBUG
SECURE_HSTS_SECONDS = 3600 if not DEBUG else 0
X_FRAME_OPTIONS = "DENY"
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication"
    ],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "EXCEPTION_HANDLER": "workflow.errors.exception_handler",
    "DEFAULT_THROTTLE_RATES": {"login": "20/minute", "demo_sample": "10/minute"},
}
MAX_DOCUMENT_BYTES = 4_000_000
DEMO_ENABLED = os.getenv("DEMO_ENABLED", "0") == "1"
DATA_UPLOAD_MAX_MEMORY_SIZE = 4_200_000
FILE_UPLOAD_MAX_MEMORY_SIZE = 4_000_000
DATA_UPLOAD_MAX_NUMBER_FILES = 1
DOCUMENT_STORAGE = os.getenv("DOCUMENT_STORAGE", "vercel")
if DOCUMENT_STORAGE not in ("vercel", "local"):
    raise ImproperlyConfigured("DOCUMENT_STORAGE must be vercel or local.")
if DOCUMENT_STORAGE == "local" and (ON_VERCEL or not DEBUG):
    raise ImproperlyConfigured(
        "Local document storage is allowed only in local debug mode."
    )
PRIVATE_DOCUMENT_ROOT = BASE_DIR / "var" / "documents"
BLOB_READ_WRITE_TOKEN = os.getenv("BLOB_READ_WRITE_TOKEN", "")
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}
