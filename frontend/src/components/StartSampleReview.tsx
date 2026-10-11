import { useRef, useState } from "react";
import { FilePlus2 } from "lucide-react";
import { api, messageOf } from "../api";
import { ErrorNotice } from "./ui";

export function StartSampleReview({
  onOpen,
}: {
  onOpen: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  async function start() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const item = await api.startSample();
      onOpen(item.id);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="start-sample">
      <button
        className="button secondary"
        disabled={busy}
        onClick={() => void start()}
      >
        <FilePlus2 size={17} aria-hidden="true" />
        {busy ? "Preparing sample…" : "Try a sample document"}
      </button>
      <span className="sr-only" role="status">
        {busy ? "Creating a new sample PDF for review." : ""}
      </span>
      {error && <ErrorNotice message={error} />}
    </div>
  );
}
