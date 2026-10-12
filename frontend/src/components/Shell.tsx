import { LogOut } from "lucide-react";
import { Avatar, Brand } from "./ui";
import type { User } from "../types";

export function Shell({
  user,
  onLogout,
  onHome,
  onSwitchRole,
  switching,
  children,
}: {
  user: User;
  onLogout: () => void;
  onHome: () => void;
  onSwitchRole?: () => void;
  switching?: boolean;
  children: React.ReactNode;
}) {
  const roleLabel = user.role === "reviewer" ? "Reviewer" : "Submitter";

  return (
    <div className={user.is_demo ? "app-shell demo-shell" : "app-shell"}>
      <header className="app-header">
        <button
          className="brand-button"
          onClick={onHome}
          aria-label="Papertrail home"
        >
          <Brand />
        </button>
        <span className="header-description">Document approvals</span>
        <div className="user-menu">
          <Avatar name={user.is_demo ? roleLabel : user.name} />
          <span className="user-info">
            <strong>{user.is_demo ? roleLabel : user.name}</strong>
            {!user.is_demo && <small>{roleLabel}</small>}
          </span>
          <button
            className="icon-button logout"
            aria-label="Sign out"
            onClick={onLogout}
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>
      {user.is_demo && (
        <aside className="demo-banner" aria-label="Demo workspace">
          <p>
            <strong>Shared demo</strong>
            <span>Use sample documents only.</span>
          </p>
          {onSwitchRole && (
            <button
              className="button secondary"
              onClick={onSwitchRole}
              disabled={switching}
            >
              {switching
                ? "Switching…"
                : `Switch to ${user.role === "reviewer" ? "Submitter" : "Reviewer"}`}
            </button>
          )}
        </aside>
      )}
      <main className="main">{children}</main>
      <footer className="app-footer">Papertrail</footer>
    </div>
  );
}
