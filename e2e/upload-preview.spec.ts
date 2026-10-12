import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
const evidence = path.join(tmpdir(), "papertrail-qa");
fs.mkdirSync(evidence, { recursive: true });
const fixture = (name: string) => path.resolve("workflow/samples", name);

async function submitter(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /Try as Submitter/ }).click();
  await expect(
    page.getByRole("heading", { name: "My submissions" }),
  ).toBeVisible();
}
async function choose(page: Page, title: string, filename: string) {
  await page
    .getByRole("button", { name: "Submit document", exact: true })
    .click();
  await page.getByLabel("Document title").fill(title);
  const outline = await page.getByLabel("Document title").evaluate((input) => {
    const field = input.getBoundingClientRect();
    const form = input.closest("form")!.getBoundingClientRect();
    const style = getComputedStyle(input);
    const extent =
      parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
    return {
      width: parseFloat(style.outlineWidth),
      left: field.left - extent - form.left,
      right: form.right - field.right - extent,
    };
  });
  expect(outline.width).toBe(3);
  expect(outline.left).toBeGreaterThanOrEqual(0);
  expect(outline.right).toBeGreaterThanOrEqual(0);
  await page.screenshot({
    path: path.join(evidence, `upload-title-${page.viewportSize()!.width}.png`),
  });
  await page
    .getByLabel("Document", { exact: true })
    .setInputFiles(fixture(filename));
  await page
    .getByRole("button", { name: "Preview document", exact: true })
    .click();
}
async function saved(page: Page, title: string) {
  return (
    await (
      await page.request.get(`/api/submissions/?q=${encodeURIComponent(title)}`)
    ).json()
  ).results;
}

test("preview stays local, cancellation creates nothing, and submission returns to an unfiltered newest-first list", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await submitter(page);
  await page.getByRole("button", { name: /^Rejected/ }).click();
  await page
    .getByRole("searchbox", { name: "Search documents" })
    .fill("not-the-new-document");
  await expect(
    page.getByRole("heading", { name: "No matching documents." }),
  ).toBeVisible();
  await page.getByLabel("Sort by").selectOption("oldest");
  let uploads = 0;
  let fileReads = 0;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/submissions/" && request.method() === "POST")
      uploads++;
    if (/\/api\/submissions\/[^/]+\/file\/$/.test(url.pathname)) fileReads++;
  });
  const title = "Preview then return to my list";
  await choose(page, title, "project-proposal.pdf");
  await expect(page.getByRole("heading", { name: "Preview" })).toBeFocused();
  await expect(page.locator(".react-pdf__Page canvas")).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "Submit for review" }),
  ).toBeEnabled();
  await expect(
    page.locator(".react-pdf__Page__textContent").first(),
  ).toContainText("Q4 project proposal");
  await expect(page.getByLabel("Document size")).toHaveValue("actual");
  await expect(page.getByText("100%", { exact: true })).toBeVisible();
  const readingArea = await page.locator(".document-canvas").boundingBox();
  expect(readingArea!.height / page.viewportSize()!.height).toBeGreaterThan(
    0.7,
  );
  await expect(
    page.getByRole("button", { name: "Submit for review" }),
  ).toBeInViewport();
  await page.screenshot({
    path: path.join(evidence, "upload-preview-desktop.png"),
  });
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  expect(uploads).toBe(0);
  expect(fileReads).toBe(0);
  expect(await saved(page, title)).toHaveLength(0);
  await page.getByRole("button", { name: "Back to details" }).click();
  await expect(page.getByLabel("Document title")).toHaveValue(title);
  await expect(page.locator(".dropzone strong")).toHaveText(
    "project-proposal.pdf",
  );
  await page
    .getByRole("button", { name: "Preview document", exact: true })
    .click();
  await page.getByRole("button", { name: "Close upload" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(uploads).toBe(0);
  expect(await saved(page, title)).toHaveLength(0);
  await choose(page, title, "project-proposal.pdf");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/submissions/", async (route) => {
    if (route.request().method() === "POST") await gate;
    await route.continue();
  });
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(
    page.getByRole("button", { name: "Uploading document…" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Back to details" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeVisible();
  release();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".queue-decision-notice")).toBeFocused();
  await expect(page.locator(".queue-decision-notice")).toContainText(
    "submitted successfully",
  );
  await expect(page.locator("tbody tr").first()).toContainText(title);
  await expect(page.locator("tbody tr").first()).toContainText(
    "Just submitted",
  );
  await expect(page.locator("tbody tr").first()).toContainText("Pending");
  await expect(
    page.getByRole("button", { name: /^All documents/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("searchbox", { name: "Search documents" }),
  ).toHaveValue("");
  await expect(page.getByLabel("Sort by")).toHaveValue("newest");
  expect(uploads).toBe(1);
  expect(fileReads).toBe(0);
  expect(await saved(page, title)).toHaveLength(1);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: path.join(evidence, "upload-success-list-desktop.png"),
  });
});

