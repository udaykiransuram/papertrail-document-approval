# Papertrail — Document Approval Workflow

A React and Django application for submitting documents, reviewing them, and tracking one final approval or rejection. Built for the Document Approval Workflow take-home assignment.

[Live demo](https://papertrail-document-approval.vercel.app/) · [Source code](https://github.com/udaykiransuram/papertrail-document-approval) · [Test runs](https://github.com/udaykiransuram/papertrail-document-approval/actions/workflows/tests.yml)

**Walkthrough video:** pending recording. A [five-minute recording guide and handover checklist](docs/HANDOVER.md) are included.

## Try it in two minutes

No credentials or cloud setup are needed to try the hosted demo.

1. Open the live demo and select **Try as Submitter**.
2. Select **Submit document**, enter a title, and choose a PDF or DOCX. **Use sample PDF** and **Use sample Word** provide synthetic documents if you do not have a file handy.
3. Select **Preview document**. Read or zoom the document, then select **Submit for review**. Nothing is uploaded before this final step. The dialog closes to the list, with the new submission highlighted as **Pending**.
4. Select **Switch to Reviewer**. Open the pending document to review it, or use **Approve** / **Reject** directly in the list. Confirm the decision in the centered dialog.
5. Select **Switch to Submitter** and confirm that the saved status is visible.

The demo is a shared workspace, so use synthetic content. Password-based accounts have a separate workspace. If the demo queue is already reviewed, submit another sample through the steps above. Existing decisions are never reset.

## What is implemented

| Assignment requirement                | Implementation                                                                             |
| ------------------------------------- | ------------------------------------------------------------------------------------------ |
| Submit a document tied to a user      | Required title and one PDF/DOCX, up to 4 MB; ownership comes from the session.             |
| Track submission status               | Submitters see their own pending, approved, and rejected documents.                        |
| Reviewer queue and decisions          | Pending-first queue, in-app reading, explicit confirmation, and saved reviewer/time.       |
| Create, list, fetch, and update APIs  | Django REST Framework endpoints with validation and access checks.                         |
| Error handling                        | Field errors, upload/preview retry, expired-session recovery, and conflict handling.       |
| Meaningful tests and one test command | Backend, component, and browser tests run with `pnpm test`.                                |
| Public hosting and UI polish          | Vercel deployment, search, filters, pagination, keyboard controls, and responsive layouts. |

**Stack:** React 19, TypeScript, Vite, Django 5.2, Django REST Framework, Neon PostgreSQL, and private Vercel Blob. Local development uses SQLite and local document storage; no cloud credentials are required.

## Run locally

Requirements: Python **3.12**, Node.js **22+**, and pnpm **10.32.1**. These commands are for macOS/Linux; use WSL on Windows. Run them from the repository root.

```sh
git clone https://github.com/udaykiransuram/papertrail-document-approval.git
cd papertrail-document-approval
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.lock
corepack enable
corepack prepare pnpm@10.32.1 --activate
pnpm install --frozen-lockfile
.venv/bin/python scripts/setup_local.py
```

If your Node installation does not include Corepack, install the pinned pnpm version with `npm install --global pnpm@10.32.1` instead of the two Corepack commands.

The setup script creates an owner-readable `.env` with generated secrets, runs migrations, and seeds accounts plus demo samples. It preserves an existing `.env` and refuses cloud configurations. Do not copy deployed secrets into the local setup.

Start the backend in one terminal:

```sh
.venv/bin/python manage.py runserver 127.0.0.1:8000
```

Start the frontend in another terminal:

```sh
pnpm dev
```

Open **http://127.0.0.1:5173**. Vite proxies `/api` to Django. Use the same one-click demo controls as the hosted app.

To serve the production build from Django alone:

```sh
pnpm build
.venv/bin/python manage.py collectstatic --noinput
.venv/bin/python manage.py runserver 127.0.0.1:8000
```

Open **http://127.0.0.1:8000**. After rebuilding, rerun `collectstatic` and restart Django so the HTML shell references the current assets.

### Password accounts

Select **Sign in with an existing account** to reveal the username and password fields. When demo access is disabled, the form is shown immediately. Use these accounts to demonstrate isolation between two submitters. Read the generated passwords from your private `.env`; they are never published in the repository.

| Username   | Display name | Role      | Password variable        |
| ---------- | ------------ | --------- | ------------------------ |
| `alex`     | Alex Morgan  | Submitter | `SEED_ALEX_PASSWORD`     |
| `jamie`    | Jamie Chen   | Submitter | `SEED_JAMIE_PASSWORD`    |
| `reviewer` | Morgan Reed  | Reviewer  | `SEED_REVIEWER_PASSWORD` |

`manage.py seed_users` updates these same accounts idempotently, including resetting their passwords to the configured values. The separate demo accounts have unusable passwords and can only be entered through the fixed demo roles when `DEMO_ENABLED=1`.

## Run all tests

Install the browser once, then use one command:

```sh
pnpm exec playwright install chromium
pnpm test
```

This runs pytest, Vitest, TypeScript checking, the production build, and Playwright. The verified suite has **97 backend, 17 component, and 29 browser tests**. Cloud storage is mocked in backend tests; browser tests use their own SQLite database and local files. Neither suite needs Neon or Blob credentials.

[Testing details](docs/TESTING.md) explain coverage, individual commands, CI artifacts, and known limits. Test counts describe this revision, not a line-coverage percentage.

## API at a glance

All routes end with `/`. Authentication uses a Django session cookie. Start with `GET /api/session/` to obtain a CSRF token; send `X-CSRFToken` for writes and use the rotated token returned after login.

| Method | Endpoint                          | Purpose                                                    |
| ------ | --------------------------------- | ---------------------------------------------------------- |
| `GET`  | `/api/session/`                   | Current user, CSRF token, demo availability                |
| `POST` | `/api/login/`, `/api/logout/`     | Start or end a password-authenticated session              |
| `POST` | `/api/submissions/`               | Multipart `title` and `file`; returns a pending submission |
| `GET`  | `/api/submissions/`               | Permitted submissions, filters, pagination, and counts     |
| `GET`  | `/api/submissions/{id}/`          | Submission metadata and saved decision                     |
| `GET`  | `/api/submissions/{id}/file/`     | Document bytes after an access check                       |
| `POST` | `/api/submissions/{id}/decision/` | JSON `{"status":"approved"}` or `{"status":"rejected"}`    |

[API reference](docs/API.md) includes request/response examples, demo endpoints, error shapes, and a runnable client example.

## Design and scope

```text
React browser client
  └── Session cookie + CSRF → Django REST API / HTML shell on Vercel
                               ├── Neon PostgreSQL: users, sessions, submissions
                               └── Private Vercel Blob: original document bytes
Vercel CDN → built frontend assets and synthetic demo samples
```

The data model stores the owner, file metadata, pending/final status, reviewer, and timestamps. The only decision transitions are `pending → approved` and `pending → rejected`. A conditional database update prevents repeated or competing decisions from overwriting the first saved result.

Documents are uploaded before the database record is created. If persistence fails, the backend attempts to delete the uploaded object. Private file access always goes through Django. PDF previews use React-PDF; DOCX previews use docx-preview in a sandboxed iframe.

The application intentionally has no registration, editing, reassignment, resubmission, comments, or multi-stage approval. Seeded roles, a single Django application, and synchronous uploads keep it straightforward to run and explain.

[Architecture and trade-offs](docs/ARCHITECTURE.md) covers the model, authorization, demo isolation, preview behavior, and production improvements. Important limits are the 4 MB upload cap, approximate Word pagination, in-process throttling, and the absence of malware scanning or a full audit log.

## Deployment

[Deployment instructions](docs/DEPLOYMENT.md) cover Vercel, Neon, private Blob, environment variables, explicit migrations/seeding, and the release smoke check. The public demo uses one origin for the frontend and API. Storage and database credentials remain on the server.

## AI-use disclosure

OpenAI Codex assisted with architecture, implementation, tests, documentation, browser debugging, and deployment setup. Image generation was used as a visual reference during UI exploration; the shipped interface uses HTML, CSS, and icons. The bundled sample documents are synthetic. Library choices were checked against official documentation and installed interfaces. Changes were checked with automated tests and browser verification; AI assistance and the key design decisions are part of the walkthrough guide.

## Repository guide

| Path                | Contents                                                                  |
| ------------------- | ------------------------------------------------------------------------- |
| `frontend/src/`     | React screens, shared controls, API client, and viewers                   |
| `workflow/`         | Models, serializers, permissions, services, storage, validation, and APIs |
| `workflow/samples/` | Synthetic PDF/DOCX shared by backend demo setup and browser tests         |
| `workflow/tests/`   | Backend integration and storage tests                                     |
| `config/`           | Django runtime, isolated test settings, and routes                        |
| `e2e/`              | Browser journeys                                                          |
| `scripts/`          | Local setup, build, sample generation, and the test runner                |
| `docs/`             | API, architecture, deployment, testing, and handover documentation        |

Dependency locks, migrations, tests, and required sample assets are included. Local secrets, databases, uploads, dependencies, generated builds, and test artifacts are ignored and are not part of the source handover. See the [handover checklist](docs/HANDOVER.md) for the remaining video and repository-sharing steps.
