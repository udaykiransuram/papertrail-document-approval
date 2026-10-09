"""Explicit, repeatable offline setup. Never targets a cloud database."""

import os
import secrets
import subprocess
import sys
from pathlib import Path

from dotenv import load_dotenv

root = Path(__file__).resolve().parent.parent
env_file = root / ".env"
if not env_file.exists():
    template = (root / ".env.example").read_text()
    for name in (
        "DJANGO_SECRET_KEY",
        "SEED_ALEX_PASSWORD",
        "SEED_JAMIE_PASSWORD",
        "SEED_REVIEWER_PASSWORD",
    ):
        template = template.replace(
            f"{name}=\n", f"{name}={secrets.token_urlsafe(40)}\n"
        )
    # Exclusive creation and owner-only access avoid replacing an existing configuration.
    descriptor = os.open(env_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w") as stream:
        stream.write(template)

load_dotenv(env_file)
if (
    os.getenv("DATABASE_URL")
    or os.getenv("VERCEL")
    or os.getenv("DJANGO_DEBUG") != "1"
    or os.getenv("DOCUMENT_STORAGE") != "local"
):
    sys.exit(
        "Local setup requires an offline .env. For cloud setup, use the release instructions in README.md."
    )

for command in ("migrate", "seed_users"):
    subprocess.run([sys.executable, "manage.py", command], cwd=root, check=True)
print(
    "Local setup complete. Usernames: alex, jamie, reviewer. Read their passwords from your private .env file."
)
