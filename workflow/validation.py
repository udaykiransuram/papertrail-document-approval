from io import BytesIO
from pathlib import PurePosixPath
from zipfile import ZipFile

from defusedxml.ElementTree import fromstring
from django.conf import settings
from pypdf import PdfReader
from rest_framework.exceptions import ValidationError

PDF = "application/pdf"
DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def validate_document(upload):
    if upload.size == 0:
        raise ValidationError("Choose a document that is not empty.")
    if upload.size > settings.MAX_DOCUMENT_BYTES:
        raise ValidationError("Documents must be 4 MB or smaller.")
    extension = PurePosixPath(upload.name.lower()).suffix
    if extension not in (".pdf", ".docx"):
        raise ValidationError("Choose a PDF or Word (.docx) document.")
    data = upload.read()
    upload.seek(0)
    try:
        if extension == ".pdf":
            if not data.startswith(b"%PDF-"):
                raise ValueError("Invalid PDF")
            reader = PdfReader(BytesIO(data))
            if reader.is_encrypted or not reader.pages:
                raise ValueError("Encrypted or empty PDF")
        else:
            with ZipFile(BytesIO(data)) as archive:
                entries = archive.infolist()
                if (
                    len(entries) > 1000
                    or sum(v.file_size for v in entries) > 30_000_000
                ):
                    raise ValueError("Document too complex")
                names = {v.filename for v in entries}
                if not {"[Content_Types].xml", "word/document.xml"}.issubset(names):
                    raise ValueError("Invalid DOCX")
                if any(
                    "vbaproject" in n.lower() or n.startswith("word/embeddings/")
                    for n in names
                ):
                    raise ValueError("Embedded executable content")
                for item in entries:
                    if item.flag_bits & 1:
                        raise ValueError("Encrypted DOCX")
                    if item.filename.endswith((".xml", ".rels")):
                        root = fromstring(archive.read(item))
                        # Prevent document previews from fetching third-party resources.
                        if item.filename.endswith(".rels"):
                            for relationship in root:
                                if relationship.attrib.get(
                                    "TargetMode"
                                ) == "External" and not relationship.attrib.get(
                                    "Type", ""
                                ).endswith("/hyperlink"):
                                    raise ValueError("External resources")
                body = fromstring(archive.read("word/document.xml"))
                if not body.tag.endswith("}document"):
                    raise ValueError("Invalid document body")
    except Exception as exc:
        raise ValidationError(
            "This document cannot be previewed. Use an unencrypted PDF or a DOCX without externally linked resources or embedded files."
        ) from exc
    return upload
