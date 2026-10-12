import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { Login } from "./Login";
import { api } from "../api";

it("opens account sign-in with the keyboard and preserves input after an error or collapse", async () => {
  vi.spyOn(api, "login").mockRejectedValueOnce(
    new Error("The username or password is incorrect."),
  );
  render(<Login demoEnabled onLogin={vi.fn()} />);
  const user = userEvent.setup();
  const toggle = screen.getByRole("button", {
    name: "Sign in with an existing account",
  });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByLabelText("Username")).not.toBeVisible();
  expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
  toggle.focus();
  await user.keyboard("{Enter}");
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  await user.tab();
  expect(screen.getByLabelText("Username")).toHaveFocus();
  await user.type(screen.getByLabelText("Username"), "alex");
  await user.type(screen.getByLabelText("Password"), "wrong");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "username or password is incorrect",
  );
  expect(screen.getByLabelText("Username")).toHaveValue("alex");
  expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  await user.click(toggle);
  expect(screen.getByLabelText("Username")).not.toBeVisible();
  await user.keyboard(" ");
  expect(screen.getByLabelText("Username")).toBeVisible();
  expect(screen.getByLabelText("Username")).toHaveValue("alex");
});

it("opens the selected demo role without entering credentials", async () => {
  const demoUser = {
    id: 10,
    name: "Demo Reviewer",
    username: "demo_reviewer",
    role: "reviewer" as const,
    is_demo: true,
  };
  const demoLogin = vi.spyOn(api, "demoLogin").mockResolvedValueOnce(demoUser);
  const onLogin = vi.fn();
  render(<Login demoEnabled onLogin={onLogin} />);
  expect(screen.getByLabelText("Username")).not.toBeVisible();
  await userEvent.click(
    screen.getByRole("button", { name: /Try as Reviewer/ }),
  );
  expect(demoLogin).toHaveBeenCalledWith("reviewer");
  expect(onLogin).toHaveBeenCalledWith(demoUser);
});

it("keeps demo access recoverable when the service fails", async () => {
  vi.spyOn(api, "demoLogin").mockRejectedValueOnce(
    new Error("The demo is not ready yet."),
  );
  const onLogin = vi.fn();
  render(<Login demoEnabled onLogin={onLogin} />);
  await userEvent.click(
    screen.getByRole("button", { name: /Try as Submitter/ }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("not ready yet");
  expect(
    screen.getByRole("button", { name: /Try as Submitter/ }),
  ).toBeEnabled();
  expect(onLogin).not.toHaveBeenCalled();
});

it("does not show public demo entry when disabled", () => {
  render(<Login onLogin={vi.fn()} />);
  expect(
    screen.queryByRole("button", { name: /Try as/ }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Sign in" })).toBeVisible();
  expect(screen.getByLabelText("Username")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Sign in with an existing account" }),
  ).not.toBeInTheDocument();
});
