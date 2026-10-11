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
  errors.set(page, current);
});
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));

async function fixtures(page: Page, prefix: string, count = 1) {
  await page.goto("/");
  await page.getByRole("button", { name: /Try as Submitter/ }).click();
  await expect(
    page.getByRole("heading", { name: "My submissions" }),
  ).toBeVisible();
  const token = (await (await page.request.get("/api/session/")).json())
    .csrfToken;
  const items = [];
  for (let index = 1; index <= count; index++) {
    const response = await page.request.post("/api/submissions/", {
      headers: { "X-CSRFToken": token },
      multipart: {
        title: `${prefix} ${index}`,
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
    items.push(await response.json());
  }
  await page.getByRole("button", { name: "Switch to Reviewer" }).click();
  await expect(
    page.getByRole("heading", { name: "Review queue" }),
  ).toBeVisible();
  const filtered = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/submissions/" &&
      url.searchParams.get("q") === prefix
    );
  });
  await page.getByRole("searchbox", { name: "Search documents" }).fill(prefix);
  await filtered;
  await expect(
    page.getByRole("region", { name: "Submissions", exact: true }),
  ).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("tbody tr")).toHaveCount(Math.min(20, count));
  return items;
}
async function centered(page: Page) {
  const box = await page.getByRole("dialog").boundingBox();
  const viewport = page.viewportSize()!;
  expect(box).not.toBeNull();
  expect(Math.abs(box!.x + box!.width / 2 - viewport.width / 2)).toBeLessThan(
    2,
  );
  expect(Math.abs(box!.y + box!.height / 2 - viewport.height / 2)).toBeLessThan(
    2,
  );
  expect(box!.width).toBeLessThan(viewport.width);
}

