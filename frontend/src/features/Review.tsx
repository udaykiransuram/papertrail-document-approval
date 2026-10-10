import { lazy, Suspense, useEffect, useState } from "react";
import { ArrowLeft, Check, LockKeyhole, X } from "lucide-react";
import { api, ApiError, messageOf } from "../api";
import {
  Avatar,
  ErrorNotice,
  formatDate,
  Loading,
  StatusBadge,
} from "../components/ui";
import type { Status, Submission, User } from "../types";
const DocumentViewer = lazy(() => import("./viewer/DocumentViewer"));

export function Review({
  id,
  user,
  onBack,
}: {
  id: string;
  user: User;
  onBack: () => void;
}) {
  const [item, setItem] = useState<Submission | null>(null);
  const [error, setError] = useState("");
  const [deciding, setDeciding] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [confirmation, setConfirmation] = useState<Exclude<
    Status,
    "pending"
  > | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    api
      .detail(id, controller.signal)
      .then(setItem)
      .catch((e) => {
        if (!controller.signal.aborted) setError(messageOf(e));
      });
    return () => controller.abort();
  }, [id]);
  async function decide(status: Exclude<Status, "pending">) {
    setDeciding(true);
    setError("");
    try {
      setItem(await api.decide(id, status));
      setConfirmation(null);
    } catch (e) {
      setError(messageOf(e));
      if (e instanceof ApiError && e.status === 409) {
        setConfirmation(null);
        try {
          setItem(await api.detail(id));
        } catch {
          setError(
            "This submission was already reviewed. Return to the list to refresh its status.",
          );
          setPreviewReady(false);
        }
      }
    } finally {
      setDeciding(false);
    }
  }
  return (
    <section
      className="review-workspace"
      aria-label={
        user.role === "reviewer" ? "Review document" : "View document"
      }
    >
      <div className="review-topbar">
        <button
          className="review-back"
          onClick={onBack}
          aria-label="Back to submissions"
        >
          <ArrowLeft size={18} />
          <span>Submissions</span>
        </button>
        <span className="review-topbar-divider" aria-hidden="true" />
        <h1 title={item?.title}>{item?.title || "Loading document…"}</h1>
        {item && <StatusBadge status={item.status} />}
      </div>
      {error && <ErrorNotice message={error} />}{" "}
      {!item ? (
        !error && <Loading label="Loading document…" />
      ) : (
        <div className="review-layout">
          <Suspense
            fallback={
              <div className="viewer-panel">
                <Loading label="Preparing viewer…" />
              </div>
            }
          >
            <DocumentViewer
              key={item.id}
              item={item}
              onReady={setPreviewReady}
            />
          </Suspense>
          <aside className="review-sidebar">
            <div className="sidebar-heading">
              <h2>Submission details</h2>
            </div>
            <dl>
              <dt>Submitted by</dt>
              <dd className="person">
                <Avatar name={item.owner.name} />
                {item.owner.name}
              </dd>
              <dt>Submitted</dt>
              <dd>{formatDate(item.created_at)}</dd>
            </dl>
            <div className="decision-section">
              <h2>
                {item.status === "pending"
                  ? user.role === "reviewer"
                    ? "Your decision"
                    : "Awaiting review"
                  : "Review complete"}
              </h2>
              {item.status === "pending" ? (
                user.role === "reviewer" ? (
                  <>
                    <p>Review the document before making a decision.</p>
                    {confirmation ? (
                      <div className="confirm-decision">
                        <p>
                          {confirmation === "approved" ? "Approve" : "Reject"}{" "}
                          this document? This decision is final.
                        </p>
                        <button
                          className={`button full ${confirmation === "approved" ? "primary" : "danger"}`}
                          disabled={deciding}
                          onClick={() => void decide(confirmation)}
                        >
                          {deciding
                            ? "Saving decision…"
                            : `Confirm ${confirmation === "approved" ? "approval" : "rejection"}`}
                        </button>
                        <button
                          className="button secondary full"
                          disabled={deciding}
                          onClick={() => setConfirmation(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          className="button primary full"
                          disabled={!previewReady}
                          onClick={() => setConfirmation("approved")}
                        >
                          <Check size={20} />
                          Approve document
                        </button>
                        <button
                          className="button reject full"
                          disabled={!previewReady}
                          onClick={() => setConfirmation("rejected")}
                        >
                          <X size={20} />
                          Reject document
                        </button>
                        {!previewReady && (
                          <small className="form-hint">
                            Decision controls become available when the preview
                            loads.
                          </small>
                        )}
                      </>
                    )}
                  </>
                ) : (
                  <p>
                    {user.is_demo
                      ? "Switch to Reviewer to read this document and make a decision."
                      : "Morgan Reed will review your document. Your status updates here when a decision is made."}
                  </p>
                )
              ) : (
                <>
                  <p>
                    <strong>{item.reviewed_by?.name}</strong> {item.status} this
                    document on{" "}
                    {item.reviewed_at && formatDate(item.reviewed_at)}.
                  </p>
                </>
              )}
            </div>
            <p className="privacy-note">
              <LockKeyhole size={17} />
              <span>
                {user.is_demo
                  ? "Documents in this shared demo are visible to everyone trying it."
                  : "Only the submitter and reviewer can access this document."}
              </span>
            </p>
          </aside>
        </div>
      )}
    </section>
  );
}
