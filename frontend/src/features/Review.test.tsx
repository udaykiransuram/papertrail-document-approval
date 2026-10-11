import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { Review } from "./Review";
import { api } from "../api";
import type { Submission, User } from "../types";
vi.mock("./viewer/DocumentViewer", () => ({
  default: () => <div>Preview unavailable</div>,
}));

it("prevents decisions when the document has not rendered", async () => {
  const user: User = {
    id: 3,
    name: "Morgan Reed",
    username: "reviewer",
    role: "reviewer",
  };
  vi.spyOn(api, "detail").mockResolvedValue({
    id: "1",
    title: "Proposal",
    owner: { id: 1, name: "Alex Morgan", username: "alex" },
    status: "pending",
    created_at: "2026-10-09T10:00:00Z",
    reviewed_at: null,
  } as Submission);
  render(<Review id="1" user={user} onBack={vi.fn()} onOpen={vi.fn()} />);
  expect(
    await screen.findByRole("button", { name: "Approve document" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Reject document" }),
  ).toBeDisabled();
});
