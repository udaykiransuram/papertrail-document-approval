import { afterEach, expect, it, vi } from "vitest";
import { api, request, sessionEvents } from "./api";

afterEach(() => vi.unstubAllGlobals());

it("signals an expired session for protected API requests", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          message: "Sign in required",
          code: "not_authenticated",
        }),
        { status: 403 },
      ),
    ),
  );
  const expired = vi.fn();
  sessionEvents.addEventListener("expired", expired);
  try {
    await expect(api.detail("private-id")).rejects.toThrow("Sign in required");
    expect(expired).toHaveBeenCalledOnce();
  } finally {
    sessionEvents.removeEventListener("expired", expired);
  }
});

it("leaves a valid session intact on permission or CSRF errors", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ message: "Forbidden", code: "permission_denied" }),
          { status: 403 },
        ),
      ),
  );
  const expired = vi.fn();
  sessionEvents.addEventListener("expired", expired);
  try {
    await expect(
      request("/api/submissions/id/decision/", {
        method: "POST",
        body: JSON.stringify({ status: "approved" }),
      }),
    ).rejects.toThrow("Forbidden");
    expect(expired).not.toHaveBeenCalled();
  } finally {
    sessionEvents.removeEventListener("expired", expired);
  }
});

it("also detects session expiry while fetching private document bytes", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          message: "Sign in required",
          code: "not_authenticated",
        }),
        { status: 403 },
      ),
    ),
  );
  const expired = vi.fn();
  sessionEvents.addEventListener("expired", expired);
  try {
    await expect(api.document("/api/submissions/id/file/")).rejects.toThrow(
      "Sign in required",
    );
    expect(expired).toHaveBeenCalledOnce();
  } finally {
    sessionEvents.removeEventListener("expired", expired);
  }
});

it("returns document bytes without parsing them as JSON", async () => {
  const bytes = new Uint8Array([37, 80, 68, 70]);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(bytes)));
  expect(
    new Uint8Array(await api.document("/api/submissions/id/file/")),
  ).toEqual(bytes);
});
