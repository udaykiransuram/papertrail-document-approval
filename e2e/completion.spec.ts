import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

const evidence = path.join(tmpdir(), "papertrail-qa");
fs.mkdirSync(evidence, { recursive: true });
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const current: string[] = [];
  page.on("pageerror", (error) => current.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("503"))
      current.push(message.text());
  });
  errors.set(page, current);
});
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));

async function enterDemo(page: Page, role = "Reviewer") {
  await page.goto("/");
  await expect(page).toHaveTitle(/Papertrail/);
  await page
    .getByRole("button", { name: new RegExp(`Try as ${role}`) })
    .click();
  await expect(
    page.getByRole("heading", {
      name: role === "Reviewer" ? "Review queue" : "My submissions",
    }),
  ).toBeVisible();
}
async function csrf(page: Page) {
  return (await (await page.request.get("/api/session/")).json()).csrfToken;
}
async function openSampleFixture(page: Page) {
  const response = await page.request.post("/api/demo/sample/", {
    headers: { "X-CSRFToken": await csrf(page) },
  });
  expect(response.status()).toBe(201);
  await page.goto(`/submissions/${(await response.json()).id}`);
}
async function finishPendingFixtures(page: Page) {
  // Only the isolated test database's synthetic fixtures are changed.
  const token = await csrf(page);
  const pending = await (
    await page.request.get("/api/submissions/?status=pending")
  ).json();
  expect(pending.total_pages).toBeLessThanOrEqual(1);
  for (const item of pending.results) {
    const response = await page.request.post(
      `/api/submissions/${item.id}/decision/`,
      { headers: { "X-CSRFToken": token }, data: { status: "approved" } },
    );
    expect(response.status()).toBe(200);
  }
  await page.getByRole("button", { name: "Refresh submissions" }).click();
  await expect(
    page.getByRole("heading", { name: "You’re all caught up." }),
  ).toBeVisible();
}
async function decide(page: Page, status: "approved" | "rejected") {
  await page
    .getByRole("button", {
      name: status === "approved" ? "Approve document" : "Reject document",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", {
      name: status === "approved" ? "Confirm approval" : "Confirm rejection",
    })
    .click();
  const result = page.getByRole("region", { name: "Review complete" });
  const heading = result.getByRole("heading", {
    name: status === "approved" ? "Approved" : "Rejected",
    exact: true,
  });
  await expect(heading).toBeFocused();
  await expect(result).toContainText("Reviewed by Demo Reviewer");
  await expect(result.locator("time")).toHaveAttribute("datetime", /T/);
  await expect(
    result.getByRole("button", {
      name: /^(Start a sample review|Try a sample document)$/,
    }),
  ).toHaveCount(0);
  await expect(result).not.toContainText("Try a fresh sample");
  await expect(
    page.getByRole("status").filter({
      hasText: `Document ${status}. Your decision has been saved.`,
    }),
  ).toHaveCount(1);
  return result;
}

