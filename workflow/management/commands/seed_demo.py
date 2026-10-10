from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from workflow.demo import DEMO_ACCOUNTS, DEMO_SAMPLES
from workflow.models import Submission
from workflow.services import create_submission


class Command(BaseCommand):
    help = "Seed isolated public demo accounts and synthetic sample documents."

    def add_arguments(self, parser):
        parser.add_argument(
            "--accounts-only",
            action="store_true",
            help="Create identities only; samples can be submitted through the hosted app.",
        )

    def handle(self, *args, **kwargs):
        if not settings.DEMO_ENABLED:
            raise CommandError("Set DEMO_ENABLED=1 before seeding the demo.")
        samples = settings.BASE_DIR / "frontend" / "public" / "samples"
        if any(not (samples / filename).is_file() for _, filename in DEMO_SAMPLES):
            raise CommandError("Bundled demo sample files are missing.")
        # Refuse collisions before updating either identity. Never turn a normal
        # or privileged account into a publicly accessible demo account.
        with transaction.atomic():
            for username in DEMO_ACCOUNTS.values():
                existing = get_user_model().objects.filter(username=username).first()
                if existing and (
                    not existing.groups.filter(name="demo").exists()
                    or existing.is_staff
                    or existing.is_superuser
                ):
                    raise CommandError(
                        f"Refusing to replace existing account {username}."
                    )
            demo, _ = Group.objects.get_or_create(name="demo")
            reviewer, _ = Group.objects.get_or_create(name="reviewer")
            for role, username in DEMO_ACCOUNTS.items():
                user, _ = get_user_model().objects.get_or_create(username=username)
                user.first_name, user.last_name = "Demo", role.capitalize()
                user.is_active = True
                user.set_unusable_password()
                user.save()
                user.groups.set([demo, reviewer] if role == "reviewer" else [demo])
        if kwargs["accounts_only"]:
            self.stdout.write(self.style.SUCCESS("Demo accounts are ready."))
            return
        submitter = get_user_model().objects.get(username=DEMO_ACCOUNTS["submitter"])
        # Persist each upload separately: retries keep existing documents and
        # decisions. create_submission cleans up its upload on a DB failure.
        for title, filename in DEMO_SAMPLES:
            if not Submission.objects.filter(
                owner=submitter, title=title, original_filename=filename
            ).exists():
                create_submission(
                    submitter,
                    title,
                    SimpleUploadedFile(filename, (samples / filename).read_bytes()),
                )
        self.stdout.write(
            self.style.SUCCESS("Demo accounts and sample documents are ready.")
        )
