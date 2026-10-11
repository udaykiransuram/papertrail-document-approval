from .test_settings import *

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "var" / "e2e.sqlite3",
    }
}
PRIVATE_DOCUMENT_ROOT = BASE_DIR / "var" / "e2e-documents"
DEMO_ENABLED = True
# The browser suite repeatedly signs in from one IP. Keep production's 20/minute
# limit unchanged while allowing independent recovery tests to share this server.
REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    "DEFAULT_THROTTLE_RATES": {"login": "1000/minute", "demo_sample": "1000/minute"},
}
