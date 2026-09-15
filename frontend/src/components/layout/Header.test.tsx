import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Header } from "./Header";

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

afterEach(cleanup);

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  stubMatchMedia(false);
});

describe("Header", () => {
  it("renders the UniDent wordmark and drops legacy brand text", () => {
    render(<Header />);

    expect(screen.getByText("UniDent")).toBeDefined();
    expect(screen.queryByText("Phục hình AI")).toBeNull();
    expect(screen.queryByText("Trợ lý Phục hình")).toBeNull();
  });

  it("hamburger is a 44px mobile-only control wired to onToggleDrawer", () => {
    const onToggleDrawer = vi.fn();
    render(<Header onToggleDrawer={onToggleDrawer} />);

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

  it("tolerates a missing onToggleDrawer while the AppShell wiring is pending", () => {
    render(<Header />);

    fireEvent.click(
      screen.getByRole("button", { name: "Mở menu điều hướng" }),
    );
  });

  it("toggles dark mode from a 44px target and persists the choice", () => {
    render(<Header />);

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
    render(<Header />);

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(
      screen.getByRole("button", { name: "Chuyển sang chế độ sáng" }),
    ).toBeDefined();
  });

  it("opens the settings modal from a 44px target", () => {
    render(<Header />);

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
