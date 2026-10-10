import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management import call_command
from django.core.management.base import CommandError
from rest_framework.exceptions import NotFound
from rest_framework.test import APIClient

from workflow.models import Submission
from workflow.permissions import visible_submissions
from workflow.services import decide_submission

pytestmark = pytest.mark.django_db


@pytest.fixture
def demo(settings, storage):
    settings.DEMO_ENABLED = True
    call_command("seed_demo")
    users = get_user_model().objects
    return users.get(username="demo_submitter"), users.get(username="demo_reviewer")


def test_demo_seed_is_idempotent_and_preserves_decisions(demo, storage):
    submitter, reviewer = demo
    sample = Submission.objects.filter(owner=submitter).first()
    decide_submission(reviewer, sample, "approved")
    call_command("seed_demo")
    assert Submission.objects.filter(owner=submitter).count() == 2
    sample.refresh_from_db()
    assert sample.status == "approved"
    assert storage[0].call_count == 2
    for user in demo:
        assert not user.has_usable_password()
        assert not user.is_staff and not user.is_superuser


def test_seed_refuses_existing_account_collision(settings, users, storage):
    settings.DEMO_ENABLED = True
    get_user_model().objects.create_user("demo_reviewer", password="keep-me")
    with pytest.raises(CommandError, match="Refusing"):
        call_command("seed_demo")
    assert not get_user_model().objects.filter(username="demo_submitter").exists()
    assert (
        get_user_model().objects.get(username="demo_reviewer").check_password("keep-me")
    )
    storage[0].assert_not_called()


def test_demo_disabled_and_missing_accounts(settings, client):
    settings.DEMO_ENABLED = False
    assert client.get("/api/session/").data["demoEnabled"] is False
    assert client.post("/api/demo/login/", {"role": "reviewer"}).status_code == 404
    with pytest.raises(CommandError, match="DEMO_ENABLED"):
        call_command("seed_demo")
    settings.DEMO_ENABLED = True
    assert client.post("/api/demo/login/", {"role": "reviewer"}).status_code == 503


@pytest.mark.parametrize(
    "role", ["alex", "admin", "", None, ["reviewer"], {"role": "reviewer"}]
)
def test_only_fixed_roles_can_be_selected(demo, client, role):
    assert (
        client.post("/api/demo/login/", {"role": role}, format="json").status_code
        == 400
    )


def test_demo_requires_csrf_and_switches_real_sessions(demo):
    client = APIClient(enforce_csrf_checks=True)
    csrf = client.get("/api/session/").data["csrfToken"]
    assert client.post("/api/demo/login/", {"role": "submitter"}).status_code == 403
    result = client.post(
        "/api/demo/login/", {"role": "submitter"}, HTTP_X_CSRFTOKEN=csrf
    )
    assert result.status_code == 200
    assert result.data["user"]["is_demo"] is True
    assert result.data["user"]["role"] == "submitter"
    old_key = client.cookies["sessionid"].value
    csrf = result.data["csrfToken"]
    result = client.post(
        "/api/demo/login/", {"role": "reviewer"}, HTTP_X_CSRFTOKEN=csrf
    )
    assert result.status_code == 200
    assert result.data["user"]["role"] == "reviewer"
    assert client.cookies["sessionid"].value != old_key
    assert client.get("/api/session/").data["user"]["id"] == demo[1].id
    assert (
        client.post(
            "/api/logout/", HTTP_X_CSRFTOKEN=result.data["csrfToken"]
        ).status_code
        == 200
    )
    assert client.get("/api/submissions/").status_code == 403


@pytest.mark.parametrize(
    "mutation", ["unmarked", "inactive", "staff", "superuser", "wrong_role"]
)
def test_demo_entry_rejects_misconfigured_identities(demo, client, mutation):
    user = demo[1]
    if mutation == "unmarked":
        user.groups.remove(Group.objects.get(name="demo"))
    elif mutation == "wrong_role":
        user.groups.remove(Group.objects.get(name="reviewer"))
    else:
        setattr(
            user,
            {"inactive": "is_active", "staff": "is_staff", "superuser": "is_superuser"}[
                mutation
            ],
            mutation != "inactive",
        )
        user.save()
    assert client.post("/api/demo/login/", {"role": "reviewer"}).status_code == 503


def test_demo_and_regular_workspaces_are_isolated(demo, submission, users, client):
    demo_submitter, demo_reviewer = demo
    demo_doc = Submission.objects.filter(owner=demo_submitter).first()
    private_doc = Submission.objects.get(pk=submission["id"])
    for reviewer, allowed, forbidden, owner in [
        (demo_reviewer, demo_doc, private_doc, demo_submitter),
        (users[2], private_doc, demo_doc, users[0]),
    ]:
        client.force_authenticate(reviewer)
        result = client.get("/api/submissions/").data
        assert str(allowed.pk) in [doc["id"] for doc in result["results"]]
        assert str(forbidden.pk) not in [doc["id"] for doc in result["results"]]
        assert {user["id"] for user in result["submitters"]} == {owner.id}
        assert result["counts"]["all"] == visible_submissions(reviewer).count()
        assert (
            client.get(f"/api/submissions/?owner={forbidden.owner_id}").data["count"]
            == 0
        )
        for suffix in ["", "file/"]:
            assert (
                client.get(f"/api/submissions/{forbidden.pk}/{suffix}").status_code
                == 404
            )
        assert (
            client.post(
                f"/api/submissions/{forbidden.pk}/decision/", {"status": "approved"}
            ).status_code
            == 404
        )
        with pytest.raises(NotFound):
            decide_submission(reviewer, forbidden, "approved")
    client.force_authenticate(demo_submitter)
    assert (
        client.post(
            f"/api/submissions/{demo_doc.pk}/decision/", {"status": "approved"}
        ).status_code
        == 403
    )


def test_accounts_only_setup_needs_no_storage(settings, storage):
    settings.DEMO_ENABLED = True
    call_command("seed_demo", accounts_only=True)
    assert get_user_model().objects.filter(groups__name="demo").count() == 2
    assert Submission.objects.count() == 0
    storage[0].assert_not_called()
