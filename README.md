# Papertrail — Document Approval Workflow

A complete React and Django workflow: sign in, submit a PDF or Word document, read it inside the application, and record one final approval or rejection.

**Live application:** [Papertrail](https://papertrail-document-approval.vercel.app/). **Source:** [GitHub](https://github.com/udaykiransuram/papertrail-document-approval). Deployed and verified on Vercel with Neon PostgreSQL and private Vercel Blob on October 9, 2026. Walkthrough recording: pending.

## Try the demo

Open [Papertrail](https://papertrail-document-approval.vercel.app/) and choose **Try as Submitter** or **Try as Reviewer**. No credentials are needed for the shared demo.

1. As Submitter, choose **Submit document**, then **Use sample PDF** or **Use sample Word** and submit.
2. Select **Switch to Reviewer**, open the document, and approve or reject it.
3. Select **Switch to Submitter** to see the saved decision.

The reviewer queue also starts with a sample PDF and Word document. Decisions are final; to try again, submit another sample. This is a shared workspace: use synthetic content only. Normal account sign-in remains available and its documents are isolated from the demo.

## Run locally

Requirements: Python 3.12, Node.js 22+, pnpm 10.32.1, and a Chromium installation for the browser tests. Commands below use macOS/Linux; use WSL on Windows.

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.lock
corepack enable
corepack prepare pnpm@10.32.1 --activate
pnpm install --frozen-lockfile
.venv/bin/python scripts/setup_local.py
pnpm build
.venv/bin/python manage.py collectstatic --noinput
.venv/bin/python manage.py runserver 127.0.0.1:8000
```

Open **http://127.0.0.1:8000**. The setup command creates a private, git-ignored `.env` with random passwords, applies migrations, and seeds these accounts:

| Username | Name | Role | Password variable in `.env` |
| --- | --- | --- | --- |
| `alex` | Alex Morgan | Submitter | `SEED_ALEX_PASSWORD` |
| `jamie` | Jamie Chen | Submitter | `SEED_JAMIE_PASSWORD` |
| `reviewer` | Morgan Reed | Reviewer | `SEED_REVIEWER_PASSWORD` |

Passwords are real Django password hashes in the database. There is no registration. The role selector is limited to the two dedicated demo accounts. `seed_users` is idempotent: it updates the same three accounts and resets their passwords to the environment values. It validates all passwords before changing any accounts. Evaluators can use one-click demo access instead of receiving passwords.

Local setup deliberately uses SQLite and files in `var/documents/` so the workflow runs without cloud accounts. It refuses to run against a configured cloud database. Production uses Neon and private Vercel Blob; local file storage is rejected on Vercel or when debug is disabled. Neither credentials nor uploaded files are committed.

For frontend hot reload, keep Django running and run `pnpm dev` in a second terminal. Open **http://127.0.0.1:5173**. Vite proxies `/api` to Django, so browser requests remain same-origin. For the built frontend, rerun `pnpm build` and `collectstatic` after changes, then restart Django so its cached HTML shell references the new asset filenames.

Representative documents are included in `workflow/tests/fixtures/` and bundled for the demo in `frontend/public/samples/`: a three-page PDF and two-page DOCX. Both contain synthetic project content, with no user documents or personal data.

## Test

One-time browser setup, then a single command runs all verification:

```sh
pnpm exec playwright install chromium
pnpm test
```

`pnpm test` runs pytest, Vitest, TypeScript compilation, the production Vite build, and Playwright. On Linux CI, use `pnpm exec playwright install --with-deps chromium` for browser system dependencies. Individual commands are `.venv/bin/python -m pytest`, `pnpm test:unit`, `pnpm build`, and `pnpm test:e2e` (requires a current build).

Latest verification: **68 backend tests, 15 frontend tests, and 18 browser tests passed**. Coverage includes:

- One-click demo entry, session rotation on role switch, sample PDF/Word journeys, idempotent demo setup, account-collision protection, and isolation of lists, counts, submitter choices, details, file bytes, and decisions between ordinary and demo accounts.
- Real login/logout and CSRF, server-derived ownership, private file access, reviewer-only decisions, status filters, and idempotent seeding.
- Valid and invalid file content, type and size limits, multiple files, missing title, DOCX external resources and embedded files.
- Upload failure creates no submission; database failure triggers Blob cleanup; cleanup failure is logged; file-fetch failure is surfaced.
- Approval, rejection, repeated decisions, conflicting decisions, and stale model instances cannot overwrite a saved decision.
- Three-page PDF and two-page Word rendering, actual Word zoom, both end-to-end decision journeys, status persistence, isolated submitter access, preview retry, malformed PDF/DOCX errors, login errors, desktop and mobile overflow checks.
- Twenty-row page boundaries, stable ordering without duplicate records between pages, every status tab, date/status/submitter sorting, combined submitter-and-status filters, permission-scoped counts, invalid query parameters, and clamping a page that disappears after a review.
- A browser journey with more than sixty submissions checks combined document search, submitter selection, sorting, top/bottom next/previous-page controls, mobile controls, and preserving page/search/filter/sort selections when returning from a document.
- Document searches match title or filename before pagination and preserve ownership; tests cover whitespace, case-insensitivity, literal special characters, empty results, scoped counts, and query-length validation.
- Searchable submitter keyboard navigation, name/username matching, empty results, Escape and outside dismissal, selection and clearing. PDF/Word sizing checks cover automatic width, actual zoom, full-page fitting, and wide/mobile viewports.

Recovery browser tests remove the real session cookie, abort or reject uploads, interrupt demo role switching, and save a decision through a separate request before the stale page acts. They verify reauthentication, retained upload inputs, unchanged roles on failure, saved outcomes, retry controls, and recovery when conflict refresh also fails. Permission errors are distinguished from expired sessions, including private document reads.

Backend tests mock storage. Browser tests use a separate SQLite database at `var/e2e.sqlite3` and private local files at `var/e2e-documents/`; they never contact Neon or Blob and never flush the application database. The fixed password in test sources applies only to this isolated test configuration, which uses a fast test-only password hasher. The browser configuration also raises the login throttle to 1,000/minute because all test sessions use one IP; production remains at 20/minute. Never deploy `config.test_settings` or `config.e2e_settings`.

Browser artifacts are written under the operating system's temporary directory in `papertrail-qa/` and `papertrail-playwright/`. The tested viewports are 1440×1000, 1920×1080, and 390×844 in Chromium. Production verification additionally covered real Neon/Blob uploads and byte-for-byte authorized downloads, CSRF, ownership isolation, reviewer permissions, oversized uploads, PDF/Word previews, saved decisions, conflicting/repeated decisions, combined search/filters, and logout. Neon-specific simultaneous-request concurrency, other browser engines, and arbitrary complex Word layouts remain unverified.

### Automatic GitHub checks

[Tests](.github/workflows/tests.yml) runs on every push and pull request, and can also be started manually from the repository’s Actions tab. It installs the locked dependencies on Ubuntu 24.04 with Python 3.12, Node 22, and pnpm 10.32.1; checks for missing migrations; then runs the same `pnpm test` command used locally. Chromium and its system dependencies are installed using [Playwright’s CI setup](https://playwright.dev/docs/ci).

The workflow uses read-only repository permissions and no application or cloud secrets. Tests run against temporary SQLite and local document storage. Logs, screenshots, and failure traces are retained as a `test-evidence` artifact for seven days, including when tests fail. New commits cancel superseded runs on the same branch or pull request. Focused tests (`test.only`) fail CI rather than silently skipping the rest of the suite.

Failure traces keep action logs and screenshots. DOM snapshots are disabled because their recording scripts cannot run inside the script-free Word preview sandbox.

Vercel’s Git integration deploys independently of these checks. This workflow does not configure branch protection or make a successful test run a prerequisite for deployment. Configure those separately if release gating is needed. Real PostgreSQL concurrency, load testing, additional browser engines, automated accessibility auditing, measured line/branch coverage, and scheduled cloud integration checks remain outside this suite.

## Deploy to Vercel

The root is one Django Vercel project. `pyproject.toml` selects `config.wsgi:application`; `vercel.json` runs `scripts/build.py`, which installs the locked frontend dependencies and builds Vite. Vercel then runs `collectstatic` and serves static assets from its CDN. Django serves the HTML shell and `/api` from the same origin. This follows [Vercel's native Django support](https://vercel.com/docs/frameworks/full-stack/django).

1. Create a Neon Postgres database and obtain its pooled connection string with `sslmode=require`. Place the database near the Vercel function region.
2. Create a **private** Vercel Blob store and connect it to the project. Enable the connection's read-write token environment variable: this Python adapter uses `BLOB_READ_WRITE_TOKEN`. A public store is not suitable for this application. See [private Blob storage](https://vercel.com/docs/vercel-blob/private-storage).
3. Import this repository in Vercel with the Django framework, repository root as Root Directory, Node 22+, and Python 3.12. Do not select Vite as the deployment framework. Alternatively, use a recent authenticated Vercel CLI (`vercel deploy`; native Django requires CLI 50.38.0 or later).
4. Configure the environment variables below for the intended deployment environment. Use separate Neon databases/branches and Blob stores for preview and production.
5. Run migrations and seed accounts **explicitly before releasing**. Neither runs during build or request handling. Once the matching environment variables are securely loaded into the shell, run:

   ```sh
   .venv/bin/python manage.py migrate --noinput
   .venv/bin/python manage.py seed_users
   # For the public assignment demo only (DEMO_ENABLED=1):
   .venv/bin/python manage.py seed_demo
   .venv/bin/python manage.py check --deploy
   ```

   `config/settings.py` loads `.env` if present and respects already-exported environment variables. Load the intended release configuration rather than accidentally using the offline `.env`. For administrative migrations, a direct Neon connection may be used instead of the pooled runtime URL.
6. Deploy a preview. Complete the smoke check below against its actual URL. Promote it to production only after the checks pass, and then record the verified live URL here.

| Variable | Production value |
| --- | --- |
| `DJANGO_SECRET_KEY` | Long random secret; generate with `python -c "import secrets; print(secrets.token_urlsafe(64))"` |
| `DJANGO_DEBUG` | `0` (debug is always disabled on Vercel) |
| `DJANGO_ALLOWED_HOSTS` | Comma-separated exact domains, without schemes; Vercel URL environment values are added automatically |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | Exact HTTPS app origins, comma-separated |
| `DATABASE_URL` | Neon Postgres URL with TLS and credentials |
| `DOCUMENT_STORAGE` | `vercel` |
| `DEMO_ENABLED` | `1` for the public assignment demo; defaults to `0` |
| `BLOB_READ_WRITE_TOKEN` | Server-only token for the private store |
| `SEED_ALEX_PASSWORD`, `SEED_JAMIE_PASSWORD`, `SEED_REVIEWER_PASSWORD` | Distinct strong passwords used by the explicit seed command |
| `DJANGO_SETTINGS_MODULE` | Leave unset or set `config.settings`; never use test settings |

No variable containing a credential should have a `VITE_` prefix. The client never receives the Blob token, database URL, or raw Blob reference. Keep the seed passwords in a secret store for account maintenance; they are not needed during normal requests. `.python-version`, the frontend lockfile, exact primary Python versions, and `requirements.lock` record the tested environment. `requirements.lock` includes testing dependencies for reproducible local setup; Vercel installs runtime dependencies from `pyproject.toml`.

The deployment check reports two optional HSTS warnings (`security.W005`, `security.W021`): subdomain enforcement and preload are intentionally unset until the production domain's policy is known. HTTPS redirect, secure cookies, and one-hour HSTS are already enabled outside local debug mode.

The initial hosted demo uses Python 3.12, Node 24, Neon PostgreSQL 18 in AWS US East 1, and private Blob in IAD1. Migrations and the three seeded accounts were initialized before deployment. Demo credentials are stored in the operator's git-ignored `.env.production.local`; database configuration is in `.env.neon.local`. Neither file is uploaded with the source. The initial Preview environment shares the demo database and Blob store with Production; isolate these resources before using preview deployments for development or real documents. Use the public application URL above: Vercel's team/deployment URLs can require Vercel authentication.

### Deployment smoke check

- Open the live login page, ensure built assets and the PDF worker load, and verify login/logout over HTTPS.
- Sign in as `alex`, upload the PDF fixture, and confirm all three pages and zoom work.
- Sign in as `jamie`, verify Alex's submission is absent, and verify the copied detail/file API URLs return 404.
- Sign in as `reviewer`, find the pending submission, read it inside the app, approve it, and confirm a second/conflicting decision returns 409.
- Sign in as `alex` again and confirm Approved persists. Repeat with Jamie's DOCX and a rejection.
- Confirm the stored object is private, direct unauthenticated file API access fails, and 4 MB+ uploads are rejected. Check Vercel logs for storage or database failures.
- Record the verified live URL and verification date above; add the walkthrough URL when the recording is available.

## Architecture and decisions

```text
Browser: React + TypeScript
        │ same-origin session cookie + CSRF token
        ▼
Vercel: Django REST API + HTML shell     Vercel CDN: built JS/CSS/fonts/PDF worker
        ├── Neon PostgreSQL: users, sessions, submissions, decisions
        └── Private Vercel Blob: original document bytes
```

The `Submission` model stores UUID, title, owner, private Blob path, original filename, MIME type, byte size, status, submission timestamp, reviewer, and review timestamp. Indexes support owner/date and status/date lookups. A database constraint keeps pending/final review metadata consistent. The reviewer role comes from a Django group. The ordinary reviewer handles ordinary submissions; the demo reviewer handles only demo submissions. There is no assignment UI.

Upload validation runs in the browser for fast feedback and again on the server using actual bytes. Supported files are PDF and modern `.docx`, maximum **4,000,000 bytes**. Legacy `.doc`, encrypted files, malformed documents, macros, embedded objects, and externally linked Word resources are rejected. Ordinary Word hyperlinks are allowed but inactive in the preview. ZIP expansion is capped. The 4 MB cap leaves room for normal multipart overhead under [Vercel's 4.5 MB function payload limit](https://vercel.com/docs/functions/limitations) and keeps authenticated file responses within that limit. Oversized overall requests may be rejected by the platform before Django runs.

The server creates an unguessable UUID storage path and uploads through the official Python Blob SDK with `access="private"`. Only a successful upload is followed by database persistence. If persistence fails, the server attempts to delete the new object; cleanup failures log the object path for recovery. A process crash between upload and persistence can still leave an orphan; reconciliation is a production improvement.

Every list, detail, and file request is scoped to the signed-in owner, unless the user is the reviewer for that workspace. Inaccessible IDs return 404. Document content is fetched by Django and returned with `Cache-Control: private, no-store`; the browser renders those bytes. Filenames are not used as filesystem paths. No public document URLs are exposed.

Decisions use one SQL update equivalent to `UPDATE ... WHERE id = ? AND status = 'pending'`. One updated row wins; zero rows returns 409. This is atomic in PostgreSQL, so concurrent requests cannot overwrite a final decision. Submitters cannot decide, and reviewers cannot submit through the API. Accepted transitions are only `pending → approved` or `pending → rejected`.

Session authentication uses Django's database-backed sessions, password hashing, HttpOnly cookies, SameSite=Lax, and CSRF checks, including on login. Production cookies are secure and HTTPS is enforced. Database connections use `CONN_MAX_AGE=0` with server-side cursors disabled for the pooled Neon connection. Login throttling is a small in-process guard, not distributed brute-force protection.

### Public demo access

`DEMO_ENABLED=1` exposes the one-click entry controls and `POST /api/demo/login/` with `{"role":"submitter"}` or `{"role":"reviewer"}`. The endpoint requires CSRF and uses the same session cookies and login throttle as password login. It accepts only those fixed role names, and only signs in active, non-privileged accounts carrying the `demo` group. No passwords or credentials are embedded in the frontend.

Run `manage.py seed_demo` explicitly against the intended database and storage. If storage credentials are only available in the hosted runtime, use `--accounts-only` and submit the two bundled samples through the hosted demo afterward. It creates `demo_submitter` and `demo_reviewer` with unusable passwords, and uploads the two bundled synthetic samples through the normal storage service. Rerunning it preserves sample decisions and does not duplicate the samples; it refuses collisions with ordinary or privileged accounts. To enable this in an existing local setup, add `DEMO_ENABLED=1` to `.env`, run the command, and restart Django.

Both demo identities intentionally share one public evaluation workspace. Existing ordinary accounts remain separate. Setting `DEMO_ENABLED=0` disables new demo logins and role switches; it does not revoke existing sessions. For permanent shutdown, deactivate both demo accounts as well. Production use should disable demo entry; a longer-lived public demo should add storage quotas, distributed throttling, and expiry/reset of synthetic data.

### Frontend behavior

- Submitters see their own documents and upload a title plus one file. Reviewers initially see pending submissions. All documents, Pending, Approved, and Rejected tabs use server-side filtering and twenty records per page.
- Both roles can sort by submitted date (newest/oldest) or status (pending/approved/rejected, or the reverse). Reviewers also have a searchable Submitted by picker (name or username) and alphabetical submitter sorting. A document search matches title or original filename for either role, case-insensitively, across all pages. Counts reflect the document search and selected submitter. Changing a search, filter, or sort starts at page one. Previous/next controls appear above and below the table. Search requests are debounced by 250 ms and stale requests are cancelled; clear-filter and no-results states help recover from an over-specific search.
- Lists refresh on navigation back, window focus, and the refresh button. Page, search, filter, submitter, and sort selections survive opening a document and returning to the list, and reset at sign-out. If reviewing the final item empties the last page, the API clamps to the nearest remaining page. Decision responses update the review screen immediately; conflicts fetch the saved decision.
- PDF rendering uses React-PDF and a locally bundled PDF.js worker; Word uses docx-preview. The heavy viewers load only when a document is opened.
- Word output is placed in a sandboxed iframe with scripts disabled and a restrictive content policy. External resources and HTML alternate chunks are not rendered. Word pagination, fonts, and layout may differ from Microsoft Word.
- The review screen uses a compact back/title/status row. The document fills the remaining window height, with a narrow details sidebar that fits its content. Automatic sizing keeps the page at its natural CSS size on larger screens and shrinks to fit narrow screens. Named controls offer Fit page, Fit width, and Actual size; manual zoom is 10–300% of natural size. PDF points are converted at 96 CSS pixels per inch, matching Word preview sizing. Fit page uses the first page dimensions and keeps it within the viewer height, with space for the page caption; mixed page sizes and complex Word layouts may vary. The viewer supports scrolling independently of the surrounding page. Desktop decision controls remain visible while the document scrolls; panels stack on mobile. Decisions require a loaded preview and an explicit confirmation.
- Loading, empty results, validation errors, storage failures, failed previews, retry, and login errors have visible states. Document preview is a rendering aid, not an assertion that a file is safe or that every page has been read.

No registration, Google login, editing, reassignment, resubmission, comments, or multi-stage approval is included in this iteration.

## API

All paths end with `/`. Session/login are public; every other endpoint requires a signed-in session. Send `X-CSRFToken` on state-changing requests. `/api/session/` provides a token and sets its cookie; login rotates the token, so use the one in the login response for later writes.

| Method and path | Input | Result |
| --- | --- | --- |
| `GET /api/session/` | — | `{user: null or user, csrfToken}` |
| `POST /api/login/` | JSON `{username, password}` | `{user, csrfToken}` |
| `POST /api/logout/` | — | `{message}` |
| `GET /api/submissions/` | Optional `q`, `status`, `owner`, `page`, `sort` | Paginated results and scoped counts (below) |
| `POST /api/submissions/` | Multipart `title`, `file` | 201 with the pending submission |
| `GET /api/submissions/{uuid}/` | — | Submission metadata |
| `GET /api/submissions/{uuid}/file/` | — | Authorized PDF/DOCX bytes |
| `POST /api/submissions/{uuid}/decision/` | JSON `{status: "approved"}` or `"rejected"` | Updated submission |

A submission contains `id`, `title`, `owner` (`id`, `name`, `username`), `original_filename`, `content_type`, `size`, `status`, `created_at`, `reviewed_by`, `reviewed_at`, and a same-origin `file_url`. Review fields are null while pending. `blob_path` is never serialized. Caller-provided owner/status values on creation do not override server ownership or pending status.

List queries accept `q=<title or filename text>` (trimmed, at most 200 characters), `status=pending|approved|rejected` (omit for all), `owner=<submitter ID>`, a positive `page` (default 1), and `sort=newest|oldest|status_asc|status_desc|submitter_asc|submitter_desc` (default newest). Sorting includes deterministic tie-breakers. `status_asc` orders pending, approved, then rejected; `status_desc` reverses that order. Ownership permissions are applied before any filter or count. Out-of-range pages clamp to the last available page; malformed parameters return 400.

Example: `GET /api/submissions/?status=pending&owner=1&sort=oldest&page=2` returns:

```json
{
  "results": [],
  "page": 2,
  "page_size": 20,
  "count": 25,
  "total_pages": 2,
  "counts": {"all": 32, "pending": 25, "approved": 5, "rejected": 2},
  "submitters": [{"id": 1, "name": "Alex Morgan", "username": "alex"}]
}
```

`results` is abbreviated above; this example's second page contains five submission objects. `count` applies to the current status, search, and owner filters; `counts` includes each status under the current search and owner filters across all pages. For reviewers, `submitters` includes document owners across the permitted queue, independent of active filters. For submitters that field is empty.

Errors use `{message, code?, fields?}`. Typical statuses: 400 validation, 401 bad login, 403 missing authentication/CSRF/role permission, 404 unavailable submission, 409 already reviewed, 429 login throttled, and 503 storage/persistence unavailable. DRF session authentication intentionally uses 403 for unauthenticated protected endpoints. Their `not_authenticated` code returns the browser to sign-in and refreshes the CSRF token; a `permission_denied` error leaves a valid session intact.

### Example API client

Run this from the repository using the configured local seed password; `httpx2` is a dependency of the installed SDK:

```python
import os
from pathlib import Path
import httpx2 as httpx
from dotenv import load_dotenv

load_dotenv()
with httpx.Client(base_url="http://127.0.0.1:8000") as client:
    session = client.get("/api/session/").json()
    result = client.post("/api/login/", json={
        "username": "alex", "password": os.environ["SEED_ALEX_PASSWORD"],
    }, headers={"X-CSRFToken": session["csrfToken"]})
    result.raise_for_status()
    headers = {"X-CSRFToken": result.json()["csrfToken"]}
    with Path("workflow/tests/fixtures/project-proposal.pdf").open("rb") as file:
        response = client.post("/api/submissions/", data={"title": "Project proposal"},
                               files={"file": ("proposal.pdf", file, "application/pdf")},
                               headers=headers)
    response.raise_for_status()
    submission = response.json()
    print(submission["id"], submission["status"])
    print(client.get("/api/submissions/?status=pending").json())
```

For HTTPS use the deployed base URL and send that same origin as the `Referer` header for CSRF-protected writes. Sign in separately as `reviewer`, use the newly rotated token, then `POST /api/submissions/{id}/decision/` with `{"status":"approved"}`. Repeating that POST returns 409. Do not place passwords in public issue threads or shell command history.

## Project map

```text
config/                         Django settings, WSGI and top-level routes
workflow/models.py              Submission schema, indexes and state constraint
workflow/views.py               Session, login, list, upload, file and decision APIs
workflow/services.py            Upload/persistence coordination and atomic decision
workflow/storage.py             Private Vercel Blob and explicit local adapters
workflow/validation.py          Actual-byte document validation
workflow/management/commands/   Idempotent account seed command
workflow/tests/                 API/storage tests and representative documents
frontend/src/features/          Login, dashboards, upload and review screens
frontend/src/features/viewer/   Lazy PDF and sandboxed DOCX previews
e2e/                           Real browser journeys
scripts/                       Local setup, build, fixtures and test runner
```

## Production improvements

Prioritized follow-up work: isolate preview resources and test simultaneous decisions against PostgreSQL; add a shared login/upload rate limiter; quarantine and scan uploads; add upload idempotency and orphan reconciliation; use indexed full-text search and cursor pagination if substring search or offset performance becomes a concern at much larger scale; add immutable audit events and operational alerts; configure retention, backups and restore procedures; virtualize long PDFs and test complex Word documents and additional browsers. Larger uploads would need a different direct-upload and authorization design instead of increasing this server-proxied limit.

## AI-use disclosure

OpenAI Codex assisted with architecture, code, tests, documentation, browser debugging, and deployment configuration. Image generation produced a visual reference for the reviewer screen; the shipped UI uses HTML/CSS and icons, without generated document content or image assets. Library and deployment choices were checked against official documentation and installed SDK interfaces. Automated tests, rendered browser journeys, and deployed Neon/private Blob checks were run. The walkthrough recording remains pending. The applicant should review and be ready to explain all submitted code.

## Five-minute walkthrough outline

| Time | What to show |
| --- | --- |
| 0:00–0:30 | Explain the problem, the two roles, and the React/Django/Neon/private Blob architecture. |
| 0:30–1:20 | Sign in as Alex, show file validation, upload the PDF, and read multiple pages in-app. |
| 1:20–2:00 | Switch to Jamie, demonstrate isolation, and submit the Word fixture. |
| 2:00–3:00 | Reviewer pending queue: open PDF, scroll/zoom, approve; open Word and reject. |
| 3:00–3:40 | Return to both submitters and show persisted statuses and final decisions. |
| 3:40–4:30 | Show the atomic update, private file endpoint, cleanup behavior, and successful tests. |
| 4:30–5:00 | Explain scope choices, Word preview limits, AI assistance, and production improvements. |

Before handover: verify the live deployment, fill in the live and video links, share repository access, and provide evaluator credentials through a private channel.
