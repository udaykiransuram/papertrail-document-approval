from .test_settings import *

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "var" / "e2e.sqlite3",
    }
}
PRIVATE_DOCUMENT_ROOT = BASE_DIR / "var" / "e2e-documents"
DEMO_ENABLED = True
