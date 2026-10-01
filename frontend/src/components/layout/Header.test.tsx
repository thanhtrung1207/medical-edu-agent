import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push }),
}));

import { Header } from "./Header";
import { AuthProvider } from "@/contexts/AuthContext";

vi.mock("@/components/case/SettingsModal", () => ({
  SettingsModal: ({ open }: { open: boolean }) =>
    open ? <div role="dialog">Dữ liệu học tập</div> : null,
}));

// jsdom does not implement window.matchMedia, which Header reads on mount.
function stubMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function renderHeader(props: Parameters<typeof Header>[0] = {}) {
  return render(
    <AuthProvider>
      <Header {...props} />
    </AuthProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  navigation.push.mockClear();
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  stubMatchMedia(false);
  // Default to logged-out so existing assertions (no avatar/logout button)
  // keep holding; individual tests override this to simulate a logged-in user.
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
  );
});

describe("Header", () => {
  it("renders the UniDent wordmark and drops legacy brand text", () => {
    renderHeader();

    expect(screen.getByText("UniDent")).toBeDefined();
    expect(screen.queryByText("Phục hình AI")).toBeNull();
    expect(screen.queryByText("Trợ lý Phục hình")).toBeNull();
  });

  it("keeps the brand as plain text so each route keeps its own top-level heading", () => {
    renderHeader();

    expect(screen.queryByRole("heading")).toBeNull();
    const brand = screen.getByText("UniDent");
    expect(brand.tagName).toBe("SPAN");
  });

  it("hamburger is a 44px mobile-only control wired to onToggleDrawer", () => {
    const onToggleDrawer = vi.fn();
    renderHeader({ onToggleDrawer });

    const hamburger = screen.getByRole("button", {
      name: "Mở menu điều hướng",
    });
    expect(hamburger.getAttribute("aria-controls")).toBe("nav-drawer");
    expect(hamburger.className).toContain("h-11");
    expect(hamburger.className).toContain("w-11");
    expect(hamburger.className).toContain("md:hidden");

    fireEvent.click(hamburger);
    expect(onToggleDrawer).toHaveBeenCalledTimes(1);
  });

  it("hamburger aria-expanded reflects the drawerOpen prop", () => {
    const { rerender } = renderHeader({ onToggleDrawer: () => {} });

    const hamburger = screen.getByRole("button", {
      name: "Mở menu điều hướng",
    });
    expect(hamburger.getAttribute("aria-expanded")).toBe("false");

    rerender(
      <AuthProvider>
        <Header onToggleDrawer={() => {}} drawerOpen />
      </AuthProvider>,
    );
    expect(
      screen
        .getByRole("button", { name: "Mở menu điều hướng" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("tolerates a missing onToggleDrawer while the AppShell wiring is pending", () => {
    renderHeader();

    fireEvent.click(
      screen.getByRole("button", { name: "Mở menu điều hướng" }),
    );
  });

  it("toggles dark mode from a 44px target and persists the choice", () => {
    renderHeader();

    const themeButton = screen.getByRole("button", {
      name: "Chuyển sang chế độ tối",
    });
    expect(themeButton.className).toContain("h-11");
    expect(themeButton.className).toContain("w-11");

    fireEvent.click(themeButton);

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(
      screen.getByRole("button", { name: "Chuyển sang chế độ sáng" }),
    ).toBeDefined();
  });

  it("applies the stored dark preference on mount", () => {
    localStorage.setItem("theme", "dark");
    renderHeader();

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(
      screen.getByRole("button", { name: "Chuyển sang chế độ sáng" }),
    ).toBeDefined();
  });

  it("opens the settings modal from a 44px target", () => {
    renderHeader();

    const settingsButton = screen.getByRole("button", {
      name: "Quản lý dữ liệu học tập",
    });
    expect(settingsButton.className).toContain("h-11");
    expect(settingsButton.className).toContain("w-11");

    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(settingsButton);
    expect(screen.getByRole("dialog")).toBeDefined();
  });
});

describe("Header auth controls", () => {
  it("shows a 44px-tall login control that navigates to /login when logged out", async () => {
    renderHeader();

    const loginButton = await screen.findByRole("button", {
      name: "Đăng nhập",
    });
    expect(loginButton.className).toContain("min-h-[44px]");

    fireEvent.click(loginButton);
    expect(navigation.push).toHaveBeenCalledWith("/login");
  });

  it("shows the avatar and a 44px sign-out control when logged in", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: "u1",
            email: "a@example.com",
            name: "Nguyễn A",
            avatar_url: null,
          }),
          { status: 200 },
        ),
      ),
    );

    renderHeader();

    expect(await screen.findByText("Nguyễn A")).toBeDefined();
    const logoutButton = screen.getByRole("button", { name: "Đăng xuất" });
    expect(logoutButton.className).toContain("min-h-[44px]");

    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));
    fireEvent.click(logoutButton);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Đăng nhập" })).toBeDefined(),
    );
  });
});
