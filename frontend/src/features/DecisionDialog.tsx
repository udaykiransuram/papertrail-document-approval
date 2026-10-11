import { useEffect, useId, useRef } from "react";
import { Check, X } from "lucide-react";
import { ErrorNotice, FileIcon } from "../components/ui";
import type { Status, Submission } from "../types";

export function DecisionDialog({
  item,
  status,
  saving,
  error,
  onConfirm,
  onCancel,
  onView,
}: {
  item: Submission;
  status: Exclude<Status, "pending">;
  saving: boolean;
  error: string;
  onConfirm: () => void;
  onCancel: () => void;
  onView?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const approving = status === "approved";
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    element?.showModal();
    cancel.current?.focus();
    return () => {
      element?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      className="decision-dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>(
          "button:not(:disabled)",
        );
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (!first) event.preventDefault();
        else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onCancel();
      }}
    >
      <div className={`decision-dialog-icon ${status}`} aria-hidden="true">
        {approving ? <Check size={24} /> : <X size={24} />}
      </div>
      <h2 id={titleId}>{approving ? "Approve" : "Reject"} this document?</h2>
      <p id={descriptionId}>
        This will mark the submission as {status}. This decision is final.
      </p>
      <div className="decision-document">
        <FileIcon name={item.original_filename} />
        <div>
          <strong>{item.title}</strong>
          <span>{item.original_filename}</span>
          <span>Submitted by {item.owner.name}</span>
        </div>
      </div>
      {onView && (
        <button className="decision-view" disabled={saving} onClick={onView}>
          View document before deciding
        </button>
      )}
      {error && <ErrorNotice message={error} />}
      <span className="sr-only" role="status">
        {saving ? "Saving decision…" : ""}
      </span>
      <div className="dialog-actions">
        <button
          ref={cancel}
          className="button secondary"
          disabled={saving}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          className={`button ${approving ? "primary" : "danger"}`}
          disabled={saving}
          onClick={onConfirm}
        >
          {saving
            ? "Saving decision…"
            : `Confirm ${approving ? "approval" : "rejection"}`}
        </button>
      </div>
    </dialog>
  );
}
