"""Private document storage. Local storage is an explicit development adapter."""

import logging
from pathlib import Path

from django.conf import settings

from .errors import StorageUnavailable

logger = logging.getLogger(__name__)


def _local_path(path):
    root = Path(settings.PRIVATE_DOCUMENT_ROOT).resolve()
    destination = (root / path).resolve()
    if not destination.is_relative_to(root):
        raise ValueError("Invalid storage path")
    return destination


def upload_document(path, data, content_type):
    try:
        if settings.DOCUMENT_STORAGE == "local":
            destination = _local_path(path)
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(data)
            return path
        if not settings.BLOB_READ_WRITE_TOKEN:
            raise RuntimeError("Private Blob is not configured")
        from vercel.blob import put

        result = put(
            path,
            data,
            access="private",
            content_type=content_type,
            token=settings.BLOB_READ_WRITE_TOKEN,
            overwrite=False,
        )
        return result.pathname
    except Exception as exc:
        logger.error("Document upload failed (%s)", type(exc).__name__)
        raise StorageUnavailable() from exc


def read_document(path):
    try:
        if settings.DOCUMENT_STORAGE == "local":
            return _local_path(path).read_bytes()
        from vercel.blob import get

        result = get(
            path, access="private", token=settings.BLOB_READ_WRITE_TOKEN, timeout=20
        )
        if result is None or result.status_code != 200:
            raise RuntimeError("Document not available")
        return result.content
    except Exception as exc:
        logger.error("Document read failed (%s)", type(exc).__name__)
        raise StorageUnavailable(
            "The document could not be loaded. Please try again."
        ) from exc


def delete_document(path):
    if settings.DOCUMENT_STORAGE == "local":
        _local_path(path).unlink(missing_ok=True)
    else:
        from vercel.blob import delete

        delete(path, token=settings.BLOB_READ_WRITE_TOKEN)
