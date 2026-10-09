import type {
  ListPreferences,
  Status,
  Submission,
  SubmissionPage,
  User,
} from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public fields?: Record<string, string[]>,
  ) {
    super(message);
  }
}
let csrfToken = "";
export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  if (options.method && options.method !== "GET")
    headers.set("X-CSRFToken", csrfToken);
  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      headers,
      credentials: "same-origin",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new ApiError(
      "Could not connect. Check your connection and try again.",
      0,
    );
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      payload?.message ||
        (response.status === 413
          ? "Documents must be 4 MB or smaller."
          : "The request could not be completed. Please try again."),
      response.status,
      payload?.fields,
    );
  return payload as T;
}
type Session = { user: User | null; csrfToken: string };
export const api = {
  async session() {
    const data = await request<Session>("/api/session/");
    csrfToken = data.csrfToken;
    return data.user;
  },
  async login(username: string, password: string) {
    const data = await request<Session>("/api/login/", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    csrfToken = data.csrfToken;
    return data.user!;
  },
  logout: () => request("/api/logout/", { method: "POST" }),
  list: (
    { page, status, sort, owner, search }: ListPreferences,
    signal?: AbortSignal,
  ) => {
    const query = new URLSearchParams({ page: String(page), sort });
    if (status !== "all") query.set("status", status);
    if (owner) query.set("owner", owner);
    if (search) query.set("q", search);
    return request<SubmissionPage>(`/api/submissions/?${query}`, { signal });
  },
  detail: (id: string, signal?: AbortSignal) =>
    request<Submission>(`/api/submissions/${id}/`, { signal }),
  create: (title: string, file: File) => {
    const data = new FormData();
    data.append("title", title);
    data.append("file", file);
    return request<Submission>("/api/submissions/", {
      method: "POST",
      body: data,
    });
  },
  decide: (id: string, status: Exclude<Status, "pending">) =>
    request<Submission>(`/api/submissions/${id}/decision/`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }),
};
export const messageOf = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
