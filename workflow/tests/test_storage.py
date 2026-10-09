from types import SimpleNamespace
from unittest.mock import patch

import pytest

from workflow import storage
from workflow.errors import StorageUnavailable


def test_private_vercel_adapter(settings):
    settings.DOCUMENT_STORAGE = "vercel"
    settings.BLOB_READ_WRITE_TOKEN = "test-only-fake-token"
    with patch(
        "vercel.blob.put", return_value=SimpleNamespace(pathname="documents/id.pdf")
    ) as put:
        assert (
            storage.upload_document("documents/id.pdf", b"pdf", "application/pdf")
            == "documents/id.pdf"
        )
        assert put.call_args.kwargs["access"] == "private"
        assert put.call_args.kwargs["overwrite"] is False
    with patch(
        "vercel.blob.get", return_value=SimpleNamespace(content=b"pdf", status_code=200)
    ) as get:
        assert storage.read_document("documents/id.pdf") == b"pdf"
        assert get.call_args.kwargs["access"] == "private"


def test_local_storage_path_guard(settings, tmp_path):
    settings.DOCUMENT_STORAGE = "local"
    settings.PRIVATE_DOCUMENT_ROOT = tmp_path
    with pytest.raises(StorageUnavailable):
        storage.upload_document("../../outside.pdf", b"data", "application/pdf")
    path = storage.upload_document("documents/test.pdf", b"data", "application/pdf")
    assert storage.read_document(path) == b"data"
    storage.delete_document(path)
    assert not (tmp_path / path).exists()
