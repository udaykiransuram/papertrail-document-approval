export type Status = "pending" | "approved" | "rejected";
export type SubmissionSort =
  | "newest"
  | "oldest"
  | "submitter_asc"
  | "submitter_desc"
  | "status_asc"
  | "status_desc";
export type ListPreferences = {
  page: number;
  status: Status | "all";
  sort: SubmissionSort;
  owner: string;
  search: string;
};
export type SubmissionPage = {
  results: Submission[];
  page: number;
  page_size: number;
  count: number;
  total_pages: number;
  counts: Record<Status | "all", number>;
  submitters: Omit<User, "role">[];
};
export type User = {
  id: number;
  name: string;
  username: string;
  role: "submitter" | "reviewer";
};
export type Submission = {
  id: string;
  title: string;
  owner: Omit<User, "role">;
  original_filename: string;
  content_type: string;
  size: number;
  status: Status;
  created_at: string;
  reviewed_by: Omit<User, "role"> | null;
  reviewed_at: string | null;
  file_url: string;
};
