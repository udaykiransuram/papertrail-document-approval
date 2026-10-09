import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Search, Users } from "lucide-react";
import type { User } from "../types";

export function SubmitterFilter({
  users,
  value,
  onChange,
}: {
  users: Omit<User, "role">[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const selected = users.find((user) => String(user.id) === value);
  const needle = search.trim().toLocaleLowerCase();
  const options = [
    { value: "", name: "All submitters", username: "" },
    ...users.map((user) => ({ ...user, value: String(user.id) })),
  ].filter((option) =>
    `${option.name} ${option.username}`.toLocaleLowerCase().includes(needle),
  );

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  useEffect(() => {
    if (open)
      document
        .getElementById(`${listId}-${active}`)
        ?.scrollIntoView?.({ block: "nearest" });
  }, [open, active, listId]);

  function choose(next: string) {
    onChange(next);
    setOpen(false);
    trigger.current?.focus();
  }
  return (
    <div
      className="submitter-filter"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <span className="filter-label" id={`${listId}-label`}>
        Submitted by
      </span>
      <button
        ref={trigger}
        className={`filter-trigger${value ? " has-selection" : ""}`}
        aria-label={`Submitted by: ${selected?.name || "All submitters"}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => {
          setSearch("");
          setActive(0);
          setOpen(!open);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setSearch("");
            setActive(0);
            setOpen(true);
          }
        }}
      >
        <Users size={15} aria-hidden="true" />
        <span>{selected?.name || "All submitters"}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open && (
        <div className="submitter-popover">
          <div className="submitter-search">
            <Search size={16} aria-hidden="true" />
            <input
              ref={input}
              role="combobox"
              aria-label="Search submitters"
              aria-autocomplete="list"
              aria-expanded={open}
              aria-controls={listId}
              aria-activedescendant={
                options[active] ? `${listId}-${active}` : undefined
              }
              placeholder="Search name or username…"
              value={search}
              autoComplete="off"
              onChange={(event) => {
                setSearch(event.target.value);
                setActive(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setOpen(false);
                  trigger.current?.focus();
                }
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  setActive((index) =>
                    Math.max(
                      0,
                      Math.min(
                        options.length - 1,
                        index + (event.key === "ArrowDown" ? 1 : -1),
                      ),
                    ),
                  );
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (options[active]) choose(options[active].value);
                }
              }}
            />
          </div>
          <ul id={listId} role="listbox" aria-labelledby={`${listId}-label`}>
            {options.map((option, index) => (
              <li
                id={`${listId}-${index}`}
                key={option.value}
                role="option"
                aria-selected={option.value === value}
                className={index === active ? "highlighted" : ""}
                onPointerMove={() => setActive(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option.value)}
              >
                <span className="submitter-option">
                  <span>{option.name}</span>
                  {option.username && <small>@{option.username}</small>}
                </span>
                {option.value === value && (
                  <Check size={16} aria-hidden="true" />
                )}
              </li>
            ))}
          </ul>
          {!options.length && (
            <p className="submitter-no-results" role="status">
              No submitters found.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
