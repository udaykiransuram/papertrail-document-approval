from datetime import timedelta
from uuid import uuid4

import pytest
from django.utils import timezone

from workflow.models import Submission

pytestmark = pytest.mark.django_db


def documents(owner, count, status="pending", reviewer=None):
    return Submission.objects.bulk_create(
        [
            Submission(
                owner=owner,
                title=f"Document {index:02d}",
                blob_path=f"test/{uuid4()}.pdf",
                original_filename="sample.pdf",
                content_type="application/pdf",
                size=123,
                status=status,
                reviewed_by=reviewer,
                reviewed_at=timezone.now() if reviewer else None,
            )
            for index in range(count)
        ]
    )


def test_page_boundaries_and_stable_order(client, users):
    documents(users[0], 45)
    documents(users[1], 7)
    client.force_authenticate(users[0])
    pages = [client.get(f"/api/submissions/?page={page}").data for page in (1, 2, 3)]
    assert [len(page["results"]) for page in pages] == [20, 20, 5]
    assert pages[0]["count"] == 45
    assert pages[0]["total_pages"] == 3
    assert pages[0]["counts"] == {
        "all": 45,
        "pending": 45,
        "approved": 0,
        "rejected": 0,
    }
    identifiers = [item["id"] for page in pages for item in page["results"]]
    assert len(set(identifiers)) == 45
    assert client.get("/api/submissions/?page=1").data["results"] == pages[0]["results"]
    assert client.get("/api/submissions/?page=999").data["page"] == 3


@pytest.mark.parametrize("status", ["pending", "approved", "rejected"])
def test_each_status_is_filtered_before_pagination(client, users, status):
    for value in Submission.Status.values:
        documents(users[0], 25, value, users[2] if value != "pending" else None)
    documents(users[1], 8)
    client.force_authenticate(users[0])
    response = client.get(f"/api/submissions/?status={status}&page=2").data
    assert response["count"] == 25
    assert len(response["results"]) == 5
    assert {item["status"] for item in response["results"]} == {status}
    assert response["counts"] == {
        "all": 75,
        "pending": 25,
        "approved": 25,
        "rejected": 25,
    }


def test_reviewer_filters_by_submitter_and_status_with_matching_counts(client, users):
    documents(users[0], 23)
    documents(users[0], 2, "approved", users[2])
    documents(users[1], 4)
    client.force_authenticate(users[2])
    response = client.get(
        f"/api/submissions/?owner={users[0].pk}&status=pending&page=2"
    ).data
    assert response["count"] == 23
    assert len(response["results"]) == 3
    assert {item["owner"]["id"] for item in response["results"]} == {users[0].pk}
    assert response["counts"] == {
        "all": 25,
        "pending": 23,
        "approved": 2,
        "rejected": 0,
    }
    assert {owner["id"] for owner in response["submitters"]} == {
        users[0].pk,
        users[1].pk,
    }
    client.force_authenticate(users[1])
    response = client.get(f"/api/submissions/?owner={users[0].pk}").data
    assert response["count"] == 0
    assert response["counts"]["all"] == 0
    assert response["submitters"] == []


def test_date_status_and_submitter_sorting(client, users):
    users[1].first_name = "Jamie"
    users[1].save()
    oldest = documents(users[0], 1, "approved", users[2])[0]
    middle = documents(users[1], 1)[0]
    newest = documents(users[0], 1, "rejected", users[2])[0]
    for age, record in enumerate([newest, middle, oldest]):
        Submission.objects.filter(pk=record.pk).update(
            created_at=timezone.now() - timedelta(days=age)
        )
    client.force_authenticate(users[2])

    def ids(sort):
        return [
            row["id"]
            for row in client.get(f"/api/submissions/?sort={sort}").data["results"]
        ]

    assert ids("oldest") == [str(oldest.pk), str(middle.pk), str(newest.pk)]
    assert ids("newest") == [str(newest.pk), str(middle.pk), str(oldest.pk)]
    assert ids("status_asc") == [str(middle.pk), str(oldest.pk), str(newest.pk)]
    assert ids("status_desc") == [str(newest.pk), str(oldest.pk), str(middle.pk)]
    assert ids("submitter_asc") == [str(newest.pk), str(oldest.pk), str(middle.pk)]
    assert ids("submitter_desc") == [str(middle.pk), str(newest.pk), str(oldest.pk)]


