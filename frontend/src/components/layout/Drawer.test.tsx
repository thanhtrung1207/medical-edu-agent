import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getChatSessions, type ChatSessionSummary } from "@/lib/api";

// Mutable router state lets tests simulate client-side navigation without
// pulling in the Next.js router context.
const navigation = vi.hoisted(() => ({ pathname: "/", push: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push }),
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

// Only the sessions endpoint is stubbed: the real SessionList mounts inside
// the Drawer so the tests exercise the actual close-on-navigate contract,
// including the failed-load retry button.
vi.mock("@/lib/api", () => ({
  getChatSessions: vi.fn(),
}));

import { Drawer } from "./Drawer";

const SESSIONS: ChatSessionSummary[] = [
  {
    session_id: "session-1",
    topic: "Cuộc trò chuyện mẫu",
    created_at: new Date().toISOString(),
    last_active: new Date().toISOString(),
    message_count: 3,
  },
];

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  navigation.pathname = "/";
  localStorage.clear();
  // Preset identity so SessionList never needs to mint a UUID.
  localStorage.setItem("medical-edu-agent.user-id", "user-uuid");
  document.body.style.overflow = "";
  vi.mocked(getChatSessions).mockResolvedValue(SESSIONS);
});

describe("Drawer", () => {
  it("renders nothing when closed", () => {
    const { container } = render(<Drawer open={false} onClose={() => {}} />);

    expect(container.innerHTML).toBe("");
  });

  it("renders an accessible dialog with nav labels and sessions when open", async () => {
    render(<Drawer open onClose={() => {}} />);

    const dialog = screen.getByRole("dialog", { name: "Menu điều hướng" });
    expect(dialog.getAttribute("id")).toBe("nav-drawer");
    expect(dialog.getAttribute("aria-modal")).toBe("true");

    // Six internal routes plus the external Knowledge Base link.
    expect(screen.getAllByRole("link")).toHaveLength(7);
    expect(screen.getByRole("link", { name: "Ca lâm sàng" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Trò chuyện" })).toBeDefined();
    expect(screen.getByRole("link", { name: /Knowledge Base/ })).toBeDefined();

    // The real recent-sessions section is mounted only while the drawer is
    // open and loads its data.
    expect(await screen.findByText("Cuộc trò chuyện mẫu")).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Bắt đầu cuộc trò chuyện mới" }),
    ).toBeDefined();
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

  it("closes on nav-link, session-row, and route navigation", async () => {
    const onClose = vi.fn();
    const { rerender } = render(<Drawer open onClose={onClose} />);

    // Clicking a nav link closes the drawer immediately.
    fireEvent.click(screen.getByRole("link", { name: "Trò chuyện" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    // Clicking a session row navigates to that chat and closes the drawer,
    // even though the mocked router keeps the pathname unchanged.
    const sessionRow = await screen.findByRole("button", {
      name: /Cuộc trò chuyện mẫu/,
    });
    fireEvent.click(sessionRow);
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(navigation.push).toHaveBeenCalledWith("/chat?session=session-1");

    // A pathname change while the drawer is open also closes it.
    navigation.pathname = "/chat";
    rerender(<Drawer open onClose={onClose} />);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("keeps the drawer open when the SessionList retry button is used", async () => {
    // Initial load fails; the retry click succeeds so the list becomes usable.
    vi.mocked(getChatSessions)
      .mockRejectedValueOnce(new Error("Chat sessions request failed: 500"))
      .mockResolvedValueOnce(SESSIONS);
    const onClose = vi.fn();
    render(<Drawer open onClose={onClose} />);

    const retry = await screen.findByRole("button", { name: "Thử lại" });
    fireEvent.click(retry);

    // Retry is not navigation: it only refetches, and the drawer stays open
    // so the recovered session list remains visible.
    await screen.findByRole("button", { name: /Cuộc trò chuyện mẫu/ });
    expect(onClose).not.toHaveBeenCalled();
    expect(getChatSessions).toHaveBeenCalledTimes(2);

    // Starting a new conversation is navigation and still closes the drawer.
    fireEvent.click(
      screen.getByRole("button", { name: "Bắt đầu cuộc trò chuyện mới" }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(navigation.push).toHaveBeenCalledWith(
      expect.stringContaining("/chat?new="),
    );
  });

  it("moves initial focus into the dialog when it opens", () => {
    render(<Drawer open onClose={() => {}} />);

    expect(document.activeElement).toBe(
      screen.getByRole("link", { name: "Ca lâm sàng" }),
    );
  });

  it("traps Tab and Shift+Tab focus inside the panel", async () => {
    render(<Drawer open onClose={() => {}} />);

    const first = screen.getByRole("button", { name: "Đóng menu" });
    // Wait for the session rows to load so the last focusable element is
    // stable.
    const last = await screen.findByRole("button", {
      name: /Cuộc trò chuyện mẫu/,
    });

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
