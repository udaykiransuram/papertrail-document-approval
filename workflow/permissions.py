from rest_framework.exceptions import PermissionDenied


def is_reviewer(user):
    return user.is_authenticated and user.groups.filter(name="reviewer").exists()


def is_demo(user):
    return user.is_authenticated and user.groups.filter(name="demo").exists()


def require_reviewer(user):
    if not is_reviewer(user):
        raise PermissionDenied("Only the reviewer can make a decision.")


def visible_submissions(user):
    from .models import Submission

    query = Submission.objects.select_related("owner", "reviewed_by")
    if not is_reviewer(user):
        return query.filter(owner=user)
    # Public demo access never grants access to the ordinary account workspace.
    if is_demo(user):
        return query.filter(owner__groups__name="demo")
    return query.exclude(owner__groups__name="demo")
