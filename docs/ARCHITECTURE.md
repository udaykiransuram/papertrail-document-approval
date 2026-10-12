# Architecture and trade-offs

[Back to README](../README.md)

## Request flow

```text
Submitter                           Reviewer
   │ title + local file preview        │ queue / document / confirmation
   └──────────────────┬────────────────┘
                      ▼
       Django session authentication + CSRF
                      ▼
       API views → serializers / permissions → services
                      ├── PostgreSQL: metadata and final decision
                      └── Private Blob: uploaded document
```

Vite builds the React client; Django serves its HTML shell and API on one Vercel origin. Static assets are served from the CDN. This avoids cross-origin cookie configuration. Offline development substitutes SQLite and local files without changing the API or service interfaces.

## Module boundaries

- [Views](../workflow/views.py) handle HTTP, query parameters, pagination, and response codes.
- [Serializers](../workflow/serializers.py) define accepted inputs and public response fields. [Validation](../workflow/validation.py) inspects document bytes.
- [Permissions](../workflow/permissions.py) scope submissions by owner and workspace before any filtering, counts, detail lookup, or file read.
- [Services](../workflow/services.py) coordinate upload/persistence and apply decisions.
- [Storage](../workflow/storage.py) contains the local and Vercel Blob adapters. Tests can mock this boundary.
- Frontend features share the API client, document viewer, pagination controls, and confirmation dialog.

## Data model

[Submission](../workflow/models.py) contains:

| Field                                       | Purpose                                                          |
| ------------------------------------------- | ---------------------------------------------------------------- |
| `id`                                        | UUID used in public API paths                                    |
| `title`, `owner`                            | Required title (maximum 200 characters) and submitting user      |
| `blob_path`                                 | Unique private storage reference; never serialized to the client |
| `original_filename`, `content_type`, `size` | File metadata for display and serving                            |
| `status`, `created_at`                      | Workflow state and creation time                                 |
| `reviewed_by`, `reviewed_at`                | Final decision attribution; null while pending                   |

Owner/date and status/date indexes support the list queries. Foreign keys protect referenced users from deletion. A database check constraint requires either a pending row without review metadata or an approved/rejected row with both reviewer and timestamp.

## Final decisions

```text
                    ┌── approved (final)
pending ────────────┤
                    └── rejected (final)
```

Only a reviewer can decide. The service applies one SQL `UPDATE` constrained by the submission ID and `status='pending'`. If it updates zero rows, the request returns `409 Conflict`; an existing decision is never overwritten. This avoids a read-then-save race. Tests cover repeated/conflicting requests and stale instances. Simultaneous transactions against Neon are a separate load/concurrency check, not a claim made by the SQLite test suite.

The same centered confirmation dialog is used by direct list actions and the document screen. Cancel leaves the record unchanged; saving disables duplicate actions. The document screen waits for the preview to load. Direct list decisions allow the reviewer to choose whether to open the file first. A saved result shows reviewer/time and offers back-to-queue or the next matching pending document.

## Upload and storage lifecycle

1. The submitter enters a title and selects a file.
2. The browser previews the local file at 100% in a compact dialog; it has not uploaded it yet. Back returns to the details with inputs preserved; cancel sends nothing. An unreadable preview cannot be submitted through the UI.
3. On final submission, the backend independently validates the title, number of files, size, extension, and actual document bytes.
4. The storage adapter uploads to a random UUID path in private Blob.
5. The service creates a pending database row owned by the signed-in user.
6. If database persistence fails, it attempts to delete the object. A cleanup failure logs its path for later recovery.
7. The UI returns to the list, clears filters that could hide the new item, and highlights its pending row.

PDF and DOCX files are limited to **4,000,000 bytes**. This keeps normal multipart uploads and proxied downloads below the hosting function's payload ceiling. PDFs must parse, contain pages, and be unencrypted. DOCX validation rejects malformed XML/archives, encrypted entries, VBA payloads, embedded files, external resources other than hyperlinks, and excessive archive expansion. These checks are not malware scanning.

