import os

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction


class Command(BaseCommand):
    help = "Create/update two submitters and one reviewer using environment-supplied passwords."

    @transaction.atomic
    def handle(self, *args, **kwargs):
        accounts = [
            ("alex", "Alex", "Morgan", "SEED_ALEX_PASSWORD", False),
            ("jamie", "Jamie", "Chen", "SEED_JAMIE_PASSWORD", False),
            ("reviewer", "Morgan", "Reed", "SEED_REVIEWER_PASSWORD", True),
        ]
        # Validate every password before changing any account.
        for username, first, last, env, reviewer in accounts:
            password = os.getenv(env)
            if not password:
                raise CommandError(f"Set {env} before seeding users.")
            try:
                validate_password(password)
            except ValidationError as exc:
                raise CommandError(f"{env}: {' '.join(exc.messages)}") from exc
        group, _ = Group.objects.get_or_create(name="reviewer")
        for username, first, last, env, reviewer in accounts:
            user, _ = get_user_model().objects.get_or_create(username=username)
            user.first_name, user.last_name = first, last
            user.is_active = True
            user.set_password(os.environ[env])
            user.save()
            if reviewer:
                user.groups.add(group)
            else:
                user.groups.remove(group)
        self.stdout.write(
            self.style.SUCCESS(
                "Seeded alex, jamie, and reviewer. Passwords were not printed."
            )
        )
