import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mutable router state lets tests simulate client-side navigation without
// pulling in the Next.js router context.
const navigation = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

type LinkMockProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  children?: ReactNode;
};

// next/link expects the App Router context on click; render a plain anchor
// that keeps click handling (without jsdom navigation noise) instead.
vi.mock("next/link", () => ({
  default: ({ href, children, onClick, ...rest }: LinkMockProps) => (
    <a
      href={href}
      {...rest}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        event.preventDefault();
        onClick?.(event);
      }}
    >
      {children}
    </a>
  ),
}));

vi.mock("./SessionList", () => ({
  SessionList: () => (
    <div data-testid="session-list">
      <button type="button">Cuộc trò chuyện mẫu</button>
    </div>
  ),
}));

import { Drawer } from "./Drawer";

afterEach(cleanup);

beforeEach(() => {
  navigation.pathname = "/";
  document.body.style.overflow = "";
});

describe("Drawer", () => {
  it("renders nothing when closed", () => {
    const { container } = render(<Drawer open={false} onClose={() => {}} />);

    expect(container.innerHTML).toBe("");
  });

  it("renders an accessible dialog with nav labels and sessions when open", () => {
    render(<Drawer open onClose={() => {}} />);

    const dialog = screen.getByRole("dialog", { name: "Menu điều hướng" });
    expect(dialog.getAttribute("id")).toBe("nav-drawer");
    expect(dialog.getAttribute("aria-modal")).toBe("true");

    // Six internal routes plus the external Knowledge Base link.
    expect(screen.getAllByRole("link")).toHaveLength(7);
    expect(screen.getByRole("link", { name: "Ca lâm sàng" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Trò chuyện" })).toBeDefined();
    expect(screen.getByRole("link", { name: /Knowledge Base/ })).toBeDefined();

    // SessionList is mounted only while the drawer is open.
    expect(screen.getByTestId("session-list")).toBeDefined();
  });

  it("calls onClose when the backdrop is clicked", () => {
    const onClose = vi.fn();
    render(<Drawer open onClose={onClose} />);

    fireEvent.click(screen.getByTestId("drawer-backdrop"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(<Drawer open onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes from an accessible 44px close button", () => {
    const onClose = vi.fn();
    render(<Drawer open onClose={onClose} />);

    const closeButton = screen.getByRole("button", { name: "Đóng menu" });
    expect(closeButton.className).toContain("h-11");
    expect(closeButton.className).toContain("w-11");

    fireEvent.click(closeButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on route navigation and on session navigation", () => {
    const onClose = vi.fn();
    const { rerender } = render(<Drawer open onClose={onClose} />);

    // Clicking a nav link closes the drawer immediately.
    fireEvent.click(screen.getByRole("link", { name: "Trò chuyện" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    // Clicking a session row (button inside SessionList) closes the drawer,
    // even when the target route keeps the same pathname.
    fireEvent.click(screen.getByRole("button", { name: "Cuộc trò chuyện mẫu" }));
    expect(onClose).toHaveBeenCalledTimes(2);

    // A pathname change while the drawer is open also closes it.
    navigation.pathname = "/chat";
    rerender(<Drawer open onClose={onClose} />);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("moves initial focus into the dialog when it opens", () => {
    render(<Drawer open onClose={() => {}} />);

    expect(document.activeElement).toBe(
      screen.getByRole("link", { name: "Ca lâm sàng" }),
    );
  });

  it("traps Tab and Shift+Tab focus inside the panel", () => {
    render(<Drawer open onClose={() => {}} />);

    const first = screen.getByRole("button", { name: "Đóng menu" });
    const last = screen.getByRole("button", { name: "Cuộc trò chuyện mẫu" });

    // Tab on the last focusable element wraps around to the first.
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    // Shift+Tab on the first focusable element wraps around to the last.
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("locks body scroll while open and restores it on close", () => {
    const { unmount } = render(<Drawer open onClose={() => {}} />);

    expect(document.body.style.overflow).toBe("hidden");

    unmount();

    expect(document.body.style.overflow).toBe("");
  });
});
