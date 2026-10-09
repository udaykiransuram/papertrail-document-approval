import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { tmpdir } from "node:os";
const evidenceDirectory = path.join(tmpdir(), "papertrail-qa");
fs.mkdirSync(evidenceDirectory, { recursive: true });
const password = "E2e-only-password-924!";
const fixture = (name: string) => path.resolve("workflow/tests/fixtures", name);
async function login(page: Page, username: string) {
  await page.goto("/");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}
async function upload(page: Page, title: string, name: string) {
  await page
    .getByRole("button", { name: "Submit document", exact: true })
    .click();
  await page.getByLabel("Document title").fill(title);
  await page.locator("input[type=file]").setInputFiles(fixture(name));
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
}
async function chooseSubmitter(page: Page, name: string, search = name) {
  await page.getByRole("button", { name: /^Submitted by:/ }).click();
  await page.getByRole("combobox", { name: "Search submitters" }).fill(search);
  await page.getByRole("option", { name: new RegExp(name) }).click();
}
test("PDF: submit, inspect three pages, approve, and track status", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type()))
      errors.push(message.text());
  });
  await login(page, "alex");
  await upload(page, "Q4 project proposal", "project-proposal.pdf");
  await expect(page.locator(".react-pdf__Page canvas")).toHaveCount(3);
  await expect(page.getByText("Page 3 of 3", { exact: true })).toBeVisible();
  const detailUrl = page.url();
  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, "jamie");
  await expect(
    page.getByRole("button", {
      name: "Q4 project proposal project-proposal.pdf",
    }),
  ).toHaveCount(0);
  const filePath =
    new URL(detailUrl).pathname.replace("/submissions/", "/api/submissions/") +
    "/file/";
  expect((await page.request.get(filePath)).status()).toBe(404);
  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, "reviewer");
  await page
    .getByRole("button", { name: "Open Q4 project proposal", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Approve document", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(page.getByText("110%", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  const viewer = page.getByRole("region", { name: "Document viewer" });
  expect(
    await page
      .locator(".document-canvas")
      .evaluate((el) => el.scrollWidth <= el.clientWidth + 2),
  ).toBe(true);
  expect((await viewer.boundingBox())!.y).toBeLessThan(165);
  expect((await viewer.boundingBox())!.height).toBeGreaterThan(760);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= window.innerHeight + 1,
    ),
  ).toBe(true);
  await page.getByLabel("Document size").selectOption("auto");
  await expect
    .poll(
      async () =>
        (await page.locator(".react-pdf__Page canvas").first().boundingBox())!
          .width,
    )
    .toBeLessThanOrEqual(816);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect
    .poll(
      async () =>
        (await page.locator(".react-pdf__Page canvas").first().boundingBox())!
          .width,
    )
    .toBeLessThanOrEqual(816);
  await page.getByLabel("Document size").selectOption("page");
  await expect
    .poll(async () => {
      const paper = (await page
        .locator(".react-pdf__Page canvas")
        .first()
        .boundingBox())!;
      const viewport = (await page.locator(".document-canvas").boundingBox())!;
      return (
        paper.height <= viewport.height - 40 &&
        paper.width <= viewport.width - 40
      );
    })
    .toBe(true);
  await page.getByLabel("Document size").selectOption("width");
  await expect
    .poll(
      async () =>
        (await page.locator(".react-pdf__Page canvas").first().boundingBox())!
          .width,
    )
    .toBeGreaterThan(1000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel("Document size").selectOption("auto");
  await page.screenshot({
    path: path.join(evidenceDirectory, "review-desktop.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Approve document", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm approval" }).click();
  await expect(
    page.getByRole("heading", { name: "Review complete" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, "alex");
  await expect(
    page.locator("tbody").getByText("Approved", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(evidenceDirectory, "dashboard-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: path.join(evidenceDirectory, "dashboard-mobile.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("DOCX: preview inside the app, zoom, reject, and track status", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type()))
      errors.push(message.text());
  });
  await login(page, "jamie");
  await upload(page, "Quarterly project brief", "project-brief.docx");
  await expect(
    page
      .frameLocator('iframe[title="Word document preview"]')
      .getByText("Supporting details", { exact: true }),
  ).toBeVisible();
  const wordFrame = page.frameLocator('iframe[title="Word document preview"]');
  await expect(wordFrame.locator("section.docx").first()).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  expect(
    await wordFrame
      .getByText("A clear submission process", { exact: true })
      .evaluate(
        (element) =>
          getComputedStyle(element.closest("p")!, "::before").content,
      ),
  ).toContain("•");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(page.getByText("110%", { exact: true })).toBeVisible();
  const enlargedWidth = (await page
    .locator('iframe[title="Word document preview"]')
    .boundingBox())!.width;
  await page.getByLabel("Document size").selectOption("actual");
  await expect(page.getByText("100%", { exact: true })).toBeVisible();
  const fittedWidth = (await page
    .locator('iframe[title="Word document preview"]')
    .boundingBox())!.width;
  expect(enlargedWidth / fittedWidth).toBeCloseTo(1.1, 1);
  await expect(
    page
      .frameLocator('iframe[title="Word document preview"]')
      .locator("section.docx"),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, "reviewer");
  await page
    .getByRole("button", { name: "Open Quarterly project brief", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Reject document", exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: path.join(evidenceDirectory, "word-review.png"),
    fullPage: true,
  });
  await page.getByLabel("Document size").selectOption("page");
  await expect
    .poll(async () => {
      const paper = await page
        .frameLocator('iframe[title="Word document preview"]')
        .locator("section.docx")
        .first()
        .boundingBox();
      const viewport = await page.locator(".document-canvas").boundingBox();
      return Boolean(paper && viewport && paper.height <= viewport.height - 40);
    })
    .toBe(true);
  await page.getByLabel("Document size").selectOption("auto");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page
        .locator(".document-canvas")
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 2),
    )
    .toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: path.join(evidenceDirectory, "review-mobile.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Reject document", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm rejection" }).click();
  await expect(
    page.getByRole("heading", { name: "Review complete" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, "jamie");
  await expect(
    page.locator("tbody").getByText("Rejected", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("preview failure can be retried", async ({ page }) => {
  await login(page, "alex");
  await page.route("**/api/submissions/*/file/", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: '{"message":"Storage unavailable"}',
    }),
  );
  await upload(page, "Preview recovery", "project-proposal.pdf");
  await expect(page.getByRole("alert")).toContainText("could not be loaded");
  await expect(
    page.getByRole("button", { name: "Retry preview" }),
  ).toBeVisible();
  await page.unroute("**/api/submissions/*/file/");
  await page.getByRole("button", { name: "Retry preview" }).click();
  await expect(page.locator(".react-pdf__Page canvas")).toHaveCount(3);
});
for (const [name, filename] of [
  ["PDF", "project-proposal.pdf"],
  ["DOCX", "project-brief.docx"],
]) {
  test(`${name} render errors show a recovery action`, async ({ page }) => {
    await login(page, "alex");
    await page.route("**/api/submissions/*/file/", (route) =>
      route.fulfill({ status: 200, body: "intentionally invalid document" }),
    );
    await upload(page, `${name} preview error`, filename);
    await expect(page.getByRole("alert")).toContainText(
      "could not be rendered",
    );
    await expect(
      page.getByRole("button", { name: "Retry preview" }),
    ).toBeVisible();
  });
}
test("login errors and mobile layout", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("Username").fill("alex");
  await page.getByLabel("Password", { exact: true }).fill("incorrect");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "username or password is incorrect",
  );
  await page.screenshot({
    path: path.join(evidenceDirectory, "login-mobile.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("paginated tabs, sorting, submitter filtering, and return-to-list state", async ({
  page,
}) => {
  test.setTimeout(90000);
  const failures: string[] = [];
  page.on("pageerror", (e) => failures.push(e.message));
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type()))
      failures.push(message.text());
  });
  await login(page, "alex");
  let session = await (await page.request.get("/api/session/")).json();
  const alexId = session.user.id;
  const records: { id: string; status: string }[] = [];
  for (const status of ["pending", "approved", "rejected"]) {
    for (let index = 1; index <= 21; index++) {
      const response = await page.request.post("/api/submissions/", {
        headers: { "X-CSRFToken": session.csrfToken },
        multipart: {
          title: `Queue ${status} ${String(index).padStart(2, "0")}`,
          file: {
            name: "proposal.pdf",
            mimeType: "application/pdf",
            buffer: fs.readFileSync(fixture("project-proposal.pdf")),
          },
        },
      });
      expect(response.status()).toBe(201);
      records.push({ id: (await response.json()).id, status });
    }
  }
  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, "jamie");
  session = await (await page.request.get("/api/session/")).json();
  const jamieId = session.user.id;
  const another = await page.request.post("/api/submissions/", {
    headers: { "X-CSRFToken": session.csrfToken },
    multipart: {
      title: "Jamie review queue sample",
      file: {
        name: "proposal.pdf",
        mimeType: "application/pdf",
        buffer: fs.readFileSync(fixture("project-proposal.pdf")),
      },
    },
  });
  expect(another.status()).toBe(201);
  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, "reviewer");
  session = await (await page.request.get("/api/session/")).json();
  for (const record of records.filter((row) => row.status !== "pending")) {
    const decision = await page.request.post(
      `/api/submissions/${record.id}/decision/`,
      {
        headers: { "X-CSRFToken": session.csrfToken },
        data: { status: record.status },
      },
    );
    expect(decision.status()).toBe(200);
  }
  await page.getByRole("button", { name: "Refresh submissions" }).click();
  await chooseSubmitter(page, "Alex Morgan", "alex");
  for (const status of ["All documents", "Pending", "Approved", "Rejected"]) {
    await page.getByRole("button", { name: new RegExp(`^${status}`) }).click();
    await expect(page.locator("tbody tr")).toHaveCount(20);
    await expect(
      page
        .getByRole("navigation", { name: "Submission pages top" })
        .getByRole("button", { name: "Next page" }),
    ).toBeEnabled();
    await page
      .getByRole("navigation", { name: "Submission pages top" })
      .getByRole("button", { name: "Next page" })
      .click();
    await expect(page.locator(".pagination-top")).toContainText("Page 2 of");
    await expect(page.locator("tbody .owner-cell").first()).toHaveText(
      "Alex Morgan",
    );
    await page
      .getByRole("navigation", { name: "Submission pages top" })
      .getByRole("button", { name: "Previous page" })
      .click();
    await expect(page.locator(".pagination-top")).toContainText("Page 1 of");
    await expect(page.locator("tbody tr")).toHaveCount(20);
    await expect(
      page
        .getByRole("navigation", { name: "Submission pages top" })
        .getByRole("button", { name: "Previous page" }),
    ).toBeDisabled();
  }
  await page.getByRole("button", { name: /^All documents/ }).click();
  for (const sort of [
    "oldest",
    "newest",
    "status_asc",
    "status_desc",
    "submitter_asc",
    "submitter_desc",
  ]) {
    await page.getByLabel("Sort by", { exact: true }).selectOption(sort);
    const expected = await (
      await page.request.get(`/api/submissions/?owner=${alexId}&sort=${sort}`)
    ).json();
    await expect(
      page.locator("tbody .document-link strong").first(),
    ).toHaveText(expected.results[0].title);
    await expect(page.locator(".pagination-top")).toContainText("Page 1 of");
  }
  await chooseSubmitter(page, "Jamie Chen", "jamie");
  await expect(page.locator("tbody .owner-cell").first()).toHaveText(
    "Jamie Chen",
  );
  expect(
    await page.locator("tbody .owner-cell").allTextContents(),
  ).not.toContain("Alex Morgan");
  await chooseSubmitter(page, "Alex Morgan", "alex");
  await page
    .getByLabel("Search documents", { exact: true })
    .fill("Queue pending");
  await expect(page.locator(".active-filters")).toContainText("Queue pending");
  await expect(
    page.getByRole("button", { name: /^All documents/ }),
  ).toContainText("21");
  await expect(
    page.getByRole("region", { name: "Submissions", exact: true }),
  ).toHaveAttribute("aria-busy", "false");
  await expect(page.locator(".pagination-bottom")).toContainText(
    "of 21 documents",
  );
  await page.getByRole("button", { name: /^Pending/ }).click();
  await page
    .getByRole("navigation", { name: "Submission pages top" })
    .getByRole("button", { name: "Next page" })
    .click();
  await expect(page.locator(".pagination-top")).toContainText("Page 2 of");
  const selectedTitle = await page
    .locator("tbody .document-link strong")
    .first()
    .innerText();
  await page.locator("tbody .document-link").first().click();
  await expect(
    page.getByRole("heading", { name: selectedTitle, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to submissions" }).click();
  await expect(page.locator(".pagination-top")).toContainText("Page 2 of");
  await expect(
    page.getByRole("button", { name: "Submitted by: Alex Morgan" }),
  ).toBeVisible();
  await expect(page.getByLabel("Sort by", { exact: true })).toHaveValue(
    "submitter_desc",
  );
  await expect(
    page.getByLabel("Search documents", { exact: true }),
  ).toHaveValue("Queue pending");
  await expect(page.locator(".pagination-bottom")).toContainText("Page 2 of");
  await page
    .getByRole("navigation", { name: "Submission pages bottom" })
    .getByRole("button", { name: "Previous page" })
    .click();
  await expect(page.locator(".pagination-top")).toContainText("Page 1 of");
  await page
    .getByRole("navigation", { name: "Submission pages bottom" })
    .getByRole("button", { name: "Next page" })
    .click();
  await expect(page.locator(".pagination-top")).toContainText("Page 2 of");
  await page
    .getByLabel("Search documents", { exact: true })
    .fill("never-matches-any-document");
  await expect(
    page.getByRole("heading", { name: "No matching documents." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear document search" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(20);
  await expect(page.locator(".pagination-top")).toContainText("Page 1 of");
  await page
    .getByLabel("Search documents", { exact: true })
    .fill("PROPOSAL.PDF");
  await expect(page.locator(".active-filters")).toContainText("PROPOSAL.PDF");
  await expect(
    page.getByRole("region", { name: "Submissions", exact: true }),
  ).toHaveAttribute("aria-busy", "false");
  for (const name of await page
    .locator("tbody .document-link small")
    .allTextContents())
    expect(name.toLowerCase()).toContain("proposal.pdf");
  await page
    .getByLabel("Search documents", { exact: true })
    .fill("Queue pending");
  await expect(page.locator(".active-filters")).toContainText("Queue pending");
  await expect(
    page.getByRole("button", { name: /^All documents/ }),
  ).toContainText("21");
  await expect(
    page.getByRole("region", { name: "Submissions", exact: true }),
  ).toHaveAttribute("aria-busy", "false");
  await expect(page.locator(".pagination-bottom")).toContainText(
    "of 21 documents",
  );
  await page.screenshot({
    path: path.join(evidenceDirectory, "queue-filters-desktop.png"),
    fullPage: false,
  });
  await page.getByRole("button", { name: /^Submitted by:/ }).click();
  await page.getByRole("combobox", { name: "Search submitters" }).fill("alex");
  await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(1);
  await page.screenshot({
    path: path.join(evidenceDirectory, "searchable-submitters.png"),
    fullPage: false,
  });
  await page
    .getByRole("combobox", { name: "Search submitters" })
    .fill("unknown submitter");
  await expect(page.getByText("No submitters found.")).toBeVisible();
  await page
    .getByRole("combobox", { name: "Search submitters" })
    .press("Escape");
  await expect(
    page.getByRole("button", { name: "Submitted by: Alex Morgan" }),
  ).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: path.join(evidenceDirectory, "queue-filters-mobile.png"),
    fullPage: false,
  });
  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, "alex");
  await expect(
    page.getByRole("button", { name: /^Submitted by:/ }),
  ).toHaveCount(0);
  for (const status of ["All documents", "Pending", "Approved", "Rejected"]) {
    await page.getByRole("button", { name: new RegExp(`^${status}`) }).click();
    await expect(page.locator("tbody tr")).toHaveCount(20);
    await expect(
      page
        .getByRole("navigation", { name: "Submission pages top" })
        .getByRole("button", { name: "Next page" }),
    ).toBeEnabled();
    await page
      .getByRole("navigation", { name: "Submission pages top" })
      .getByRole("button", { name: "Next page" })
      .click();
    await expect(page.locator(".pagination-top")).toContainText("Page 2 of");
    await page
      .getByRole("navigation", { name: "Submission pages top" })
      .getByRole("button", { name: "Previous page" })
      .click();
    await expect(page.locator(".pagination-top")).toContainText("Page 1 of");
    await expect(page.locator("tbody tr")).toHaveCount(20);
  }
  await page.getByRole("button", { name: /^All documents/ }).click();
  await page
    .getByLabel("Search documents", { exact: true })
    .fill("Jamie review queue sample");
  await expect(
    page.getByRole("heading", { name: "No matching documents." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .last()
    .click();
  await page
    .getByLabel("Search documents", { exact: true })
    .fill("Queue approved");
  await expect(page.locator(".pagination-bottom")).toContainText(
    "of 21 documents",
  );
  await expect(
    page.locator("tbody .document-link strong").first(),
  ).toContainText("Queue approved");
  expect(failures).toEqual([]);
});
