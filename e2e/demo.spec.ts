import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { tmpdir } from "node:os";
const evidence = path.join(tmpdir(), "papertrail-qa");
fs.mkdirSync(evidence, { recursive: true });

for (const kind of ["PDF", "Word"] as const) {
  test(`one-click ${kind} demo: sample, review, switch back and see decision`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Take a look around." }),
    ).toBeVisible();
    if (kind === "PDF")
      await page.screenshot({
        path: path.join(evidence, "demo-login-desktop.png"),
        fullPage: true,
      });
    else {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({
        path: path.join(evidence, "demo-login-mobile.png"),
        fullPage: true,
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.getByRole("button", { name: /Try as Submitter/ }).click();
    await expect(
      page.getByRole("heading", { name: "My submissions" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Submit document", exact: true })
      .click();
    await page.getByRole("button", { name: `Use sample ${kind}` }).click();
    const title = `One-click ${kind} demo journey`;
    await expect(page.getByLabel("Document title")).not.toBeEmpty();
    await page.getByLabel("Document title").fill(title);
    await page.screenshot({
      path: path.join(evidence, `demo-sample-${kind}.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Submit for review" }).click();
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await expect(
      kind === "PDF"
        ? page.locator(".react-pdf__Page canvas")
        : page
            .frameLocator('iframe[title="Word document preview"]')
            .locator("section.docx"),
    ).toHaveCount(kind === "PDF" ? 3 : 2);
    const detailUrl = page.url();
    await page.getByRole("button", { name: "Switch to Reviewer" }).click();
    await expect(
      page.getByRole("heading", { name: "Review queue" }),
    ).toBeVisible();
    await page.locator(".document-link").filter({ hasText: title }).click();
    await expect(
      kind === "PDF"
        ? page.locator(".react-pdf__Page canvas")
        : page
            .frameLocator('iframe[title="Word document preview"]')
            .locator("section.docx"),
    ).toHaveCount(kind === "PDF" ? 3 : 2);
    await page.screenshot({
      path: path.join(evidence, `demo-review-${kind}.png`),
      fullPage: true,
    });
    if (kind === "PDF")
      expect(
        await page.evaluate(
          () => document.documentElement.scrollHeight <= innerHeight + 1,
        ),
      ).toBe(true);
    const decision = kind === "PDF" ? "Approve" : "Reject";
    await page
      .getByRole("button", { name: `${decision} document`, exact: true })
      .click();
    await page
      .getByRole("button", {
        name: kind === "PDF" ? "Confirm approval" : "Confirm rejection",
        exact: true,
      })
      .click();
    await expect(
      page
        .getByText(kind === "PDF" ? "Approved" : "Rejected", { exact: true })
        .first(),
    ).toBeVisible();
    await page.getByRole("button", { name: "Switch to Submitter" }).click();
    await expect(
      page.getByRole("heading", { name: "My submissions" }),
    ).toBeVisible();
    await page.locator(".document-link").filter({ hasText: title }).click();
    await expect(
      page
        .getByText(kind === "PDF" ? "Approved" : "Rejected", { exact: true })
        .first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Approve document", exact: true }),
    ).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    expect(page.url()).toBe(detailUrl);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(
      page.getByRole("button", { name: /Try as Reviewer/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: /Try as Reviewer/ }).click();
    await expect(
      page.getByRole("heading", { name: "Review queue" }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });
}
