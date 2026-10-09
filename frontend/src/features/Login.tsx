import { useState } from "react";
import { ArrowRight, LockKeyhole, Check } from "lucide-react";
import { api, messageOf } from "../api";
import { Brand, ErrorNotice } from "../components/ui";
import type { User } from "../types";

export function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
    <div className="login-page">
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
          <h2>Welcome back.</h2>
          <p>Sign in to your document workspace.</p>
          <form onSubmit={submit}>
            {error && <ErrorNotice message={error} />}
            <label htmlFor="username">Username</label>
            <input
              id="username"
              name="username"
              autoComplete="username"
              autoFocus
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
              {busy ? "Signing in…" : "Sign in"}
              <ArrowRight size={18} />
            </button>
          </form>
          <div className="login-note">
            <LockKeyhole size={16} />
            <p>
              Use the account provided by your administrator. Your documents are
              shared only with your reviewer.
            </p>
          </div>
        </section>
      </main>
      <footer className="login-footer">
        Papertrail · A little clarity. A confident decision.
      </footer>
    </div>
  );
}