test("fresh samples keep saved decisions, with accessible desktop and mobile outcomes", async ({
  page,
}) => {
  await enterDemo(page);
  await expect(
    page.getByRole("region", { name: "Submissions", exact: true }),
  ).toHaveAttribute("aria-busy", "false");
  await expect(
    page.getByRole("button", {
      name: /^(Start a sample review|Try a sample document)$/,
    }),
  ).toHaveCount(0);
  await openSampleFixture(page);
  await expect(page.locator(".react-pdf__Page canvas")).toHaveCount(3);
  const firstUrl = page.url();
  const firstId = new URL(firstUrl).pathname.split("/").pop();
  const approved = await decide(page, "approved");
  await expect(
    approved.getByRole("button", { name: "Review next pending document" }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(evidence, "completion-approved-desktop.png"),
    fullPage: true,
  });
  await openSampleFixture(page);
  await expect(page).not.toHaveURL(firstUrl);
  await expect(page.locator(".react-pdf__Page canvas")).toHaveCount(3);
  expect(
    (await (await page.request.get(`/api/submissions/${firstId}/`)).json())
      .status,
  ).toBe("approved");
  await page.setViewportSize({ width: 390, height: 844 });
  const rejected = await decide(page, "rejected");
  await page.screenshot({
    path: path.join(evidence, "completion-rejected-mobile.png"),
    fullPage: false,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const rejectedUrl = page.url();
  await rejected.getByRole("button", { name: "Back to queue" }).click();
  await expect(page.getByRole("button", { name: /^Pending/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Switch to Submitter" }).click();
  await expect(
    page.getByRole("heading", { name: "My submissions" }),
  ).toBeVisible();
  await page.goto(rejectedUrl);
  const saved = page.getByRole("region", { name: "Review complete" });
  await expect(saved.getByRole("heading", { name: "Rejected" })).toBeVisible();
  await expect(
    saved.getByRole("button", {
      name: /^(Start a sample review|Try a sample document)$/,
    }),
  ).toHaveCount(0);
  await expect(
    saved.getByRole("button", { name: "Review next pending document" }),
  ).toHaveCount(0);
  await saved.getByRole("button", { name: "Back to submissions" }).click();
  await expect(
    page.getByRole("heading", { name: "My submissions" }),
  ).toBeVisible();
});

test("review next follows search, submitter and sort, then returns to the filtered queue", async ({
  page,
}) => {
  await enterDemo(page, "Submitter");
  const token = await csrf(page);
  const created = [];
  for (const title of [
    "Completion sequence first",
    "Completion sequence second",
  ]) {
    const response = await page.request.post("/api/submissions/", {
      headers: { "X-CSRFToken": token },
      multipart: {
        title,
        file: {
          name: "proposal.pdf",
          mimeType: "application/pdf",
          buffer: fs.readFileSync(
            "workflow/tests/fixtures/project-proposal.pdf",
          ),
        },
      },
    });
    expect(response.status()).toBe(201);
    created.push(await response.json());
  }
  await page.getByRole("button", { name: "Switch to Reviewer" }).click();
  await expect(
    page.getByRole("heading", { name: "Review queue" }),
  ).toBeVisible();
  await page
    .getByRole("searchbox", { name: "Search documents" })
    .fill("Completion sequence");
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await page.getByRole("button", { name: /^Submitted by:/ }).click();
  await page.getByRole("option", { name: /Demo Submitter/ }).click();
  await page.getByLabel("Sort by").selectOption("oldest");
  await expect(page.locator(".document-link").first()).toContainText(
    "Completion sequence first",
  );
  await page.locator(".document-link").first().click();
  const result = await decide(page, "approved");
  await expect(result).toContainText(
    "1 pending document matching your filters",
  );
  await expect(result).toContainText("Next: Completion sequence second");
  const nextQuery = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/submissions/" &&
      url.searchParams.get("status") === "pending"
    );
  });
  await result
    .getByRole("button", { name: "Review next pending document" })
    .click();
  const query = new URL((await nextQuery).url()).searchParams;
  expect(query.get("q")).toBe("Completion sequence");
  expect(query.get("owner")).toBe(String(created[0].owner.id));
  expect(query.get("sort")).toBe("oldest");
  await expect(page).toHaveURL(new RegExp(created[1].id));
  const final = await decide(page, "rejected");
  await expect(final).toContainText("No pending documents match your filters.");
  await final.getByRole("button", { name: "Back to queue" }).click();
  await expect(
    page.getByRole("searchbox", { name: "Search documents" }),
  ).toHaveValue("Completion sequence");
  await expect(page.getByLabel("Sort by")).toHaveValue("oldest");
  await expect(
    page.getByRole("button", { name: "Submitted by: Demo Submitter" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "No matching documents." }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: /Submission pages/ }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /^All documents/ }).click();
  await expect(page.locator("tbody tr")).toHaveCount(2);
});

test("sample creation retries failures and disables duplicate submission", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enterDemo(page);
  await finishPendingFixtures(page);
  await page.route(
    "**/api/demo/sample/",
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          message: "The sample review could not be created. Please try again.",
        }),
      }),
    { times: 1 },
  );
  await page.getByRole("button", { name: "Try a sample document" }).click();
  await expect(page.getByRole("alert")).toContainText("could not be created");
  await page.screenshot({
    path: path.join(evidence, "completion-sample-retry-mobile.png"),
    fullPage: true,
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route("**/api/demo/sample/", async (route) => {
    requests += 1;
    await gate;
    await route.continue();
  });
  await page.getByRole("button", { name: "Try a sample document" }).click();
  await expect(
    page.getByRole("button", { name: "Preparing sample…" }),
  ).toBeDisabled();
  release();
  await expect(
    page.getByRole("heading", { name: "Practice review — project proposal" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your decision" }),
  ).toBeVisible();
  expect(requests).toBe(1);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("empty pending queue offers reviewed documents and fresh samples, but ordinary accounts have no demo action", async ({
  page,
}) => {
  await enterDemo(page);
  await finishPendingFixtures(page);
  await page.getByRole("button", { name: "Switch to Submitter" }).click();
  await expect(
    page.getByRole("heading", { name: "My submissions" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Pending/ }).click();
  await expect(
    page.getByRole("heading", { name: "No documents awaiting review." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Try a sample document" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Submit a document", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Submit a document" }),
  ).toContainText("Step 1 of 2");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Switch to Reviewer" }).click();
  await expect(
    page.getByRole("heading", { name: "Review queue" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "You’re all caught up." }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: /Submission pages/ }),
  ).toHaveCount(0);
  await expect(
    page
      .locator(".empty-state")
      .getByRole("button", { name: "Try a sample document" }),
  ).toBeVisible();
  await expect(
    page.locator(".queue-heading").getByRole("button", {
      name: /^(Start a sample review|Try a sample document)$/,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("searchbox", { name: "Search documents" })
    .fill("no-such-document");
  await expect(
    page.getByRole("heading", { name: "No matching documents." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /^(Start a sample review|Try a sample document)$/,
    }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Clear document search" }).click();
  await expect(
    page.getByRole("heading", { name: "You’re all caught up." }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(evidence, "completion-caught-up-desktop.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "View reviewed documents" }).click();
  await expect(page.locator("tbody tr").first()).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /^(Start a sample review|Try a sample document)$/,
    }),
  ).toHaveCount(0);
  await page.locator(".document-link").first().click();
  await expect(
    page.getByRole("region", { name: "Review complete" }),
  ).toContainText("You’re all caught up.");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByLabel("Username").fill("reviewer");
  await page
    .getByLabel("Password", { exact: true })
    .fill("E2e-only-password-924!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Review queue" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /^(Start a sample review|Try a sample document)$/,
    }),
  ).toHaveCount(0);
});
