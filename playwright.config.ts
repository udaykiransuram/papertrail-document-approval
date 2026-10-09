import { defineConfig } from "@playwright/test";
import { tmpdir } from "node:os";
import path from "node:path";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  reporter: "list",
  outputDir: path.join(tmpdir(), "papertrail-playwright"),
  use: {
    baseURL: "http://127.0.0.1:8011",
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
  },
  webServer: {
    command:
      ".venv/bin/python scripts/prepare_e2e.py && .venv/bin/python manage.py collectstatic --noinput --settings=config.e2e_settings && .venv/bin/python manage.py runserver 127.0.0.1:8011 --noreload --settings=config.e2e_settings",
    url: "http://127.0.0.1:8011/api/session/",
    reuseExistingServer: false,
    timeout: 30000,
    env: { DOCUMENT_STORAGE: "local", DJANGO_DEBUG: "1" },
  },
});
