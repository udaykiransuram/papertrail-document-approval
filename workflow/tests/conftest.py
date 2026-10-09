from io import BytesIO
from unittest.mock import Mock

import pytest
from django.contrib.auth.models import Group
from django.core.files.uploadedfile import SimpleUploadedFile
from reportlab.pdfgen.canvas import Canvas
from rest_framework.test import APIClient


@pytest.fixture
def users(db, django_user_model):
    alex = django_user_model.objects.create_user(
        username="alex",
        password="Test-password-482!",
        first_name="Alex",
        last_name="Morgan",
    )
    jamie = django_user_model.objects.create_user(
        username="jamie", password="Test-password-482!"
    )
    reviewer = django_user_model.objects.create_user(
        username="reviewer",
        password="Test-password-482!",
        first_name="Morgan",
        last_name="Reed",
    )
    reviewer.groups.add(Group.objects.create(name="reviewer"))
    return alex, jamie, reviewer


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def pdf_bytes():
    stream = BytesIO()
    canvas = Canvas(stream)
    canvas.drawString(70, 760, "A real PDF document for review")
    canvas.showPage()
    canvas.drawString(70, 760, "Second page")
    canvas.save()
    return stream.getvalue()


@pytest.fixture
def pdf(pdf_bytes):
    return SimpleUploadedFile("proposal.pdf", pdf_bytes, content_type="application/pdf")


@pytest.fixture
def storage(monkeypatch, pdf_bytes):
    upload = Mock(side_effect=lambda path, data, mime: path)
    read = Mock(return_value=pdf_bytes)
    delete = Mock()
    monkeypatch.setattr("workflow.storage.upload_document", upload)
    monkeypatch.setattr("workflow.storage.read_document", read)
    monkeypatch.setattr("workflow.storage.delete_document", delete)
    return upload, read, delete


@pytest.fixture
def submission(client, users, pdf, storage):
    client.force_authenticate(users[0])
    response = client.post(
        "/api/submissions/",
        {"title": "Project proposal", "file": pdf},
        format="multipart",
    )
    assert response.status_code == 201, response.data
    return response.data
