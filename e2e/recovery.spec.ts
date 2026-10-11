import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { tmpdir } from "node:os";
const evidence = path.join(tmpdir(), "papertrail-qa");
fs.mkdirSync(evidence, { recursive: true });
const runtimeErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  runtimeErrors.set(page, errors);
});
test.afterEach(({ page }) => expect(runtimeErrors.get(page)).toEqual([]));

async function demo(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /Try as Submitter/ }).click();
  await expect(
    page.getByRole("heading", { name: "My submissions" }),
  ).toBeVisible();
}
async function token(page: Page) {
  return (await (await page.request.get("/api/session/")).json()).csrfToken;
}
async function savedRows(page: Page, title: string) {
  const response = await page.request.get(
    `/api/submissions/?q=${encodeURIComponent(title)}`,
  );
  expect(response.status()).toBe(200);
  return (await response.json()).results;
}
async function prepareReview(page: Page, title: string) {
  await demo(page);
  const response = await page.request.post("/api/submissions/", {
    headers: { "X-CSRFToken": await token(page) },
    multipart: {
      title,
      file: {
        name: "proposal.pdf",
        mimeType: "application/pdf",
        buffer: fs.readFileSync("workflow/tests/fixtures/project-proposal.pdf"),
      },
    },
  });
  expect(response.status()).toBe(201);
  const item = await response.json();
  await page.getByRole("button", { name: "Switch to Reviewer" }).click();
  await expect(
    page.getByRole("heading", { name: "Review queue" }),
  ).toBeVisible();
  await page.locator(".document-link").filter({ hasText: title }).click();
  await expect(
    page.getByRole("button", { name: "Approve document", exact: true }),
  ).toBeEnabled();
  return item;
}

for (const method of ["password", "demo"] as const) {
  test(`${method} session expiry clears the workspace and allows a fresh sign-in`, async ({
    page,
    context,
  }) => {
    if (method === "demo") await demo(page);
    else {
      await page.goto("/");
      await page.getByLabel("Username").fill("alex");
      await page
        .getByLabel("Password", { exact: true })
        .fill("E2e-only-password-924!");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
    }
    await expect(
      page.getByRole("heading", { name: "My submissions" }),
    ).toBeVisible();
    await context.clearCookies({ name: "sessionid" });
    await page.getByRole("button", { name: "Refresh submissions" }).click();
    await expect(page.getByRole("alert")).toContainText(
      "Your session has expired",
    );
    await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
    await page.screenshot({
      path: path.join(evidence, `session-expired-${method}.png`),
      fullPage: true,
    });
    if (method === "demo")
      await page.getByRole("button", { name: /Try as Submitter/ }).click();
    else {
      await page.getByLabel("Username").fill("alex");
      await page
        .getByLabel("Password", { exact: true })
        .fill("E2e-only-password-924!");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
    }
    await expect(
      page.getByRole("heading", { name: "My submissions" }),
    ).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    // Verify that recovery also acquired the new session's CSRF token.
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(
      page.getByRole("button", { name: /Try as Submitter/ }),
    ).toBeVisible();
  });
}

test("session expiry during private file loading returns to sign-in", async ({
  page,
  context,
}) => {
  await demo(page);
  await page.route(
    "**/api/submissions/*/file/",
    async (route) => {
      await context.clearCookies({ name: "sessionid" });
      await route.continue();
    },
    { times: 1 },
  );
  await page
    .locator(".document-link")
    .filter({ hasText: "Sample project proposal" })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Your session has expired",
  );
  await expect(
    page.getByRole("region", { name: "Document viewer" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /Try as Reviewer/ }).click();
  await expect(
    page.getByRole("heading", { name: "Review queue" }),
  ).toBeVisible();
});