@pytest.mark.parametrize(
    "query",
    [
        "page=0",
        "page=-1",
        "page=invalid",
        "owner=invalid",
        "owner=-1",
        "sort=arbitrary_column",
    ],
)
def test_invalid_list_parameters(client, users, query):
    client.force_authenticate(users[0])
    assert client.get(f"/api/submissions/?{query}").status_code == 400


def test_page_clamps_after_last_pending_item_is_reviewed(client, users):
    documents(users[0], 21)
    client.force_authenticate(users[2])
    before = client.get("/api/submissions/?status=pending&page=2").data
    identifier = before["results"][0]["id"]
    assert (
        client.post(
            f"/api/submissions/{identifier}/decision/",
            {"status": "approved"},
            format="json",
        ).status_code
        == 200
    )
    after = client.get("/api/submissions/?status=pending&page=2").data
    assert after["page"] == 1
    assert after["count"] == 20
    assert after["total_pages"] == 1


def test_document_search_combines_owner_status_and_pagination(client, users):
    records = documents(users[0], 25)
    Submission.objects.filter(pk__in=[record.pk for record in records]).update(
        title="Quarterly Budget"
    )
    documents(users[0], 3)
    approved = documents(users[0], 2, "approved", users[2])
    Submission.objects.filter(pk__in=[record.pk for record in approved]).update(
        original_filename="quarterly-report.pdf"
    )
    other = documents(users[1], 4)
    Submission.objects.filter(pk__in=[record.pk for record in other]).update(
        title="Quarterly Budget"
    )
    client.force_authenticate(users[2])
    response = client.get(
        "/api/submissions/",
        {"q": "  qUaRtErLy  ", "owner": users[0].pk, "status": "pending", "page": 2},
    ).data
    assert len(response["results"]) == 5
    assert response["count"] == 25
    assert response["counts"] == {
        "all": 27,
        "pending": 25,
        "approved": 2,
        "rejected": 0,
    }
    assert {owner["id"] for owner in response["submitters"]} == {
        users[0].pk,
        users[1].pk,
    }
    assert {row["owner"]["id"] for row in response["results"]} == {users[0].pk}


def test_search_filename_and_title_preserves_ownership(client, users):
    own = documents(users[0], 1)[0]
    other = documents(users[1], 1)[0]
    Submission.objects.filter(pk=own.pk).update(original_filename="Finance-final.docx")
    Submission.objects.filter(pk=other.pk).update(title="Finance confidential")
    client.force_authenticate(users[0])
    response = client.get("/api/submissions/", {"q": "FINANCE"}).data
    assert [row["id"] for row in response["results"]] == [str(own.pk)]
    assert response["counts"]["all"] == 1
    assert response["submitters"] == []
    assert client.get("/api/submissions/", {"q": "confidential"}).data["count"] == 0


def test_search_empty_and_literal_special_characters(client, users):
    record = documents(users[0], 1)[0]
    documents(users[0], 1)
    Submission.objects.filter(pk=record.pk).update(title="100%_finished")
    client.force_authenticate(users[0])
    assert client.get("/api/submissions/", {"q": "  "}).data["count"] == 2
    response = client.get("/api/submissions/", {"q": "%_"}).data
    assert [row["id"] for row in response["results"]] == [str(record.pk)]
    missing = client.get("/api/submissions/", {"q": "not found", "page": 5}).data
    assert missing["count"] == 0
    assert missing["page"] == missing["total_pages"] == 1
    assert client.get("/api/submissions/", {"q": "x" * 201}).status_code == 400
