import type { Ref } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { formatDateTime } from "../components/ui";
import { ReviewNext } from "./ReviewNext";
import type { ListPreferences, Submission, User } from "../types";

export function DecisionResult({
  item,
  user,
  preferences,
  onBack,
  onOpen,
  headingRef,
}: {
  item: Submission;
  user: User;
  preferences?: ListPreferences;
  onBack: () => void;
  onOpen: (id: string) => void;
  headingRef: Ref<HTMLHeadingElement>;
}) {
  const approved = item.status === "approved";
  const Icon = approved ? CheckCircle2 : XCircle;
  return (
    <section
      className={`decision-outcome ${approved ? "approved" : "rejected"}`}
      aria-label="Review complete"
    >
      <div className="outcome-heading">
        <Icon size={25} aria-hidden="true" />
        <div>
          <span className="outcome-eyebrow">Decision saved</span>
          <h2 tabIndex={-1} ref={headingRef}>
            {approved ? "Approved" : "Rejected"}
          </h2>
        </div>
      </div>
      <p className="outcome-byline">
        Reviewed by <strong>{item.reviewed_by?.name || "the reviewer"}</strong>
        {item.reviewed_at && (
          <time dateTime={item.reviewed_at}>
            {formatDateTime(item.reviewed_at)}
          </time>
        )}
      </p>
      {user.role === "reviewer" && (
        <ReviewNext preferences={preferences} onOpen={onOpen} />
      )}
      <button className="button secondary full" onClick={onBack}>
        {user.role === "reviewer" ? "Back to queue" : "Back to submissions"}
      </button>
    </section>
  );
}
