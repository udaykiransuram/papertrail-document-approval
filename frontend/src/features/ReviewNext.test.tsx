import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";
import { ReviewNext } from "./ReviewNext";
import type { SubmissionPage } from "../types";

afterEach(() => vi.restoreAllMocks());
const preferences = {
  page: 3,
  status: "approved" as const,
  sort: "oldest" as const,
  owner: "2",
  search: "budget",
};
const empty = { results: [], count: 0 } as unknown as SubmissionPage;
const pending = {
  results: [{ id: "next", title: "Next budget" }],
  count: 1,
} as unknown as SubmissionPage;

it("rechecks pending work and keeps filters when the next document was already decided", async () => {
  const open = vi.fn();
  const list = vi
    .spyOn(api, "list")
    .mockResolvedValueOnce(pending)
    .mockResolvedValueOnce(empty);
  render(<ReviewNext preferences={preferences} onOpen={open} />);
  await userEvent.click(
    await screen.findByRole("button", { name: "Review next pending document" }),
  );
  expect(
    await screen.findByText("No pending documents match your filters."),
  ).toBeVisible();
  expect(open).not.toHaveBeenCalled();
  expect(list).toHaveBeenLastCalledWith({
    ...preferences,
    page: 1,
    status: "pending",
  });
});

it("offers retry after a queue failure without losing its filters", async () => {
  const open = vi.fn();
  vi.spyOn(api, "list")
    .mockRejectedValueOnce(new Error("Queue unavailable"))
    .mockResolvedValue(pending);
  render(<ReviewNext preferences={preferences} onOpen={open} />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Queue unavailable",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Retry queue check" }),
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Review next pending document" }),
  );
  expect(open).toHaveBeenCalledWith("next");
});
