import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// AppShell's children are stubbed so the test observes only the drawer-state
// wiring: what each launcher receives and when the drawer mounts.
vi.mock("./Sidebar", () => ({
  Sidebar: ({ drawerOpen }: { drawerOpen?: boolean }) => (
    <div data-testid="sidebar" data-drawer-open={String(drawerOpen ?? false)} />
  ),
}));

vi.mock("./Header", () => ({
  Header: ({
    onToggleDrawer,
    drawerOpen,
  }: {
    onToggleDrawer?: () => void;
    drawerOpen?: boolean;
  }) => (
    <button
      type="button"
      data-testid="header-launcher"
      data-drawer-open={String(drawerOpen ?? false)}
      onClick={onToggleDrawer}
    />
  ),
}));

vi.mock("./Drawer", () => ({
  Drawer: ({ open }: { open: boolean }) =>
    open ? <div data-testid="nav-drawer-stub" /> : null,
}));

vi.mock("./Footer", () => ({
  Footer: () => null,
}));

import { AppShell } from "./AppShell";

// jsdom does not implement window.matchMedia, which AppShell reads on mount.
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
  stubMatchMedia(false);
});

describe("AppShell", () => {
  it("threads the real drawer state into both launchers as the drawer toggles", () => {
    render(
      <AppShell>
        <div>page content</div>
      </AppShell>,
    );

    const headerLauncher = screen.getByTestId("header-launcher");
    const sidebar = screen.getByTestId("sidebar");

    // Collapsed: both launchers report false and the drawer is unmounted.
    expect(headerLauncher.getAttribute("data-drawer-open")).toBe("false");
    expect(sidebar.getAttribute("data-drawer-open")).toBe("false");
    expect(screen.queryByTestId("nav-drawer-stub")).toBeNull();

    // Opening from the header launcher flips both launchers and mounts the
    // drawer.
    fireEvent.click(headerLauncher);
    expect(headerLauncher.getAttribute("data-drawer-open")).toBe("true");
    expect(sidebar.getAttribute("data-drawer-open")).toBe("true");
    expect(screen.getByTestId("nav-drawer-stub")).toBeDefined();

    // Toggling again collapses everything.
    fireEvent.click(headerLauncher);
    expect(headerLauncher.getAttribute("data-drawer-open")).toBe("false");
    expect(sidebar.getAttribute("data-drawer-open")).toBe("false");
    expect(screen.queryByTestId("nav-drawer-stub")).toBeNull();
  });
});
