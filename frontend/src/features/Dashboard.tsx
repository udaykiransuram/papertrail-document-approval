import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ChevronDown,
  Check,
  FileCheck2,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { SubmitterFilter } from "../components/SubmitterFilter";
import { Pagination } from "../components/Pagination";
import { StartSampleReview } from "../components/StartSampleReview";
import { api, ApiError, messageOf } from "../api";
import {
  ErrorNotice,
  FileIcon,
  formatDate,
  Loading,
  StatusBadge,
} from "../components/ui";
import { UploadDialog } from "./UploadDialog";
import { DecisionDialog } from "./DecisionDialog";
import type {
  ListPreferences,
  Status,
  Submission,
  SubmissionPage,
  SubmissionSort,
  User,
} from "../types";

export function Dashboard({
  user,
  onOpen,
  preferences,
  onPreferencesChange,
}: {
  user: User;
  onOpen: (id: string) => void;
  preferences?: ListPreferences;
  onPreferencesChange: (preferences: ListPreferences) => void;
}) {
  const [query, setQuery] = useState<ListPreferences>(
    () =>
      preferences || {
        page: 1,
        status: user.role === "reviewer" ? "pending" : "all",
        sort: "newest",
        owner: "",
        search: "",
      },
  );
  const [searchInput, setSearchInput] = useState(query.search);
  const [data, setData] = useState<SubmissionPage | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    item: Submission;
    status: Exclude<Status, "pending">;
  } | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [decisionError, setDecisionError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [createdId, setCreatedId] = useState<string | null>(null);
  const decisionNotice = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (announcement) decisionNotice.current?.focus();
  }, [announcement]);

  function confirm(item: Submission, status: Exclude<Status, "pending">) {
    setAnnouncement("");
    setDecisionError("");
    setConfirmation({ item, status });
  }
  async function decide() {
    if (!confirmation || deciding) return;
    const { item, status } = confirmation;
    setDeciding(true);
    setDecisionError("");
    try {
      const saved = await api.decide(item.id, status);
      setData(
        (current) =>
          current && {
            ...current,
            results: current.results.flatMap((row) =>
              row.id !== saved.id
                ? [row]
                : query.status === "pending"
                  ? []
                  : [saved],
            ),
          },
      );
      setConfirmation(null);
      setAnnouncement(
        `“${saved.title}” ${saved.status}. Your decision has been saved.`,
      );
      setLoading(true);
      setRefreshVersion((v) => v + 1);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setConfirmation(null);
        setAnnouncement(
          `“${item.title}” was already reviewed. Your decision was not saved. The queue will refresh to show its saved status.`,
        );
        setLoading(true);
        setRefreshVersion((v) => v + 1);
      } else setDecisionError(messageOf(e));
    } finally {
      setDeciding(false);
    }
  }
  useEffect(() => {
    if (searchInput.trim() === query.search) return;
    const timeout = window.setTimeout(
      () =>
        setQuery((current) => ({
          ...current,
          search: searchInput.trim(),
          page: 1,
        })),
      250,
    );
    return () => window.clearTimeout(timeout);
  }, [searchInput, query.search]);
  useEffect(() => onPreferencesChange(query), [query, onPreferencesChange]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api
      .list(query, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setData(result);
        if (result.page !== query.page)
          setQuery({ ...query, page: result.page });
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(messageOf(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query, refreshVersion]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible")
        setRefreshVersion((v) => v + 1);
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  const visible = error ? [] : data?.results || [];
  const counts = data?.counts || {
    all: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
  };
  const hasFilters = Boolean(
    query.search || query.owner || query.status !== "all",
  );
  const hasNarrowingFilters = Boolean(query.search || query.owner);
  const emptyPending = query.status === "pending" && !hasNarrowingFilters;
  function clearFilters() {
    setSearchInput("");
    setQuery((current) => ({
      ...current,
      search: "",
      owner: "",
      status: "all",
      page: 1,
    }));
  }
  const goToPage = (page: number) =>
    setQuery((current) => ({ ...current, page }));
  return (
    <div className="dashboard-workspace">
      <div className="page-heading queue-heading">
        <div>
          <h1>
            {user.role === "reviewer" ? "Review queue" : "My submissions"}
          </h1>
        </div>
        {user.role === "submitter" && (
          <div className="queue-actions">
            <button
              className="button primary"
              onClick={() => setUploading(true)}
            >
              <Plus size={18} />
              Submit document
            </button>
          </div>
        )}
      </div>
      {announcement && (
        <div
          className="queue-decision-notice"
          role="status"
          tabIndex={-1}
          ref={decisionNotice}
        >
          {announcement}
        </div>
      )}
      <section
        className="submissions-panel"
        aria-label="Submissions"
        aria-busy={loading}
      >
        <div className="list-toolbar">
          <div className="tabs" aria-label="Filter submissions">
            {(["all", "pending", "approved", "rejected"] as const).map(
              (status) => (
                <button
                  key={status}
                  className={query.status === status ? "active" : ""}
                  aria-pressed={query.status === status}
                  onClick={() => setQuery({ ...query, status, page: 1 })}
                >
                  {status === "all"
                    ? "All documents"
                    : status[0].toUpperCase() + status.slice(1)}
                  <span>{counts[status]}</span>
                </button>
              ),
            )}
          </div>
          <button
            className="icon-button"
            aria-label="Refresh submissions"
            onClick={() => setRefreshVersion((v) => v + 1)}
            disabled={loading}
          >
            <RefreshCw size={17} />
          </button>
        </div>
        <div className="list-controls">
          <label className="document-search">
            <span className="filter-label">Search documents</span>
            <span className="search-input-wrap">
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                aria-label="Search documents"
                placeholder="Search title or filename…"
                maxLength={200}
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
              {searchInput && (
                <button
                  className="icon-button"
                  aria-label="Clear document search"
                  onClick={() => {
                    setSearchInput("");
                    setQuery((current) => ({
                      ...current,
                      search: "",
                      page: 1,
                    }));
                  }}
                >
                  <X size={15} />
                </button>
              )}
            </span>
          </label>
          {user.role === "reviewer" && (
            <SubmitterFilter
              users={data?.submitters || []}
              value={query.owner}
              onChange={(owner) =>
                setQuery((current) => ({ ...current, owner, page: 1 }))
              }
            />
          )}
          <label className="list-select">
            <span className="filter-label">Sort by</span>
            <span className="select-wrap">
              <select
                aria-label="Sort by"
                value={query.sort}
                onChange={(e) =>
                  setQuery({
                    ...query,
                    sort: e.target.value as SubmissionSort,
                    page: 1,
                  })
                }
              >
                <option value="newest">Submitted: newest first</option>
                <option value="oldest">Submitted: oldest first</option>
                <option value="status_asc">Status: pending first</option>
                <option value="status_desc">Status: rejected first</option>
                {user.role === "reviewer" && (
                  <>
                    <option value="submitter_asc">Submitter: A–Z</option>
                    <option value="submitter_desc">Submitter: Z–A</option>
                  </>
                )}
              </select>
              <ChevronDown size={15} aria-hidden="true" />
            </span>
          </label>
          {data && data.count > 0 && !error && (
            <Pagination
              data={data}
              loading={loading}
              position="top"
              onPage={goToPage}
            />
          )}
        </div>
        {(query.search || query.owner) && (
          <div className="active-filters">
            <span>
              {loading
                ? "Updating results…"
                : `${data?.count || 0} matching document${data?.count === 1 ? "" : "s"}`}
              {query.search && <> for “{query.search}”</>}
            </span>
            <button onClick={clearFilters}>
              <X size={13} />
              Clear filters
            </button>
          </div>
        )}
        {error && (
          <div className="panel-notice">
            <ErrorNotice message={error} />
          </div>
        )}
        {loading && !visible.length ? (
          <Loading label="Loading submissions…" />
        ) : visible.length ? (
          <div className={`table-scroll${loading ? " updating" : ""}`}>
            {loading && (
              <span className="sr-only" role="status">
                Updating submissions…
              </span>
            )}
            <table
              className={
                user.role === "reviewer" ? "reviewer-table" : undefined
              }
            >
              <thead>
                <tr>
                  <th>Document</th>
                  {user.role === "reviewer" && (
                    <th className="owner-cell">Submitted by</th>
                  )}
                  <th className="date-cell">Submitted</th>
                  <th>Status</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <tr
                    key={item.id}
                    className={
                      item.id === createdId ? "submission-created" : undefined
                    }
                  >
                    <td>
                      <button
                        className="document-link"
                        onClick={() => onOpen(item.id)}
                      >
                        <FileIcon name={item.original_filename} />
                        <span>
                          <strong>{item.title}</strong>
                          {item.id === createdId && (
                            <span className="new-submission-label">
                              Just submitted
                            </span>
                          )}
                          <small>{item.original_filename}</small>
                        </span>
                      </button>
                    </td>
                    {user.role === "reviewer" && (
                      <td className="owner-cell">{item.owner.name}</td>
                    )}
                    <td className="date-cell">{formatDate(item.created_at)}</td>
                    <td>
                      <StatusBadge status={item.status} />
                    </td>
                    <td>
                      <div className="row-actions">
                        {user.role === "reviewer" &&
                          item.status === "pending" && (
                            <>
                              <button
                                className="button secondary row-approve"
                                aria-label={`Approve ${item.title}`}
                                disabled={loading}
                                onClick={() => confirm(item, "approved")}
                              >
                                <Check size={15} aria-hidden="true" /> Approve
                              </button>
                              <button
                                className="button reject"
                                aria-label={`Reject ${item.title}`}
                                disabled={loading}
                                onClick={() => confirm(item, "rejected")}
                              >
                                <X size={15} aria-hidden="true" /> Reject
                              </button>
                            </>
                          )}
                        <button
                          className="icon-button"
                          aria-label={`Open ${item.title}`}
                          onClick={() => onOpen(item.id)}
                        >
                          <ArrowUpRight size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          !error && (
            <div className="empty-state">
              <span className="empty-icon">
                <FileCheck2 size={30} />
              </span>
              <h2>
                {emptyPending
                  ? user.role === "reviewer"
                    ? "You’re all caught up."
                    : "No documents awaiting review."
                  : hasFilters
                    ? "No matching documents."
                    : "A clear space for your documents."}
              </h2>
              <p>
                {emptyPending
                  ? counts.all > 0
                    ? "Every submitted document has a saved decision. You can view them below."
                    : user.is_demo
                      ? "Try a sample document to explore the approval workflow."
                      : "New submissions will appear here when they’re ready for review."
                  : hasFilters
                    ? "Try another search or clear your filters to see more documents."
                    : user.role === "submitter"
                      ? "Submit a document and follow its progress here."
                      : "Documents awaiting your review will appear here."}
              </p>
              {emptyPending && (
                <div className="empty-state-actions">
                  {counts.all > 0 && (
                    <button className="button secondary" onClick={clearFilters}>
                      View reviewed documents
                    </button>
                  )}
                  {user.is_demo && user.role === "reviewer" && (
                    <StartSampleReview onOpen={onOpen} />
                  )}
                  {user.role === "submitter" && (
                    <button
                      className="button secondary"
                      onClick={() => setUploading(true)}
                    >
                      Submit a document
                    </button>
                  )}
                </div>
              )}
              {!emptyPending && hasFilters && (
                <button className="button secondary" onClick={clearFilters}>
                  Clear filters
                </button>
              )}
              {!hasFilters &&
                user.role === "submitter" &&
                counts.all === 0 &&
                query.status === "all" && (
                  <button
                    className="button secondary"
                    onClick={() => setUploading(true)}
                  >
                    <Plus size={17} />
                    Submit your first document
                  </button>
                )}
            </div>
          )
        )}
        {data && data.count > 0 && !error && (
          <Pagination
            data={data}
            loading={loading}
            position="bottom"
            onPage={goToPage}
          />
        )}
      </section>
      {confirmation && (
        <DecisionDialog
          item={confirmation.item}
          status={confirmation.status}
          saving={deciding}
          error={decisionError}
          onConfirm={() => void decide()}
          onCancel={() => setConfirmation(null)}
          onView={() => onOpen(confirmation.item.id)}
        />
      )}
      {uploading && (
        <UploadDialog
          demo={user.is_demo}
          onClose={() => setUploading(false)}
          onCreated={(item) => {
            setUploading(false);
            setCreatedId(item.id);
            setAnnouncement(
              `“${item.title}” submitted successfully. It’s pending review.`,
            );
            setSearchInput("");
            setQuery({
              page: 1,
              status: "all",
              sort: "newest",
              owner: "",
              search: "",
            });
            setLoading(true);
            setRefreshVersion((v) => v + 1);
          }}
        />
      )}
    </div>
  );
}
