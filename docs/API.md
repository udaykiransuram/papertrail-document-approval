# API reference

[Back to README](../README.md)

Base URL: `http://127.0.0.1:8000` locally or `https://papertrail-document-approval.vercel.app` for the hosted demo. All API paths have a trailing slash. JSON is used except for document upload and download.

## Session and CSRF

1. `GET /api/session/` sets the CSRF cookie and returns a token.
2. Send that token as `X-CSRFToken` when signing in.
3. Login rotates the token. Use the token from the login response for subsequent writes and retain the session cookies.
4. For HTTPS API clients, send the application origin as `Referer` on writes. Browsers do this normally for same-origin requests.

Anonymous session response:

```json
{
  "user": null,
  "csrfToken": "<session-specific token>",
  "demoEnabled": true
}
```

Password login request, `POST /api/login/`:

```json
{ "username": "alex", "password": "<configured seed password>" }
```

Successful login response (`200`):

```json
{
  "user": {
    "id": 1,
    "name": "Alex Morgan",
    "username": "alex",
    "role": "submitter",
    "is_demo": false
  },
  "csrfToken": "<rotated token>"
}
```

`GET /api/session/` returns this user object when signed in. `POST /api/logout/` returns `{"message":"Signed out."}` and invalidates the session.

Session lookup, password login, and demo login are available anonymously. Other endpoints require authentication. CSRF is required for all POST requests, including both login methods.

## Endpoints

| Method and route                       | Request                                              | Success response                                    |
| -------------------------------------- | ---------------------------------------------------- | --------------------------------------------------- |
| `GET /api/session/`                    | None                                                 | `200` session object above                          |
| `POST /api/login/`                     | JSON `username`, `password`                          | `200` user and rotated token                        |
| `POST /api/logout/`                    | No body required                                     | `200` message                                       |
| `POST /api/submissions/`               | Multipart `title`, `file`                            | `201` submission object                             |
| `GET /api/submissions/`                | Optional query parameters below                      | `200` paginated list                                |
| `GET /api/submissions/{id}/`           | UUID in path                                         | `200` submission object                             |
| `GET /api/submissions/{id}/file/`      | UUID in path                                         | `200` PDF/DOCX bytes                                |
| `POST /api/submissions/{id}/decision/` | JSON `status`                                        | `200` updated submission object                     |
| `POST /api/demo/login/`                | JSON `{"role":"submitter"}` or `{"role":"reviewer"}` | `200` demo user and rotated token                   |
| `POST /api/demo/sample/`               | No body required                                     | `201` fresh pending sample, owned by demo submitter |

Demo endpoints return 404 when the demo is disabled. Sample creation additionally requires one of the two dedicated, non-privileged demo identities. It creates a new sample and does not reset previous submissions.

## Submit and fetch a document

Upload with multipart fields:

| Field   | Validation                                                                                |
| ------- | ----------------------------------------------------------------------------------------- |
| `title` | Required, trimmed, 1–200 characters                                                       |
| `file`  | Exactly one nonempty PDF or DOCX, at most 4,000,000 bytes; contents validated server-side |

Only submitters can upload. Ownership and the initial pending status are set by the backend; client-supplied owner/status values cannot override them. Invalid files are rejected before storage. Storage failures return 503 without creating a submission.

A create/detail response has this shape (IDs, timestamps, and size below are illustrative):

```json
{
  "id": "00000000-0000-4000-8000-000000000001",
  "title": "Project proposal",
  "owner": { "id": 1, "name": "Alex Morgan", "username": "alex" },
  "original_filename": "project-proposal.pdf",
  "content_type": "application/pdf",
  "size": 5120,
  "status": "pending",
  "created_at": "2026-10-11T10:00:00Z",
  "reviewed_by": null,
  "reviewed_at": null,
  "file_url": "/api/submissions/00000000-0000-4000-8000-000000000001/file/"
}
```

`reviewed_by` becomes a user summary (`id`, `name`, `username`) after a decision. `reviewed_at` becomes a UTC timestamp. Private storage paths are not exposed. The `file_url` is a same-origin, authenticated route, not a public Blob link; inaccessible IDs return 404. File responses use the document MIME type and `Cache-Control: private, no-store`.

## List, search, filter, and sort

`GET /api/submissions/?status=pending&q=proposal&sort=oldest&page=1`

