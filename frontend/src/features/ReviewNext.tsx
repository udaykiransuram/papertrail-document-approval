import { useEffect, useState } from "react";
import { ArrowRight, CheckCheck } from "lucide-react";
import { api, messageOf } from "../api";
import { ErrorNotice } from "../components/ui";
import type { ListPreferences, Submission } from "../types";

export function ReviewNext({
  preferences,
  onOpen,
}: {
  preferences?: ListPreferences;
  onOpen: (id: string) => void;
}) {
  const search = preferences?.search || "";
  const owner = preferences?.owner || "";
  const sort = preferences?.sort || "newest";
  const [next, setNext] = useState<Submission | null>(null);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError("");
    api
      .list(
        { page: 1, status: "pending", search, owner, sort },
        controller.signal,
      )
      .then((page) => {
        if (controller.signal.aborted) return;
        setNext(page.results[0] || null);
        setCount(page.count);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(messageOf(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [search, owner, sort, version]);
  async function openNext() {
    setBusy(true);
    setError("");
    try {
      // Recheck because another reviewer tab may have decided since this card loaded.
      const page = await api.list({
        page: 1,
        status: "pending",
        search,
        owner,
        sort,
      });
      setNext(page.results[0] || null);
      setCount(page.count);
      if (page.results[0]) onOpen(page.results[0].id);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="review-next" aria-busy={busy}>
      {error ? (
        <>
          <ErrorNotice message={error} />
          <button
            className="button secondary full"
            onClick={() => setVersion((v) => v + 1)}
          >
            Retry queue check
          </button>
        </>
      ) : busy ? (
        <p role="status">Checking your queue…</p>
      ) : next ? (
        <>
          <p>
            {count} pending {count === 1 ? "document" : "documents"}
            {search || owner ? " matching your filters" : " in your queue"}.
          </p>
          <button
            className="button primary full"
            onClick={() => void openNext()}
          >
            Review next pending document{" "}
            <ArrowRight size={16} aria-hidden="true" />
          </button>
          <small className="next-title">Next: {next.title}</small>
        </>
      ) : (
        <p className="queue-complete" role="status">
          <CheckCheck size={18} aria-hidden="true" />
          {search || owner
            ? "No pending documents match your filters."
            : "You’re all caught up."}
        </p>
      )}
    </div>
  );
}
