import { expect, it } from "vitest";
import { documentScale } from "./sizing";
const page = { width: 816, height: 1056 };
it("keeps automatic sizing readable on wide screens and fits narrow ones", () => {
  expect(documentScale("auto", page, { width: 1500, height: 800 }, 100)).toBe(
    1,
  );
  expect(
    documentScale("auto", page, { width: 300, height: 500 }, 100) * page.width,
  ).toBe(300);
});
it("fits a full page within both viewport dimensions and retains actual zoom semantics", () => {
  const available = { width: 1000, height: 800 };
  const scale = documentScale("page", page, available, 100);
  expect(scale * page.height).toBeLessThanOrEqual(760);
  expect(scale * page.width).toBeLessThanOrEqual(1000);
  expect(documentScale("width", page, available, 100) * page.width).toBeCloseTo(
    1000,
  );
  expect(documentScale("actual", page, available, 20)).toBe(1);
  expect(documentScale("custom", page, available, 120)).toBe(1.2);
});
