# Testing and verification

[Back to README](../README.md)

## One command

Install dependencies using the README, then install Chromium once:

```sh
pnpm exec playwright install chromium
pnpm test
```

On Linux CI, install browser OS dependencies with `pnpm exec playwright install --with-deps chromium`.

[scripts/test.sh](../scripts/test.sh) runs, in order:

1. Backend pytest tests.
2. Frontend Vitest tests.
3. TypeScript checking and the production Vite build.
4. Real Chromium journeys through Django and the built frontend.

It stops on the first failing stage. `PYTHON_BIN` can override `.venv/bin/python` for backend tests; Playwright's local server configuration expects the repository's `.venv`.

## Coverage

The verified suite contains **84 backend tests, 17 component tests, and 29 browser tests**. These are executed test cases, not percentages of line or branch coverage. The authoritative result for a submitted commit is its [GitHub Actions run](https://github.com/udaykiransuram/papertrail-document-approval/actions/workflows/tests.yml).

| Area                           | Checks                                                                                                                                    | Source                                                                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Authentication and permissions | Login/logout, CSRF, session expiry, owner isolation, reviewer-only decisions, idempotent seeding                                          | [Backend workflow tests](../workflow/tests/test_workflow.py), [API client tests](../frontend/src/api.test.ts)                   |
| Upload and storage             | File types/bytes/size/count, invalid titles, private reads, upload failure, database rollback cleanup, cleanup logging                    | [Workflow tests](../workflow/tests/test_workflow.py), [storage tests](../workflow/tests/test_storage.py)                        |
| Decisions                      | Approval, rejection, repeated/conflicting requests, stale instances, final-state metadata                                                 | [Workflow tests](../workflow/tests/test_workflow.py), [reviewer actions](../e2e/reviewer-actions.spec.ts)                       |
| Lists                          | Pagination boundaries, stable ordering, status/search/owner combinations, scoped counts, invalid parameters                               | [Listing tests](../workflow/tests/test_listing.py), [browser workflow](../e2e/workflow.spec.ts)                                 |
| Submitter experience           | Local PDF/DOCX preview, back/cancel, unreadable-file replacement, disabled duplicate save, return to list and reset hidden filters        | [Upload browser tests](../e2e/upload-preview.spec.ts), [upload component tests](../frontend/src/features/UploadDialog.test.tsx) |
| Reviewer experience            | Centered confirmation, cancel/focus restoration, direct list decisions without reading file bytes, retry/conflict, next-review navigation | [Reviewer actions](../e2e/reviewer-actions.spec.ts), [completion journeys](../e2e/completion.spec.ts)                           |
| Preview                        | Multi-page PDF/Word rendering, zoom and fit modes, failed previews, sandbox, desktop/mobile sizing                                        | [Browser workflow](../e2e/workflow.spec.ts), [sizing tests](../frontend/src/features/viewer/sizing.test.ts)                     |
| Recovery                       | Session expiration, upload failure with retained inputs, failed role switching, decision conflicts and failed refresh                     | [Recovery journeys](../e2e/recovery.spec.ts)                                                                                    |
| Shared demo                    | Fixed identities, session rotation, workspace isolation, disabled demo, throttling, sample seeding, backend sample packaging              | [Demo backend tests](../workflow/tests/test_demo.py), [demo browser test](../e2e/demo.spec.ts)                                  |

## Isolation and fixtures

Backend tests use `config.test_settings`, SQLite, and mocked external storage. Browser tests use `config.e2e_settings`, reset only `var/e2e.sqlite3`, and write private files under `var/e2e-documents/`. They do not use Neon or Blob and do not flush the normal application database.

The fixed test password and fast password hasher are confined to these test settings. Login/sample throttles are raised for browser tests. Never deploy either test settings module.

The three-page PDF and two-page DOCX in [workflow/samples](../workflow/samples/) are used by browser tests and backend demo setup. Matching files under `frontend/public/samples/` let the browser select synthetic samples without authentication. Both locations are needed: the Python deployment bundles backend assets independently of public frontend assets. A regression test checks that they match and that the backend works without the frontend public directory.

To intentionally regenerate both sample sets:

```sh
.venv/bin/python scripts/make_fixtures.py
```

Normal setup and test runs use the committed files and do not regenerate them. Test-specific malformed documents and mocked failures remain in test code.

## Individual checks

```sh
.venv/bin/python -m pytest
pnpm test:unit
pnpm build
pnpm test:e2e
.venv/bin/python manage.py makemigrations --check --dry-run --settings=config.test_settings
```

`test:e2e` requires a current frontend build and a free port **8011**. It starts/stops its own Django server; no manual server is required. A focused browser file can be run with `pnpm exec playwright test e2e/upload-preview.spec.ts`.

## Evidence and CI

[GitHub Actions](../.github/workflows/tests.yml) runs on pushes, pull requests, and manual dispatch with Python 3.12, Node 22, and pnpm 10.32.1 on Ubuntu 24.04. It installs locked dependencies, checks migrations, and invokes `pnpm test` with read-only repository permissions and no cloud secrets.

Screenshots are written to the OS temporary directory under `papertrail-qa/`; failures and traces use `papertrail-playwright/`. CI retains those artifacts and the test log for seven days. Focused tests (`test.only`) fail CI. DOM snapshots are disabled in traces because the Word iframe deliberately prohibits scripts; action logs and screenshots remain available.

Browser checks cover Chromium at 1440×1000, 1920×1080, and 390×844. Production checks have also exercised real Neon/Blob uploads and authorized downloads, PDF/DOCX previews, saved decisions, and submitter status. The latest upload journey was checked live on October 11, 2026: preview remained local, both uploads returned to the list, and the new pending documents stayed visible despite previous filters.

## Limits

The automated suite does not claim full application coverage. It does not cover simultaneous Neon transactions under load, multiple browser engines, arbitrary complex Word layouts, cloud outages, or an independent accessibility audit. No measured line/branch coverage target is configured; the brief asks for critical flow coverage.

Vercel's Git deployment runs independently of GitHub Actions. A green test job is not currently a deployment prerequisite. Configure branch protection/release gating before relying on CI as a production gate.
