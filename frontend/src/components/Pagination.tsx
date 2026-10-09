import { ChevronLeft, ChevronRight } from "lucide-react";
import type { SubmissionPage } from "../types";

export function Pagination({
  data,
  loading,
  position,
  onPage,
}: {
  data: SubmissionPage;
  loading: boolean;
  position: "top" | "bottom";
  onPage: (page: number) => void;
}) {
  return (
    <nav
      className={`pagination pagination-${position}`}
      aria-label={`Submission pages ${position}`}
    >
      {position === "bottom" && (
        <span aria-live="polite">
          {data.count
            ? `${(data.page - 1) * data.page_size + 1}–${Math.min(data.page * data.page_size, data.count)} of ${data.count} documents`
            : "0 documents"}
        </span>
      )}
      <div>
        <button
          className="icon-button"
          aria-label="Previous page"
          disabled={loading || data.page <= 1}
          onClick={() => onPage(data.page - 1)}
        >
          <ChevronLeft size={17} />
        </button>
        <span>
          Page <strong>{data.page}</strong> of {data.total_pages}
        </span>
        <button
          className="icon-button"
          aria-label="Next page"
          disabled={loading || data.page >= data.total_pages}
          onClick={() => onPage(data.page + 1)}
        >
          <ChevronRight size={17} />
        </button>
      </div>
    </nav>
  );
}
