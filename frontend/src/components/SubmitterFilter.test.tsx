import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { SubmitterFilter } from "./SubmitterFilter";
const users = [
  { id: 1, name: "Alex Morgan", username: "alex" },
  { id: 2, name: "Jamie Chen", username: "jchen" },
];
function Picker() {
  const [value, setValue] = useState("");
  return (
    <>
      <SubmitterFilter users={users} value={value} onChange={setValue} />
      <button>Outside</button>
    </>
  );
}
it("searches names and usernames, selects with the keyboard, and clears the filter", async () => {
  const user = userEvent.setup();
  render(<Picker />);
  await user.click(
    screen.getByRole("button", { name: "Submitted by: All submitters" }),
  );
  const search = screen.getByRole("combobox", { name: "Search submitters" });
  expect(search).toHaveFocus();
  await user.type(search, "JCHEN");
  expect(screen.getAllByRole("option")).toHaveLength(1);
  await user.keyboard("{Enter}");
  const selected = screen.getByRole("button", {
    name: "Submitted by: Jamie Chen",
  });
  expect(selected).toHaveFocus();
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  await user.click(selected);
  await user.type(screen.getByRole("combobox"), "Morgan");
  await user.keyboard("{Enter}");
  await user.click(
    screen.getByRole("button", { name: "Submitted by: Alex Morgan" }),
  );
  await user.click(screen.getByRole("option", { name: "All submitters" }));
  expect(
    screen.getByRole("button", { name: "Submitted by: All submitters" }),
  ).toBeVisible();
});
it("handles arrow navigation, no matches, escape, and outside dismissal", async () => {
  const user = userEvent.setup();
  render(<Picker />);
  await user.click(
    screen.getByRole("button", { name: "Submitted by: All submitters" }),
  );
  await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
  const selected = screen.getByRole("button", {
    name: "Submitted by: Jamie Chen",
  });
  await user.click(selected);
  await user.type(screen.getByRole("combobox"), "nobody here");
  expect(screen.getByRole("status")).toHaveTextContent("No submitters found.");
  await user.keyboard("{Enter}");
  expect(screen.getByRole("listbox")).toBeVisible();
  await user.keyboard("{Escape}");
  expect(selected).toHaveFocus();
  await user.click(selected);
  await user.click(screen.getByRole("button", { name: "Outside" }));
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});
