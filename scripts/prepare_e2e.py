"""Isolated test data. Never touches the application database."""

import os
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root))
os.environ["DJANGO_SETTINGS_MODULE"] = "config.e2e_settings"
os.environ["DOCUMENT_STORAGE"] = "local"
os.environ["DJANGO_DEBUG"] = "1"
for key in ["SEED_ALEX_PASSWORD", "SEED_JAMIE_PASSWORD", "SEED_REVIEWER_PASSWORD"]:
    os.environ[key] = "E2e-only-password-924!"
(root / "var").mkdir(exist_ok=True)
import django

django.setup()
from django.core.management import call_command

call_command("migrate", interactive=False, verbosity=0)
call_command("flush", interactive=False, verbosity=0)
call_command("seed_users")
call_command("seed_demo")
from scripts.make_fixtures import make_fixtures

fixtures = root / "workflow" / "tests" / "fixtures"
if (
    not (fixtures / "project-proposal.pdf").exists()
    or not (fixtures / "project-brief.docx").exists()
):
    make_fixtures(fixtures)
