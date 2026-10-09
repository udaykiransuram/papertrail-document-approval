import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { Login } from "./Login";
import { api } from "../api";

it("shows a rejected sign-in and preserves the form", async () => {
  vi.spyOn(api, "login").mockRejectedValueOnce(
    new Error("The username or password is incorrect."),
  );
  render(<Login onLogin={vi.fn()} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Username"), "alex");
  await user.type(screen.getByLabelText("Password"), "wrong");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "username or password is incorrect",
  );
  expect(screen.getByLabelText("Username")).toHaveValue("alex");
  expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
});
