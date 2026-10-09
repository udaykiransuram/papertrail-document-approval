from rest_framework.exceptions import APIException
from rest_framework.views import exception_handler as drf_exception_handler


class Conflict(APIException):
    status_code = 409
    default_detail = (
        "This submission has already been reviewed. Refresh to see the decision."
    )


class StorageUnavailable(APIException):
    status_code = 503
    default_detail = "Document storage is temporarily unavailable. Please try again."


def exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is not None:
        payload = response.data
        if isinstance(payload, dict) and "detail" in payload:
            response.data = {"message": str(payload["detail"])}
        else:
            response.data = {
                "message": "Please check the highlighted fields.",
                "fields": payload,
            }
    return response
