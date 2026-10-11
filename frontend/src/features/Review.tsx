import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, LockKeyhole, X } from "lucide-react";
import { api, ApiError, messageOf } from "../api";
import {
  Avatar,
  ErrorNotice,
  formatDate,
  Loading,
  StatusBadge,
} from "../components/ui";
import type { ListPreferences, Status, Submission, User } from "../types";
import { DecisionResult } from "./DecisionResult";
import { DecisionDialog } from "./DecisionDialog";
const DocumentViewer = lazy(() => import("./viewer/DocumentViewer"));

export function Review({
  id,
  user,
  onBack,
  onOpen,
  preferences,
}: {
  id: string;
  user: User;
  onBack: () => void;
  onOpen: (id: string) => void;
  preferences?: ListPreferences;
}) {
  const [item, setItem] = useState<Submission | null>(null);
  const [error, setError] = useState("");
  const [deciding, setDeciding] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const resultHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (announcement) resultHeading.current?.focus();
  }, [announcement]);
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
      setAnnouncement(`Document ${status}. Your decision has been saved.`);
    } catch (e) {
      setError(messageOf(e));
      if (e instanceof ApiError && e.status === 409) {
        setConfirmation(null);
        try {
          const saved = await api.detail(id);
          setItem(saved);
          setAnnouncement(
            `This document was already reviewed. Saved decision: ${saved.status}.`,
          );
          setError(
            "This submission has already been reviewed. The saved decision is shown below.",
          );
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
      <p
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement}
      </p>
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
      {error && !confirmation && <ErrorNotice message={error} />}{" "}
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
            {item.status !== "pending" && (
              <DecisionResult
                item={item}
                user={user}
                preferences={preferences}
                onBack={onBack}
                onOpen={onOpen}
                headingRef={resultHeading}
              />
            )}
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
            {item.status === "pending" && (
              <div className="decision-section">
                <h2>
                  {user.role === "reviewer"
                    ? "Your decision"
                    : "Awaiting review"}
                </h2>
                {user.role === "reviewer" ? (
                  <>
                    <p>Review the document before making a decision.</p>
                    <button
                      className="button primary full"
                      disabled={!previewReady}
                      onClick={() => {
                        setError("");
                        setConfirmation("approved");
                      }}
                    >
                      <Check size={20} />
                      Approve document
                    </button>
                    <button
                      className="button reject full"
                      disabled={!previewReady}
                      onClick={() => {
                        setError("");
                        setConfirmation("rejected");
                      }}
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
                ) : (
                  <p>
                    {user.is_demo
                      ? "Switch to Reviewer to read this document and make a decision."
                      : "Morgan Reed will review your document. Your status updates here when a decision is made."}
                  </p>
                )}
              </div>
            )}
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
      {item && confirmation && (
        <DecisionDialog
          item={item}
          status={confirmation}
          saving={deciding}
          error={error}
          onConfirm={() => void decide(confirmation)}
          onCancel={() => {
            setConfirmation(null);
            setError("");
          }}
        />
      )}
    </section>
  );
}
