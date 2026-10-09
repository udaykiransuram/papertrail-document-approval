import { LogOut } from "lucide-react";
import { Avatar, Brand } from "./ui";
import type { User } from "../types";

export function Shell({
  user,
  onLogout,
  onHome,
  children,
}: {
  user: User;
  onLogout: () => void;
  onHome: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
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
          <Avatar name={user.name} />
          <span className="user-info">
            <strong>{user.name}</strong>
            <small>{user.role === "reviewer" ? "Reviewer" : "Submitter"}</small>
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
      <main className="main">{children}</main>
      <footer className="app-footer">
        Papertrail<span>Every document. A clear next step.</span>
      </footer>
    </>
  );
}
