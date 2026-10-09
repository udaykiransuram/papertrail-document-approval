from rest_framework.exceptions import PermissionDenied


def is_reviewer(user):
    return user.is_authenticated and user.groups.filter(name="reviewer").exists()


def require_reviewer(user):
    if not is_reviewer(user):
        raise PermissionDenied("Only the reviewer can make a decision.")


def visible_submissions(user):
    from .models import Submission

    query = Submission.objects.select_related("owner", "reviewed_by")
    return query if is_reviewer(user) else query.filter(owner=user)
