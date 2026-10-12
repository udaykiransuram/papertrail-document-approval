import { useState } from "react";
import { ArrowRight, ChevronDown, LockKeyhole, Check } from "lucide-react";
import { api, messageOf } from "../api";
import { Brand, ErrorNotice } from "../components/ui";
import type { User } from "../types";

export function Login({
  onLogin,
  demoEnabled = false,
}: {
  onLogin: (user: User) => void;
  demoEnabled?: boolean;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [demoRole, setDemoRole] = useState<User["role"] | null>(null);
  const [accountExpanded, setAccountExpanded] = useState(false);
  const showAccountLogin = !demoEnabled || accountExpanded;
  async function tryDemo(role: User["role"]) {
    setError("");
    setBusy(true);
    setDemoRole(role);
    try {
      onLogin(await api.demoLogin(role));
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
      setDemoRole(null);
    }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      onLogin(await api.login(username.trim(), password));
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={`login-page ${demoEnabled ? "has-demo" : ""}`}>
      <header className="login-header">
        <Brand />
        <span>Document approvals, made clear.</span>
      </header>
      <main className="login-layout">
        <section className="login-story">
          <span className="story-mark" aria-hidden="true">
            <Check size={46} />
          </span>
          <h1>
            Good work deserves
            <br />a clear next step.
          </h1>
          <p>
            One place to submit documents, review the details, and move things
            forward.
          </p>
          <div className="workflow-strip">
            <span>Submit</span>
            <ArrowRight size={17} />
            <span>Review</span>
            <ArrowRight size={17} />
            <span>Decide</span>
          </div>
        </section>
        <section className="login-panel">
          <h2>{demoEnabled ? "Take a look around." : "Welcome back."}</h2>
          <p>
            {demoEnabled
              ? "Explore the full workflow. No password needed."
              : "Sign in to your document workspace."}
          </p>
          {error && <ErrorNotice message={error} />}
          {demoEnabled && (
            <div className="demo-entry">
              <button
                className="demo-role"
                disabled={busy}
                onClick={() => void tryDemo("submitter")}
              >
                <span>
                  <strong>
                    {demoRole === "submitter"
                      ? "Opening demo…"
                      : "Try as Submitter"}
                  </strong>
                  <small>Upload a sample and track its approval.</small>
                </span>
                <ArrowRight size={18} aria-hidden="true" />
              </button>
              <button
                className="demo-role"
                disabled={busy}
                onClick={() => void tryDemo("reviewer")}
              >
                <span>
                  <strong>
                    {demoRole === "reviewer"
                      ? "Opening demo…"
                      : "Try as Reviewer"}
                  </strong>
                  <small>Open a document, then approve or reject.</small>
                </span>
                <ArrowRight size={18} aria-hidden="true" />
              </button>
              <p className="demo-disclosure">
                Shared demo · Sample PDF and Word documents included. Use sample
                content only. You can switch roles at any time.
              </p>
            </div>
          )}
          {demoEnabled && (
            <button
              type="button"
              className="account-sign-in-toggle"
              aria-expanded={accountExpanded}
              aria-controls="account-sign-in"
              disabled={busy}
              onClick={() => setAccountExpanded((expanded) => !expanded)}
            >
              <span>Sign in with an existing account</span>
              <ChevronDown size={17} aria-hidden="true" />
            </button>
          )}
          <div id="account-sign-in" hidden={!showAccountLogin}>
            <form onSubmit={submit}>
              <label htmlFor="username">Username</label>
              <input
                id="username"
                name="username"
                autoComplete="username"
                autoFocus={!demoEnabled}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                required
                maxLength={150}
              />
              <label htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
              />
              <button className="button primary full" disabled={busy}>
                {busy && !demoRole ? "Signing in…" : "Sign in"}
                <ArrowRight size={18} />
              </button>
            </form>
            <div className="login-note">
              <LockKeyhole size={16} aria-hidden="true" />
              <p>
                Use the account provided by your administrator. Your documents
                are shared only with your reviewer.
              </p>
            </div>
          </div>
        </section>
      </main>
      <footer className="login-footer">
        Papertrail · A little clarity. A confident decision.
      </footer>
    </div>
  );
}
