import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthContext";
import { AUTH_SECURITY_EVENT } from "@/lib/http";

function Probe() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div>loading</div>;
  return <div>{user ? `logged-in:${user.email}` : "logged-out"}</div>;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AuthProvider", () => {
  it("sets the user when /auth/me returns 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: "u1",
            email: "a@example.com",
            name: "A",
            avatar_url: null,
          }),
          { status: 200 },
        ),
      ),
    );

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => screen.getByText("logged-in:a@example.com"));
  });

  it("sets user to null when /auth/me returns 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    );

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => screen.getByText("logged-out"));
  });

  it("useAuth throws when used outside AuthProvider", () => {
    const Bare = () => {
      useAuth();
      return null;
    };
    expect(() => render(<Bare />)).toThrow(
      "useAuth must be used within an AuthProvider",
    );
  });

  it("sets securityNotice when AUTH_SECURITY_EVENT fires and clears the user", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: "u1",
            email: "a@example.com",
            name: "A",
            avatar_url: null,
          }),
          { status: 200 },
        ),
      ),
    );

    function NoticeProbe() {
      const { securityNotice } = useAuth();
      return <div>{securityNotice ?? "no-notice"}</div>;
    }

    render(
      <AuthProvider>
        <NoticeProbe />
      </AuthProvider>,
    );

    await waitFor(() => screen.getByText("no-notice"));

    window.dispatchEvent(
      new CustomEvent(AUTH_SECURITY_EVENT, {
        detail: { message: "Phiên đăng nhập đã bị thu hồi vì lý do an ninh." },
      }),
    );

    await waitFor(() =>
      screen.getByText("Phiên đăng nhập đã bị thu hồi vì lý do an ninh."),
    );
  });

  it("dismissSecurityNotice clears the notice", async () => {
    function NoticeProbe() {
      const { securityNotice, dismissSecurityNotice } = useAuth();
      return (
        <div>
          <span>{securityNotice ?? "no-notice"}</span>
          <button onClick={dismissSecurityNotice}>dismiss</button>
        </div>
      );
    }

    render(
      <AuthProvider>
        <NoticeProbe />
      </AuthProvider>,
    );

    window.dispatchEvent(
      new CustomEvent(AUTH_SECURITY_EVENT, { detail: { message: "notice" } }),
    );
    await waitFor(() => screen.getByText("notice"));

    screen.getByText("dismiss").click();
    await waitFor(() => screen.getByText("no-notice"));
  });
});