A process crash between storage and database writes can leave an orphan. Distributed transactions and background reconciliation were kept out of this iteration. Network retries can also create duplicate submissions after an ambiguous successful upload; an idempotency key is a production improvement.

## Authentication and isolation

Django database-backed sessions use password hashing, HttpOnly cookies, SameSite=Lax, and CSRF checks, including login. Cookies are Secure outside local debug mode and HTTPS is enforced. Logout invalidates the session. Seed passwords come from environment configuration.

Submitters only see their own documents. Reviewers see documents in their workspace; demo and ordinary workspaces remain separate. All list results, counts, submitter choices, details, downloads, and decisions use this scope. Inaccessible submission IDs return 404. A caller cannot choose the owner or initial status on upload.

The file endpoint retrieves bytes from private storage after authorization and sends `Cache-Control: private, no-store`. The frontend never receives a Blob token, database credential, or private storage reference. UUIDs make paths difficult to guess but do not replace permission checks.

## Shared demo

`DEMO_ENABLED=1` enables fixed `demo_submitter` and `demo_reviewer` identities. They have unusable passwords; one-click entry uses real Django sessions and CSRF rather than a frontend role toggle. Role switching rotates the session. Ordinary password accounts cannot access demo documents, and the demo reviewer cannot access ordinary submissions.

`seed_demo` is explicit and idempotent: it creates the identities and synthetic samples, preserves existing decisions, and refuses collisions with ordinary or privileged accounts. The empty demo reviewer queue offers a fresh sample; this creates a new record and never resets an earlier one. Both demo identities can use that endpoint, while ordinary accounts cannot.

The workspace is shared by evaluators. New demo entry can be disabled with `DEMO_ENABLED=0`; deactivate the two demo accounts as well to end existing demo access. Login and sample creation have in-process throttles, which do not provide a distributed quota across serverless instances.

## Frontend choices

- **PDF:** React-PDF with a bundled PDF.js worker. **Word:** docx-preview in a script-free sandboxed iframe, restrictive CSP, and no external resources. Word pagination/fonts may differ from Microsoft Word.
- **Loading:** viewers are lazy-loaded. Local previews read a `File`; saved previews fetch authorized bytes. Preview retry and invalid-file replacement are explicit states.
- **Sizing:** local previews default to Actual size (100%). Saved documents use Automatic sizing, with Fit page, Fit width, Actual size, and manual zoom available.
- **Lists:** server-side pagination (20 rows), scoped counts, title/filename search, status filters, date/status sorting, and a searchable submitter filter for reviewers. Stable tie-breakers prevent duplicates across pages.
- **Navigation:** list selections survive opening a document. Search is debounced and stale requests are cancelled. Return, window focus, and manual refresh update the list; there is no polling or websocket subscription.
- **Accessibility:** labeled controls, keyboard submitter selection, native modal dialogs, focus restoration, and live announcements. This does not replace an independent accessibility audit.

## Scope choices and next steps

One ordinary reviewer, seeded users, synchronous uploads, and a small same-origin app keep the core workflow easy to understand. PostgreSQL provides durable state; Blob keeps files out of database rows and ephemeral function disks. Registration, comments, reassignment, editing, resubmission, and multi-stage approvals are outside this iteration.

For production, prioritize:

1. Isolate preview/production resources and verify concurrent decisions against PostgreSQL under load.
2. Add a shared rate limiter, upload quotas, malware scanning/quarantine, and demo expiry.
3. Add upload idempotency, orphan reconciliation, and immutable audit events.
4. Add metrics/alerts, backups, retention rules, and tested restore procedures.
5. Introduce indexed text search/cursor pagination if data volume warrants it; virtualize long PDFs and expand Word/browser compatibility checks.

Larger uploads require a different direct-upload and authorization design, rather than increasing the limit on the current server-proxied route.
