import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockUseAuth = vi.fn();
vi.mock("./AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

import { SecurityNoticeBanner } from "./SecurityNoticeBanner";

afterEach(cleanup);

describe("SecurityNoticeBanner", () => {
  it("renders nothing when there is no notice", () => {
    mockUseAuth.mockReturnValue({
      securityNotice: null,
      dismissSecurityNotice: vi.fn(),
    });
    render(<SecurityNoticeBanner />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders the notice message and dismisses on click", () => {
    const dismiss = vi.fn();
    mockUseAuth.mockReturnValue({
      securityNotice: "Phiên đăng nhập đã bị thu hồi vì lý do an ninh.",
      dismissSecurityNotice: dismiss,
    });
    render(<SecurityNoticeBanner />);

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(
      "Phiên đăng nhập đã bị thu hồi vì lý do an ninh.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Đóng" }));
    expect(dismiss).toHaveBeenCalledTimes(1);
  });
});
