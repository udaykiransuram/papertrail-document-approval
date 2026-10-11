import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.cache import cache
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
    cache.clear()
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


@pytest.mark.parametrize("role", [0, 1])
def test_fresh_sample_uses_demo_owner_and_preserves_old_decisions(
    demo, users, client, role
):
    submitter, reviewer = demo
    original = Submission.objects.filter(owner=submitter).first()
    decide_submission(reviewer, original, "approved")
    client.force_authenticate(demo[role])
    first = client.post(
        "/api/demo/sample/", {"owner": users[0].id, "status": "approved"}
    )
    second = client.post("/api/demo/sample/", {})
    assert first.status_code == second.status_code == 201
    assert first.data["id"] != second.data["id"]
    assert first.data["owner"]["id"] == submitter.id
    assert first.data["status"] == "pending"
    assert first.data["content_type"] == "application/pdf"
    assert first.data["reviewed_at"] is None
    assert not visible_submissions(users[2]).filter(pk=first.data["id"]).exists()
    original.refresh_from_db()
    assert original.status == "approved"


@pytest.mark.parametrize("account", [None, 0, 2])
def test_sample_endpoint_rejects_anonymous_and_ordinary_accounts(
    demo, users, client, account, storage
):
    if account is not None:
        client.force_authenticate(users[account])
    before = storage[0].call_count
    assert client.post("/api/demo/sample/", {}).status_code == 403
    assert storage[0].call_count == before


def test_sample_endpoint_honors_disabled_demo(demo, settings, client, storage):
    settings.DEMO_ENABLED = False
    client.force_authenticate(demo[1])
    before = storage[0].call_count
    assert client.post("/api/demo/sample/", {}).status_code == 404
    assert storage[0].call_count == before


@pytest.mark.parametrize(
    "mutation", ["unmarked", "inactive", "staff", "superuser", "wrong_role"]
)
def test_sample_refuses_misconfigured_owner(demo, client, mutation, storage):
    owner = demo[0]
    if mutation == "unmarked":
        owner.groups.remove(Group.objects.get(name="demo"))
    elif mutation == "wrong_role":
        owner.groups.add(Group.objects.get(name="reviewer"))
    else:
        setattr(
            owner,
            {"inactive": "is_active", "staff": "is_staff", "superuser": "is_superuser"}[
                mutation
            ],
            mutation != "inactive",
        )
        owner.save()
    client.force_authenticate(demo[1])
    before = storage[0].call_count
    assert client.post("/api/demo/sample/", {}).status_code == 503
    assert storage[0].call_count == before


def test_sample_creation_requires_csrf(demo):
    client = APIClient(enforce_csrf_checks=True)
    csrf = client.get("/api/session/").data["csrfToken"]
    signed_in = client.post(
        "/api/demo/login/", {"role": "reviewer"}, HTTP_X_CSRFTOKEN=csrf
    )
    assert client.post("/api/demo/sample/", {}).status_code == 403
    assert (
        client.post(
            "/api/demo/sample/", {}, HTTP_X_CSRFTOKEN=signed_in.data["csrfToken"]
        ).status_code
        == 201
    )


def test_sample_storage_failure_does_not_create_submission(demo, client, storage):
    from workflow.errors import StorageUnavailable

    client.force_authenticate(demo[1])
    before = Submission.objects.count()
    storage[0].side_effect = StorageUnavailable()
    assert client.post("/api/demo/sample/", {}).status_code == 503
    assert Submission.objects.count() == before


def test_sample_creation_is_throttled_without_extra_uploads(demo, client, storage):
    client.force_authenticate(demo[1])
    for _ in range(10):
        assert client.post("/api/demo/sample/", {}).status_code == 201
    before = storage[0].call_count
    response = client.post("/api/demo/sample/", {})
    assert response.status_code == 429
    assert "Retry-After" in response
    assert storage[0].call_count == before


def test_sample_database_failure_cleans_up_upload(demo, client, storage, monkeypatch):
    from unittest.mock import Mock

    from django.db import DatabaseError

    client.force_authenticate(demo[1])
    before = Submission.objects.count()
    monkeypatch.setattr(
        "workflow.services.Submission.objects.create", Mock(side_effect=DatabaseError())
    )
    assert client.post("/api/demo/sample/", {}).status_code == 503
    assert Submission.objects.count() == before
    storage[2].assert_called_once()


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
