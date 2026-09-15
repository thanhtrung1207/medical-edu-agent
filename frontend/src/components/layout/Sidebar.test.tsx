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

  it("tolerates missing props while the AppShell wiring is pending", () => {
    render(<Sidebar />);

    fireEvent.click(
      screen.getByRole("button", { name: "Mở rộng thanh điều hướng" }),
    );
  });
});
