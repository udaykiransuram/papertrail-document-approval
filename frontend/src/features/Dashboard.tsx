import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  ChevronDown,
  FileCheck2,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { SubmitterFilter } from "../components/SubmitterFilter";
import { Pagination } from "../components/Pagination";
import { api, messageOf } from "../api";
import {
  ErrorNotice,
  FileIcon,
  formatDate,
  Loading,
  StatusBadge,
} from "../components/ui";
import { UploadDialog } from "./UploadDialog";
import type {
  ListPreferences,
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
          <button className="button primary" onClick={() => setUploading(true)}>
            <Plus size={18} />
            Submit document
          </button>
        )}
      </div>
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
          {data && !error && (
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
        {loading && !data ? (
          <Loading label="Loading submissions…" />
        ) : visible.length ? (
          <div className={`table-scroll${loading ? " updating" : ""}`}>
            {loading && (
              <span className="sr-only" role="status">
                Updating submissions…
              </span>
            )}
            <table>
              <thead>
                <tr>
                  <th>Document</th>
                  {user.role === "reviewer" && (
                    <th className="owner-cell">Submitted by</th>
                  )}
                  <th className="date-cell">Submitted</th>
                  <th>Status</th>
                  <th>
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <button
                        className="document-link"
                        onClick={() => onOpen(item.id)}
                      >
                        <FileIcon name={item.original_filename} />
                        <span>
                          <strong>{item.title}</strong>
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
                      <button
                        className="icon-button"
                        aria-label={`Open ${item.title}`}
                        onClick={() => onOpen(item.id)}
                      >
                        <ArrowUpRight size={18} />
                      </button>
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
                {hasFilters
                  ? "No matching documents."
                  : "A clear space for your documents."}
              </h2>
              <p>
                {hasFilters
                  ? "Try another search or clear your filters to see more documents."
                  : user.role === "submitter"
                    ? "Submit a document and follow its progress here."
                    : "Documents awaiting your review will appear here."}
              </p>
              {hasFilters && (
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
        {data && !error && (
          <Pagination
            data={data}
            loading={loading}
            position="bottom"
            onPage={goToPage}
          />
        )}
      </section>
      {uploading && (
        <UploadDialog
          demo={user.is_demo}
          onClose={() => setUploading(false)}
          onCreated={(item) => {
            setUploading(false);
            onOpen(item.id);
          }}
        />
      )}
    </div>
  );
}
