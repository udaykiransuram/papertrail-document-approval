import logging
import uuid
from pathlib import PurePosixPath

from django.utils import timezone

from . import storage
from .errors import Conflict
from .models import Submission
from .permissions import require_reviewer
from .validation import DOCX, PDF

logger = logging.getLogger(__name__)


def create_submission(user, title, upload):
    extension = PurePosixPath(upload.name.lower()).suffix
    content_type = PDF if extension == ".pdf" else DOCX
    path = f"documents/{uuid.uuid4().hex}{extension}"
    stored_path = storage.upload_document(path, upload.read(), content_type)
    try:
        return Submission.objects.create(
            title=title,
            owner=user,
            blob_path=stored_path,
            original_filename=upload.name,
            content_type=content_type,
            size=upload.size,
        )
    except Exception:
        try:
            storage.delete_document(stored_path)
        except Exception as cleanup_error:
            logger.error(
                "Orphan document cleanup failed for %s (%s)",
                stored_path,
                type(cleanup_error).__name__,
            )
        raise


def decide_submission(user, submission, status):
    require_reviewer(user)
    # A single conditional UPDATE prevents lost updates, including simultaneous decisions.
    changed = Submission.objects.filter(
        pk=submission.pk, status=Submission.Status.PENDING
    ).update(status=status, reviewed_by=user, reviewed_at=timezone.now())
    if not changed:
        raise Conflict()
    submission.refresh_from_db()
    return submission