test("review confirmations are centered, trap focus, cancel safely and prevent duplicate saves", async ({
  page,
}) => {
  const [item] = await fixtures(page, "Modal review");
  await page.getByRole("button", { name: `Open ${item.title}` }).click();
  await expect(page.locator(".react-pdf__Page canvas")).toHaveCount(3);
  const trigger = page.getByRole("button", {
    name: "Approve document",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Approve this document?" });
  await expect(dialog).toContainText(item.title);
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await centered(page);
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "Confirm approval" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.screenshot({
    path: path.join(evidence, "confirmation-desktop.png"),
  });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(
    (await (await page.request.get(`/api/submissions/${item.id}/`)).json())
      .status,
  ).toBe("pending");

  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Reject document", exact: true })
    .click();
  await centered(page);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel" })
    .click();
  await expect(
    page.getByRole("button", { name: "Reject document", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Reject document", exact: true })
    .click();
  await page.screenshot({
    path: path.join(evidence, "confirmation-mobile.png"),
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route(`**/api/submissions/${item.id}/decision/`, async (route) => {
    requests++;
    await gate;
    await route.continue();
  });
  await page.getByRole("button", { name: "Confirm rejection" }).click();
  await expect(
    page.getByRole("button", { name: "Saving decision…" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "Cancel" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeVisible();
  release();
  await expect(
    page
      .getByRole("region", { name: "Review complete" })
      .getByRole("heading", { name: "Rejected", exact: true }),
  ).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(requests).toBe(1);
});

test("list approval skips file loading, preserves filters and clamps the emptied last page", async ({
  page,
}) => {
  const items = await fixtures(page, "Quick queue", 21);
  await page.getByLabel("Sort by").selectOption("oldest");
  await page.getByRole("button", { name: /^Submitted by:/ }).click();
  await page.getByRole("option", { name: /Demo Submitter/ }).click();
  await page
    .getByRole("navigation", { name: "Submission pages top" })
    .getByRole("button", { name: "Next page" })
    .click();
  const item = items[20];
  await expect(page.locator("tbody tr")).toHaveCount(1);
  let fileReads = 0;
  page.on("request", (request) => {
    if (/\/file\/$/.test(request.url())) fileReads++;
  });
  await page
    .getByRole("button", { name: `Approve ${item.title}`, exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(item.title);
  await expect(
    page.getByRole("button", { name: "View document before deciding" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm approval" }).click();
  await expect(page.locator(".queue-decision-notice")).toBeFocused();
  await expect(page.locator(".queue-decision-notice")).toContainText(
    `${item.title}” approved`,
  );
  await expect(
    page.getByRole("navigation", { name: "Submission pages top" }),
  ).toContainText("Page 1 of 1");
  await expect(page.locator("tbody tr")).toHaveCount(20);
  await expect(page.getByRole("button", { name: /^Pending/ })).toHaveText(
    "Pending20",
  );
  await expect(page.getByRole("button", { name: /^Approved/ })).toHaveText(
    "Approved1",
  );
  await expect(
    page.getByRole("searchbox", { name: "Search documents" }),
  ).toHaveValue("Quick queue");
  await expect(page.getByLabel("Sort by")).toHaveValue("oldest");
  await expect(
    page.getByRole("button", { name: "Submitted by: Demo Submitter" }),
  ).toBeVisible();
  expect(fileReads).toBe(0);
  await page.screenshot({
    path: path.join(evidence, "list-decision-desktop.png"),
    fullPage: true,
  });
  // The same dialog also offers the full review path without recording a decision.
  await page
    .getByRole("button", { name: `Reject ${items[0].title}`, exact: true })
    .click();
  await page
    .getByRole("button", { name: "View document before deciding" })
    .click();
  await expect(
    page.getByRole("heading", { name: items[0].title, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to submissions" }).click();
  await expect(
    page.getByRole("searchbox", { name: "Search documents" }),
  ).toHaveValue("Quick queue");
});

test("mobile list decisions retry failures, recover conflicts and stay reviewer-only", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const [first, second] = await fixtures(page, "Quick recovery", 2);
  await page.screenshot({
    path: path.join(evidence, "list-actions-mobile.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: `Reject ${first.title}`, exact: true })
    .click();
  await page.route(
    `**/api/submissions/${first.id}/decision/`,
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
  await page.getByRole("button", { name: "Confirm rejection" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Could not save the decision",
  );
  await centered(page);
  await page.screenshot({
    path: path.join(evidence, "list-confirmation-error-mobile.png"),
  });
  await expect(
    page.getByRole("button", { name: "Confirm rejection" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Confirm rejection" }).click();
  await expect(page.locator(".queue-decision-notice")).toContainText(
    "rejected",
  );
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page
    .getByRole("button", { name: `Reject ${second.title}`, exact: true })
    .click();
  const token = (await (await page.request.get("/api/session/")).json())
    .csrfToken;
  expect(
    (
      await page.request.post(`/api/submissions/${second.id}/decision/`, {
        headers: { "X-CSRFToken": token },
        data: { status: "approved" },
      })
    ).status(),
  ).toBe(200);
  await page.getByRole("button", { name: "Confirm rejection" }).click();
  await expect(page.locator(".queue-decision-notice")).toContainText(
    "already reviewed",
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "No matching documents." }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^All documents/ }).click();
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: /^(Approve|Reject) Quick recovery/ }),
  ).toHaveCount(0);
  await expect(page.locator("tbody")).toContainText("Approved");
  await expect(page.locator("tbody")).toContainText("Rejected");
  await page.getByRole("button", { name: "Switch to Submitter" }).click();
  await expect(
    page.getByRole("heading", { name: "My submissions" }),
  ).toBeVisible();
  await page
    .getByRole("searchbox", { name: "Search documents" })
    .fill("Quick recovery");
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: /^(Approve|Reject) / }),
  ).toHaveCount(0);
  await expect(page.locator("tbody")).toContainText("Approved");
  await expect(page.locator("tbody")).toContainText("Rejected");
});
