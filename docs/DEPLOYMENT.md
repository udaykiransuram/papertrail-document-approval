# Deployment and operations

[Back to README](../README.md)

The hosted application is [Papertrail](https://papertrail-document-approval.vercel.app/). It runs as one Django project on Vercel, with Neon PostgreSQL and a **private** Vercel Blob store. The site's public URL does not make stored documents public.

## Build and runtime

- [pyproject.toml](../pyproject.toml) declares `config.wsgi:application` and the Python runtime dependencies.
- [vercel.json](../vercel.json) selects Django and runs [scripts/build.py](../scripts/build.py), which installs locked frontend dependencies and builds Vite.
- Vercel collects Django static files and serves them through its CDN. Django serves the HTML shell and `/api` from the same origin.
- `.python-version` pins Python 3.12. Local/CI use Node 22; the existing hosted project uses Node 24. pnpm is pinned to 10.32.1.
- Database migrations and seeding are explicit operations; neither runs on a request or during build.

Reference: [Vercel Django documentation](https://vercel.com/docs/frameworks/full-stack/django), [private Blob documentation](https://vercel.com/docs/vercel-blob/private-storage), and [function limits](https://vercel.com/docs/functions/limitations).

## New deployment

1. Create a Neon PostgreSQL database near the Vercel function region. Obtain a pooled connection string with TLS (`sslmode=require`).
2. Create a **private** Blob store, attach it to the Vercel project, and expose its server-side `BLOB_READ_WRITE_TOKEN` to the deployment.
3. Import the Git repository in Vercel. Select **Django**, repository root as the Root Directory, Python 3.12, and Node 22 or later. Do not select Vite as the project framework.
4. Configure the environment below for the intended deployment. Use separate Neon branches/databases and Blob stores for preview and production.
5. Run migrations and seed commands with that environment securely loaded, then deploy and complete the smoke check.

## Environment variables

[.env.example](../.env.example) is the offline development template. Deployment values belong in Vercel's environment configuration and the release operator's secret store.

| Variable                      | Deployment value                                                                                                     |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `DJANGO_SECRET_KEY`           | Long random secret; never reuse the debug fallback                                                                   |
| `DJANGO_DEBUG`                | `0`; Vercel forces debug off                                                                                         |
| `DJANGO_ALLOWED_HOSTS`        | Comma-separated exact hostnames, without schemes; Vercel's deployment/production host values are added automatically |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | Exact HTTPS app origins, comma-separated                                                                             |
| `DATABASE_URL`                | Neon PostgreSQL connection string with TLS                                                                           |
| `DOCUMENT_STORAGE`            | `vercel`                                                                                                             |
| `BLOB_READ_WRITE_TOKEN`       | Private store read-write token, backend only                                                                         |
| `DEMO_ENABLED`                | `1` for this shared assignment demo; `0` for ordinary private usage                                                  |
| `SEED_ALEX_PASSWORD`          | Strong password used by the explicit account seed command                                                            |
| `SEED_JAMIE_PASSWORD`         | Separate strong password                                                                                             |
| `SEED_REVIEWER_PASSWORD`      | Separate strong password                                                                                             |
| `DJANGO_SETTINGS_MODULE`      | Leave unset or set `config.settings`; never deploy a test settings module                                            |

Credential variables must not use the `VITE_` prefix. Seed passwords are needed for account maintenance, not normal requests. Production refuses local file storage, and Vercel requires `DATABASE_URL`. The Neon adapter uses short-lived connections and disables server-side cursors for pooled connections.

## Release commands

Install Python dependencies first, then load the intended release environment into the shell using your secret manager. Exported variables take precedence over the git-ignored local `.env`. Verify the target environment before running these commands; `scripts/setup_local.py` is only for offline development.

```sh
.venv/bin/python manage.py migrate --noinput
.venv/bin/python manage.py seed_users
# Only for the public assignment demo, with DEMO_ENABLED=1:
.venv/bin/python manage.py seed_demo
.venv/bin/python manage.py check --deploy
```

`seed_users` resets the same three account passwords to the supplied values. `seed_demo` preserves earlier sample decisions. If Blob is only accessible from the hosted runtime, `seed_demo --accounts-only` creates the demo accounts; add sample documents through the deployed UI afterward. Administrative migrations may use a direct Neon connection rather than the pooled runtime URL.

The deployment check may report `security.W005` and `security.W021`: HSTS subdomain enforcement/preload are intentionally unset until the domain policy is known. HTTPS redirects, Secure cookies, and one-hour HSTS are enabled outside debug mode.

The existing Git integration deploys pushes to `main`. CI and Vercel run independently, so check both before handing over a revision. Deploy a preview first for behavior changes, run the smoke check, and promote only after verification.

## Smoke check

Use synthetic content. The public demo is shared; do not rely on earlier samples still being pending.

1. Open the login screen and enter the demo as Submitter. Verify JS/CSS and the PDF worker load.
2. Select the sample PDF, preview all three pages, try zoom, and go back once to check retained inputs. Cancel should create nothing.
3. Preview again and submit. Confirm the list displays a new pending row and a success message. Repeat with the two-page DOCX.
4. Switch to Reviewer. Approve one from the list through the confirmation dialog; open the other in the viewer and reject it. Confirm saved reviewer/time and next/back navigation.
5. Switch back to Submitter and check both persisted statuses. Test search, status filters, and pagination when enough records exist.
6. Using the normal password accounts, submit as Alex and confirm Jamie cannot list or fetch Alex's document. Confirm the ordinary reviewer can decide it, and the demo reviewer cannot access it.
7. Verify logout and rejected anonymous file requests, missing CSRF on a write, an invalid/oversized file, and a repeated decision (`409`). Check runtime logs for storage/database errors.

This complements local tests with actual cloud storage and session behavior. Record the verified commit/date with the handover; no live claim should rest on build success alone.

## Storage and configuration notes

The original demo was provisioned in US East (Neon) and IAD1 (Blob). Preview initially shared the demo's production database/store; isolate those resources before using previews for destructive tests or real documents. Source cleanup does not change account resources or environment settings.

Keep `.env*`, `.vercel/`, local databases/uploads, generated builds, caches, and dependencies out of Git. `.gitignore` and `.vercelignore` protect the handover; release secrets must still be managed outside source control. Share the public app URL with evaluators, because Vercel team/deployment dashboard URLs may require Vercel login.

## Troubleshooting

| Symptom                                        | Check                                                                                                                                              |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend build missing / stale asset filenames | Run `pnpm build`, `collectstatic`, and restart local Django; inspect the Vercel build log when deployed.                                           |
| Demo is not ready                              | Confirm `DEMO_ENABLED=1` and run `seed_demo` (or `--accounts-only`) against the correct database.                                                  |
| Upload/file read returns 503                   | Check Blob is private, the token is attached to this environment, and runtime logs show no storage failure. Do not expose tokens in issue reports. |
| CSRF rejection                                 | Reload the session, use the rotated login token, retain cookies, and check the HTTPS origin/Referer.                                               |
| Sample creation fails after packaging          | Confirm `workflow/samples/` is present in the backend; public frontend files alone are insufficient.                                               |
| Local setup refuses to run                     | Use offline `.env` values (`DATABASE_URL` empty, debug on, local storage); use release commands for cloud environments.                            |

Disabling `DEMO_ENABLED` stops new demo entry and sample actions. Deactivate both demo accounts as well when ending existing demo access. Backups, retention, restore drills, orphan cleanup, and shared throttling remain production follow-ups described in [Architecture](ARCHITECTURE.md).