for (const failure of ["server", "network"] as const) {
  test(`${failure} upload failure keeps the selected file and title for retry`, async ({
    page,
  }) => {
    if (failure === "network")
      await page.setViewportSize({ width: 390, height: 844 });
    await demo(page);
    const title = `Recovery upload ${failure}`;
    await page
      .getByRole("button", { name: "Submit document", exact: true })
      .click();
    await page.getByRole("button", { name: "Use sample PDF" }).click();
    await page.getByLabel("Document title").fill(title);
    await page.route(
      "**/api/submissions/",
      (route) =>
        failure === "network"
          ? route.abort("failed")
          : route.fulfill({
              status: 503,
              contentType: "application/json",
              body: JSON.stringify({
                message:
                  "Document storage is temporarily unavailable. Please try again.",
              }),
            }),
      { times: 1 },
    );
    await page.getByRole("button", { name: "Submit for review" }).click();
    await expect(page.getByRole("alert")).toContainText(
      failure === "server"
        ? "storage is temporarily unavailable"
        : "Could not connect",
    );
    await expect(page.getByLabel("Document title")).toHaveValue(title);
    await expect(page.locator(".dropzone strong")).toHaveText(
      "project-proposal.pdf",
    );
    await expect(
      page.getByRole("button", { name: "Submit for review" }),
    ).toBeEnabled();
    expect(await savedRows(page, title)).toHaveLength(0);
    await page.screenshot({
      path: path.join(evidence, `upload-recovery-${failure}.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Submit for review" }).click();
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    expect(await savedRows(page, title)).toHaveLength(1);
  });
}

test("failed role switch preserves the session and document, then allows retry", async ({
  page,
}) => {
  await demo(page);
  await page
    .locator(".document-link")
    .filter({ hasText: "Sample project proposal" })
    .click();
  await expect(page.locator(".react-pdf__Page canvas")).toHaveCount(3);
  const previousUrl = page.url();
  const previousUser = (await (await page.request.get("/api/session/")).json())
    .user;
  await page.route(
    "**/api/demo/login/",
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          message: "The demo is temporarily unavailable. Please try again.",
        }),
      }),
    { times: 1 },
  );
  await page.getByRole("button", { name: "Switch to Reviewer" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "temporarily unavailable",
  );
  await expect(
    page.getByRole("button", { name: "Switch to Reviewer" }),
  ).toBeEnabled();
  expect(page.url()).toBe(previousUrl);
  expect((await (await page.request.get("/api/session/")).json()).user.id).toBe(
    previousUser.id,
  );
  await expect(
    page.getByRole("button", { name: "Approve document", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Switch to Reviewer" }).click();
  await expect(
    page.getByRole("heading", { name: "Review queue" }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("a stale decision shows the saved result and cannot overwrite it", async ({
  page,
}) => {
  const item = await prepareReview(page, "Recovery decision conflict");
  // Simulate another reviewer tab saving first, without refreshing this tab.
  const saved = await page.request.post(
    `/api/submissions/${item.id}/decision/`,
    {
      headers: { "X-CSRFToken": await token(page) },
      data: { status: "approved" },
    },
  );
  expect(saved.status()).toBe(200);
  await page
    .getByRole("button", { name: "Reject document", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm rejection" }).click();
  await expect(page.getByRole("alert")).toContainText("already been reviewed");
  await expect(
    page.getByRole("region", { name: "Review complete" }),
  ).toBeVisible();
  await expect(page.locator(".review-topbar .status")).toHaveText("Approved");
  await expect(
    page.getByRole("button", { name: "Confirm rejection" }),
  ).toHaveCount(0);
  expect(
    (await (await page.request.get(`/api/submissions/${item.id}/`)).json())
      .status,
  ).toBe("approved");
  await page.screenshot({
    path: path.join(evidence, "decision-conflict-recovered.png"),
    fullPage: true,
  });
});

test("a failed decision save stays pending and can be retried", async ({
  page,
}) => {
  const item = await prepareReview(page, "Recovery decision retry");
  await page.route(
    `**/api/submissions/${item.id}/decision/`,
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Could not save the decision. Please try again.",
        }),
      }),
    { times: 1 },
  );
  await page
    .getByRole("button", { name: "Approve document", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm approval" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Could not save the decision",
  );
  await expect(
    page.getByRole("button", { name: "Confirm approval" }),
  ).toBeEnabled();
  expect(
    (await (await page.request.get(`/api/submissions/${item.id}/`)).json())
      .status,
  ).toBe("pending");
  await page.getByRole("button", { name: "Confirm approval" }).click();
  await expect(
    page.getByRole("region", { name: "Review complete" }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("a conflict with a failed refresh blocks decisions until the list is reopened", async ({
  page,
}) => {
  const title = "Recovery conflict refresh failure";
  const item = await prepareReview(page, title);
  const saved = await page.request.post(
    `/api/submissions/${item.id}/decision/`,
    {
      headers: { "X-CSRFToken": await token(page) },
      data: { status: "rejected" },
    },
  );
  expect(saved.status()).toBe(200);
  await page.route(
    `**/api/submissions/${item.id}/`,
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Service unavailable" }),
      }),
    { times: 1 },
  );
  await page
    .getByRole("button", { name: "Approve document", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm approval" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Return to the list to refresh its status",
  );
  await expect(
    page.getByRole("button", { name: "Approve document", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Reject document", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Back to submissions" }).click();
  await page.getByRole("button", { name: /^All documents/ }).click();
  await page.getByRole("searchbox", { name: "Search documents" }).fill(title);
  await page.locator(".document-link").filter({ hasText: title }).click();
  await expect(
    page.getByRole("region", { name: "Review complete" }),
  ).toBeVisible();
  await expect(page.locator(".review-topbar .status")).toHaveText("Rejected");
});