test("mobile Word preview renders before upload and remains on the list afterward", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await submitter(page);
  const title = "Mobile Word preview before submission";
  await choose(page, title, "project-brief.docx");
  const preview = page.frameLocator('iframe[title="Word document preview"]');
  await expect(preview.locator("section.docx")).toHaveCount(2);
  await expect(page.locator("iframe")).toHaveAttribute(
    "sandbox",
    "allow-same-origin",
  );
  await expect(
    page.getByRole("button", { name: "Submit for review" }),
  ).toBeInViewport();
  await expect(
    page.getByRole("button", { name: "Back to details" }),
  ).toBeInViewport();
  await expect(
    page.getByRole("button", { name: "Submit for review" }),
  ).toBeEnabled();
  await expect(page.getByLabel("Document size")).toHaveValue("actual");
  await expect(page.getByText("100%", { exact: true })).toBeVisible();
  const readingArea = await page.locator(".document-canvas").boundingBox();
  expect(readingArea!.height / page.viewportSize()!.height).toBeGreaterThan(
    0.55,
  );
  await page.screenshot({
    path: path.join(evidence, "upload-preview-word-mobile-actual.png"),
  });
  const before = (await page.locator("iframe").boundingBox())!.width;
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect
    .poll(async () => (await page.locator("iframe").boundingBox())!.width)
    .toBeGreaterThan(before);
  await page.getByLabel("Document size").selectOption("page");
  expect(await saved(page, title)).toHaveLength(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: path.join(evidence, "upload-preview-word-mobile.png"),
  });
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "My submissions" }),
  ).toBeVisible();
  await expect(page.locator("tbody tr").first()).toContainText(title);
  await expect(page.locator("tbody tr").first()).toContainText("Pending");
  expect(await saved(page, title)).toHaveLength(1);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: path.join(evidence, "upload-success-list-mobile.png"),
  });
});

for (const extension of ["pdf", "docx"]) {
  test(`unrenderable ${extension} stays unsubmitted and can be replaced`, async ({
    page,
  }) => {
    await submitter(page);
    const title = `Replace failed local ${extension} preview`;
    let uploads = 0;
    page.on("request", (request) => {
      if (
        new URL(request.url()).pathname === "/api/submissions/" &&
        request.method() === "POST"
      )
        uploads++;
    });
    await page
      .getByRole("button", { name: "Submit document", exact: true })
      .click();
    await page.getByLabel("Document title").fill(title);
    await page.getByLabel("Document", { exact: true }).setInputFiles({
      name: `broken.${extension}`,
      mimeType: "application/octet-stream",
      buffer: Buffer.from("intentionally invalid document"),
    });
    await page
      .getByRole("button", { name: "Preview document", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "could not be rendered",
    );
    await expect(
      page.getByRole("button", { name: "Submit for review" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Retry preview" }),
    ).toBeVisible();
    expect(uploads).toBe(0);
    expect(await saved(page, title)).toHaveLength(0);
    await page.getByRole("button", { name: "Back to details" }).click();
    await expect(page.getByLabel("Document title")).toHaveValue(title);
    await page
      .getByLabel("Document", { exact: true })
      .setInputFiles(fixture("project-proposal.pdf"));
    await page
      .getByRole("button", { name: "Preview document", exact: true })
      .click();
    await expect(page.locator(".react-pdf__Page canvas")).toHaveCount(3);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Submit for review" }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Close upload" }).click();
    expect(uploads).toBe(0);
  });
}
