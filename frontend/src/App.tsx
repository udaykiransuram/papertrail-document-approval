import { useEffect, useState } from "react";
import { api, messageOf } from "./api";
import { ErrorNotice, Loading } from "./components/ui";
import { Shell } from "./components/Shell";
import { Dashboard } from "./features/Dashboard";
import { Login } from "./features/Login";
import { Review } from "./features/Review";
import type { ListPreferences, User } from "./types";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [listPreferences, setListPreferences] = useState<ListPreferences>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [demoEnabled, setDemoEnabled] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    api
      .session()
      .then((session) => {
        setUser(session.user);
        setDemoEnabled(Boolean(session.demoEnabled));
      })
      .catch((e) => setError(messageOf(e)))
      .finally(() => setLoading(false));
    const pop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  function navigate(next: string) {
    window.history.pushState({}, "", next);
    setPath(next);
    window.scrollTo(0, 0);
  }
  async function logout() {
    try {
      await api.logout();
      setUser(null);
      setListPreferences(undefined);
      navigate("/");
      await api.session();
    } catch (e) {
      setError(messageOf(e));
    }
  }
  async function switchDemoRole() {
    if (!user?.is_demo || switching) return;
    setSwitching(true);
    setError("");
    try {
      const next = await api.demoLogin(
        user.role === "reviewer" ? "submitter" : "reviewer",
      );
      setUser(next);
      setListPreferences(undefined);
      navigate("/");
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setSwitching(false);
    }
  }
  if (loading)
    return (
      <div className="startup">
        <Loading label="Opening your workspace…" />
      </div>
    );
  if (!user)
    return (
      <>
        {error && <ErrorNotice message={error} />}
        <Login
          demoEnabled={demoEnabled}
          onLogin={(next) => {
            setError("");
            setUser(next);
            setListPreferences(undefined);
            navigate("/");
          }}
        />
      </>
    );
  const id = path.match(/^\/submissions\/([a-f0-9-]+)\/?$/)?.[1];
  return (
    <Shell
      user={user}
      onLogout={() => void logout()}
      onHome={() => navigate("/")}
      onSwitchRole={demoEnabled ? () => void switchDemoRole() : undefined}
      switching={switching}
    >
      {error && <ErrorNotice message={error} />}{" "}
      {id ? (
        <Review key={id} id={id} user={user} onBack={() => navigate("/")} />
      ) : (
        <Dashboard
          key={user.id}
          user={user}
          preferences={listPreferences}
          onPreferencesChange={setListPreferences}
          onOpen={(id) => navigate(`/submissions/${id}`)}
        />
      )}
    </Shell>
  );
}
