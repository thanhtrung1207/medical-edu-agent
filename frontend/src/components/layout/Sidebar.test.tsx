import type { AnchorHTMLAttributes, ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

// next/link expects the App Router context; render a plain anchor instead.
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    children?: ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("./SessionList", () => ({
  SessionList: () => <div data-testid="session-list" />,
}));

import { Sidebar } from "./Sidebar";

// jsdom does not implement window.matchMedia, which Sidebar reads on mount.
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

describe("Sidebar", () => {
  it("rail expand button is wired to onExpandDrawer and controls the nav drawer", () => {
    const onExpandDrawer = vi.fn();
    render(<Sidebar onExpandDrawer={onExpandDrawer} />);

    const expand = screen.getByRole("button", {
      name: "Mở rộng thanh điều hướng",
    });
    expect(expand.getAttribute("aria-controls")).toBe("nav-drawer");

    fireEvent.click(expand);
    expect(onExpandDrawer).toHaveBeenCalledTimes(1);
  });
  it("expand button aria-expanded reflects the drawerOpen prop", () => {
    const { rerender } = render(<Sidebar onExpandDrawer={() => {}} />);

    const expand = screen.getByRole("button", {
      name: "Mở rộng thanh điều hướng",
    });
    expect(expand.getAttribute("aria-expanded")).toBe("false");

    rerender(<Sidebar onExpandDrawer={() => {}} drawerOpen />);
    expect(
      screen
        .getByRole("button", { name: "Mở rộng thanh điều hướng" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("renders navigation from the shared config (six routes + knowledge base)", () => {
    render(<Sidebar />);

    // The Sidebar consumes the same NAV/KNOWLEDGE_BASE_URL module as the
    // Drawer, so both surfaces expose identical routes.
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(
      expect.arrayContaining([
        "/",
        "/chat",
        "/history",
        "/quiz",
        "/progress",
        "/upload",
        "#",
      ]),
    );
    expect(links).toHaveLength(7);
  });

  it("keeps the SessionList mounted from md up so its realtime listener stays live", () => {
    // Tablet regression: between 768px and 1023px the sidebar is only an
    // icon rail, but a SessionList must stay mounted so SESSION_UPDATED_EVENT
    // keeps the session data current.
    stubMatchMedia(true);
    render(<Sidebar />);

    const list = screen.getByTestId("session-list");
    expect(list).toBeDefined();

    // Mounted but visually hidden between md and lg — only revealed at lg
    // where the sidebar is wide enough for the full list.
    const wrapper = list.parentElement as HTMLElement;
    expect(wrapper.className).toContain("hidden");
    expect(wrapper.className).toContain("lg:flex");
  });

  it("queries the md breakpoint (768px) when mounting the SessionList", () => {
    stubMatchMedia(true);
    render(<Sidebar />);

    expect(window.matchMedia).toHaveBeenCalledWith("(min-width: 768px)");
  });

  it("does not mount the SessionList below md (no background fetch)", () => {
    stubMatchMedia(false);
    render(<Sidebar />);

    expect(screen.queryByTestId("session-list")).toBeNull();
  });

  it("tolerates missing props while the AppShell wiring is pending", () => {
    render(<Sidebar />);

    fireEvent.click(
      screen.getByRole("button", { name: "Mở rộng thanh điều hướng" }),
    );
  });
});