| Parameter | Accepted values / behavior                                                                   |
| --------- | -------------------------------------------------------------------------------------------- |
| `q`       | Case-insensitive substring of title or original filename; trimmed; maximum 200 characters    |
| `status`  | `pending`, `approved`, `rejected`; omit for all                                              |
| `owner`   | Positive submitter ID; never expands the caller's access                                     |
| `page`    | Positive integer, default 1; 20 rows per page                                                |
| `sort`    | `newest` (default), `oldest`, `status_asc`, `status_desc`, `submitter_asc`, `submitter_desc` |

Status ascending means pending, approved, rejected; descending reverses that order. Date and UUID tie-breakers make ordering deterministic. Submitter sorting uses name and username. The reviewer UI exposes owner filtering; the API always applies ownership permissions first, regardless of the requested owner.

Empty-list response:

```json
{
  "results": [],
  "page": 1,
  "page_size": 20,
  "count": 0,
  "total_pages": 1,
  "counts": { "all": 0, "pending": 0, "approved": 0, "rejected": 0 },
  "submitters": []
}
```

For nonempty pages, `results` contains submission objects. `count` is the total matching the active status/search/owner filters, across all pages. `counts` gives each status under the active search/owner filters, before the status filter. Reviewers receive submitter summaries for owners across their permitted queue, independent of current filters; submitters receive an empty `submitters` array. Stale/out-of-range page numbers clamp to the last available page. Malformed parameters return 400.

## Record a decision

`POST /api/submissions/{id}/decision/`:

```json
{ "status": "approved" }
```

Use `rejected` for rejection. Only reviewers can call this successfully. The response is the full updated submission, including reviewer and timestamp. Only pending records can change. A repeated or competing decision returns 409, including a repeated request for the same status.

The dedicated decision endpoint makes the workflow action explicit and prevents arbitrary metadata edits. A conditional SQL update enforces finality even if two requests use stale data.

## Errors

Validation example (`400`):

```json
{
  "message": "Please check the highlighted fields.",
  "fields": { "title": ["This field is required."] }
}
```

Conflict example (`409`):

```json
{
  "message": "This submission has already been reviewed. Refresh to see the decision.",
  "code": "error"
}
```

Errors always have `message`; `code` and `fields` are optional. Authentication/CSRF failures may return only a message. DRF permission errors include codes such as `not_authenticated` or `permission_denied`, allowing the UI to distinguish an expired session from a valid session without permission.

| Status | Meaning                                                                                    |
| ------ | ------------------------------------------------------------------------------------------ |
| `400`  | Invalid fields, file content, file count, or query parameter                               |
| `401`  | Incorrect username/password                                                                |
| `403`  | Missing session, CSRF failure, or role permission denied                                   |
| `404`  | Missing/inaccessible submission, or demo disabled                                          |
| `409`  | Submission already reviewed                                                                |
| `413`  | Hosting platform may reject a request exceeding its total payload limit before Django runs |
| `429`  | Login or demo-sample throttle exceeded                                                     |
| `503`  | Storage/persistence unavailable, or demo identities not initialized                        |

DRF's session-authenticated protected endpoints use 403 for an anonymous request. Login throttling is 20/minute; demo-sample creation is 10/minute. Both use an in-process cache and are not cluster-wide quotas.

## Runnable local example

After [local setup](../README.md#run-locally), run this from the repository root with `.venv/bin/python`. It creates one sample under Alex's account. `httpx2` is installed by the locked Python requirements through the Blob SDK.

```python
import os
from pathlib import Path

import httpx2 as httpx
from dotenv import load_dotenv

load_dotenv()
with httpx.Client(base_url="http://127.0.0.1:8000") as client:
    token = client.get("/api/session/").json()["csrfToken"]
    response = client.post(
        "/api/login/",
        json={"username": "alex", "password": os.environ["SEED_ALEX_PASSWORD"]},
        headers={"X-CSRFToken": token},
    )
    response.raise_for_status()
    headers = {"X-CSRFToken": response.json()["csrfToken"]}
    with Path("workflow/samples/project-proposal.pdf").open("rb") as file:
        response = client.post(
            "/api/submissions/",
            data={"title": "Project proposal"},
            files={"file": ("project-proposal.pdf", file, "application/pdf")},
            headers=headers,
        )
    response.raise_for_status()
    submission = response.json()
    print(submission["id"], submission["status"])
    print(client.get("/api/submissions/?status=pending").json())
```

To decide, sign in as `reviewer` in another session, retain its rotated CSRF token, and POST the decision JSON to the returned ID. Signing in as `jamie` instead must not expose Alex's submission. Do not use the password-based account example against the public demo without the operator's credentials.
