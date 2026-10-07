import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch, AUTH_SECURITY_EVENT } from "./http";

function responseWithStatus(status: number): Response {
  return new Response(null, { status });
}

describe("apiFetch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes through a successful response without refreshing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(responseWithStatus(200));
    vi.stubGlobal("fetch", fetchMock);

    const res = await apiFetch("https://api.example.com/api/chat/sessions");

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/api/chat/sessions",
      expect.objectContaining({ credentials: "omit" }),
    );
  });

  it("omits credentials for cross-origin /api requests so CORS preflight passes on hosted proxies", async () => {
    const fetchMock = vi.fn().mockResolvedValue(responseWithStatus(200));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("https://api.example.com/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/api/chat",
      expect.objectContaining({ credentials: "omit" }),
    );
  });

  it("keeps credentials for cross-origin /auth requests that need the auth cookies", async () => {
    const fetchMock = vi.fn().mockResolvedValue(responseWithStatus(200));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("https://api.example.com/auth/me");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/auth/me",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("keeps credentials for same-origin requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(responseWithStatus(200));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("http://localhost:3000/api/chat/sessions");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/api/chat/sessions",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("refreshes and retries once on a 401, then returns the retried response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(responseWithStatus(401))
      .mockResolvedValueOnce(responseWithStatus(200)) // /auth/refresh
      .mockResolvedValueOnce(responseWithStatus(200)); // retried original request
    vi.stubGlobal("fetch", fetchMock);

    const res = await apiFetch("https://api.example.com/api/chat/sessions");

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1][0])).toContain("/auth/refresh");
  });

  it("returns the original 401 response when refresh also fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(responseWithStatus(401))
      .mockResolvedValueOnce(responseWithStatus(401)); // /auth/refresh fails
    vi.stubGlobal("fetch", fetchMock);

    const res = await apiFetch("https://api.example.com/api/chat/sessions");

    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns the retried 401 without looping when the retry itself still fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(responseWithStatus(401)) // original request
      .mockResolvedValueOnce(responseWithStatus(200)) // /auth/refresh succeeds
      .mockResolvedValueOnce(responseWithStatus(401)); // retried request still 401
    vi.stubGlobal("fetch", fetchMock);

    const res = await apiFetch("https://api.example.com/api/chat/sessions");

    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("deduplicates concurrent 401s into a single refresh call", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(responseWithStatus(401)) // request A
      .mockResolvedValueOnce(responseWithStatus(401)) // request B
      .mockResolvedValueOnce(responseWithStatus(200)) // single /auth/refresh
      .mockResolvedValueOnce(responseWithStatus(200)) // retried A
      .mockResolvedValueOnce(responseWithStatus(200)); // retried B
    vi.stubGlobal("fetch", fetchMock);

    const [resA, resB] = await Promise.all([
      apiFetch("https://api.example.com/api/a"),
      apiFetch("https://api.example.com/api/b"),
    ]);

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    const refreshCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/auth/refresh"),
    );
    expect(refreshCalls).toHaveLength(1);
  });

  it("dispatches AUTH_SECURITY_EVENT with the server message when refresh fails with AUTH_REFRESH_REUSE_DETECTED", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(responseWithStatus(401)) // original request
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            detail: {
              error_code: "AUTH_REFRESH_REUSE_DETECTED",
              message: "Phiên đăng nhập đã bị thu hồi vì lý do an ninh, vui lòng đăng nhập lại.",
            },
          }),
          { status: 401 },
        ),
      ); // /auth/refresh
    vi.stubGlobal("fetch", fetchMock);

    const handler = vi.fn();
    window.addEventListener(AUTH_SECURITY_EVENT, handler);

    await apiFetch("https://api.example.com/api/chat/sessions");

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].detail.message).toBe(
      "Phiên đăng nhập đã bị thu hồi vì lý do an ninh, vui lòng đăng nhập lại.",
    );

    window.removeEventListener(AUTH_SECURITY_EVENT, handler);
  });
});
